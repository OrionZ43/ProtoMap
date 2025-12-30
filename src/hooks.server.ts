import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    // Переменные для принятия решений
    let uid = '';
    let email: string | undefined = '';
    let tokenHasBanClaim = false;
    let dbIsBanned = false;
    let userData: any = null;

    try {
        // 1. Проверяем токен
        // checkRevoked: true - важно для мгновенного бана
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);
        uid = decodedClaims.uid;
        email = decodedClaims.email;
        tokenHasBanClaim = decodedClaims.banned === true;

    } catch (e: any) {
        // === [ ZOMBIE PROTOCOL: Если токен отозван (revoked) ] ===
        if (e.code === 'auth/session-cookie-revoked') {
            try {
                // Читаем данные из "мертвого" токена
                const zombieClaims = await authAdmin.verifySessionCookie(sessionCookie, false);
                uid = zombieClaims.uid;
                email = zombieClaims.email;
                tokenHasBanClaim = true; // Считаем, что отозванный токен подозрителен
                console.log("Hooks: Обнаружен отозванный токен для", uid);
            } catch (inner) {
                // Если токен совсем мертв - просто сбрасываем
                return forceLogout(event, "Dead Token");
            }
        } else {
            // Любая другая ошибка (истек срок, неверная подпись)
            return forceLogout(event, "Invalid Token");
        }
    }

    // 2. Получаем АКТУАЛЬНЫЙ статус из БД (Source of Truth)
    if (uid) {
        try {
            const userDoc = await firestoreAdmin.collection('users').doc(uid).get();
            userData = userDoc.data();
            dbIsBanned = userData?.isBanned === true;
        } catch (dbError) {
            console.error("Hooks: DB Error", dbError);
            // Если база лежит, лучше пустить (или показать ошибку), но не циклить.
            // Допустим, считаем, что не забанен, если не можем проверить.
        }
    }

    // 3. === ЛОГИКА МАРШРУТИЗАЦИИ ===

    // СЦЕНАРИЙ А: Реально забанен (в БД стоит бан)
    if (dbIsBanned) {
        // Если юзер не на странице бана - редирект туда
        if (!event.url.pathname.startsWith('/banned')) {
            return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
        }
    }

    // СЦЕНАРИЙ Б: Не забанен в БД (Амнистия или обычный юзер)
    else {
        // Проблема: В БД чисто, но токен "грязный" (содержит banned: true или был отозван).
        // С таким токеном нельзя работать (Cloud Functions его отвергнут).
        // Решение: Принудительный разлогин, чтобы получить чистый токен.
        if (tokenHasBanClaim) {
            console.log("Hooks: Конфликт версий (Амнистия). Сброс сессии.");
            return forceLogout(event, "Amnesty Reset");
        }

        // Если юзер на странице бана, но он чист - выпускаем
        if (event.url.pathname.startsWith('/banned')) {
            return new Response('Redirect', { status: 303, headers: { Location: '/' } });
        }
    }

    // 4. Заполняем locals (если дошли сюда)
    if (userData) {
        event.locals.user = {
            uid: uid,
            email: email,
            username: userData.username || 'Unknown',
            emailVerified: userData.emailVerified || false, // Если есть в базе
            isBanned: dbIsBanned
        };
    } else if (uid) {
        // Если юзера нет в базе, но есть токен (странно)
        // Пускаем как анонима или сбрасываем. Давай сбросим для надежности.
        return forceLogout(event, "User not in DB");
    }

    return resolve(event);
};

// Хелпер для сброса сессии и редиректа
function forceLogout(event: any, reason: string) {
    console.log(`Hooks: Force Logout (${reason})`);

    // Удаляем куку
    event.cookies.delete('__session', { path: '/' });

    // Обнуляем locals
    event.locals.user = null;

    // Если это API запрос - возвращаем JSON, иначе редирект
    if (event.url.pathname.startsWith('/api')) {
        return new Response(JSON.stringify({ error: 'Session expired' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Редирект на логин, чтобы юзер вошел заново и получил ЧИСТЫЙ токен
    return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
}