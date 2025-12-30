import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    // Если куки нет — сразу аноним
    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        // 1. Пытаемся проверить токен ПОЛНОСТЬЮ (включая проверку на отзыв/бан на серверах Google)
        // Это гарантирует, что токен жив и валиден.
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        // 2. Проверка Custom Claims (быстрая, без БД)
        // Если бан только что прилетел и токен еще валиден (не отозван), но в нем уже есть метка
        if (decodedClaims.banned === true) {
            if (!event.url.pathname.startsWith('/banned')) {
                // Принудительная переадресация в изолятор
                return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
            }
        }

        // Если юзер НЕ забанен (метки нет), но пытается зайти на /banned — выпускаем на волю
        if (!decodedClaims.banned && event.url.pathname.startsWith('/banned')) {
            return new Response('Redirect', { status: 303, headers: { Location: '/' } });
        }

        // 3. Синхронизация с БД (для актуального username/avatar)
        // Если ты хочешь сэкономить чтения, можно это завернуть в условие,
        // но для консистентности данных лучше оставить.
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();
        const userData = userDocSnap.data();

        // Fallback: В токене метки нет (старый токен), но в базе бан уже стоит
        if (userData?.isBanned && !event.url.pathname.startsWith('/banned')) {
             return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
        }

        if (userData) {
            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData.username || 'Unknown',
                isBanned: userData.isBanned || false
            };
        } else {
            // Токен валиден, но юзера нет в базе (удален?)
            event.locals.user = null;
        }

    } catch (e: any) {
        // === [ ZOMBIE PROTOCOL: START ] ===
        // Ошибка 'auth/session-cookie-revoked' означает, что админ нажал "ЗАБЛОКИРОВАТЬ" (revoke tokens).
        // Мы хотим показать юзеру страницу бана, а не просто выкинуть его.

        if (e.code === 'auth/session-cookie-revoked') {
            try {
                // Проверяем токен "вхолостую" (checkRevoked: false).
                // Это парсит JWT локально, игнорируя статус отзыва на сервере.
                const zombieClaims = await authAdmin.verifySessionCookie(sessionCookie, false);

                if (zombieClaims.banned === true) {
                    // АГА! Это наш клиент.

                    // Если он ломится куда-то кроме бана — редирект
                    if (!event.url.pathname.startsWith('/banned')) {
                        return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
                    }

                    // Пускаем "Зомби" только на страницу /banned.
                    // Наполняем locals минимальными данными для загрузки страницы бана.
                    event.locals.user = {
                        uid: zombieClaims.uid,
                        email: zombieClaims.email,
                        username: 'BANNED_SUBJECT',
                        isBanned: true
                    };

                    // Пропускаем запрос дальше (на load функцию страницы banned)
                    return resolve(event);
                }
            } catch (innerError) {
                console.error("Zombie check failed (Token completely dead):", innerError);
            }
        }
        // === [ ZOMBIE PROTOCOL: END ] ===

        // Любая другая ошибка (истек срок, неверная подпись и т.д.) -> Разлогин
        // console.error("Auth Error:", e.code || e.message); // Можно раскомментить для дебага

        event.cookies.delete('__session', { path: '/' });
        event.locals.user = null;

        // Если юзер был на защищенном роуте — кидаем на логин
        if (event.url.pathname.startsWith('/admin') || event.url.pathname.startsWith('/profile') || event.url.pathname.startsWith('/casino')) {
             return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }
    }

    return resolve(event);
};