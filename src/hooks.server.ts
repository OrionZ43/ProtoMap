import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        // 1. Проверяем валидность токена
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        // 2. СРАЗУ читаем актуальные данные из БД (Source of Truth)
        // Это решает проблему цикла: даже если в токене старое клеймо, база скажет правду.
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();
        const userData = userDocSnap.data();

        // 3. Определяем статус бана СТРОГО по базе данных (если запись есть)
        // Если записи нет (странно), верим токену.
        const isBannedReal = userData ? (userData.isBanned === true) : (decodedClaims.banned === true);

        // 4. Логика Редиректов (The Traffic Controller)
        if (isBannedReal) {
            // Если забанен реально — не пускаем никуда кроме /banned
            if (!event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
            }
        } else {
            // Если НЕ забанен — не пускаем на /banned (выпинываем на волю)
            if (event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/' } });
            }
        }

        // 5. Заполняем сессию
        if (userData) {
            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData.username || 'Unknown',
                emailVerified: decodedClaims.email_verified || false,
                isBanned: isBannedReal // Передаем актуальный статус
            };
        } else {
            event.locals.user = null;
        }

    } catch (e: any) {
        // === [ ZOMBIE PROTOCOL ] ===
        // Если токен отозван (админ нажал БАН), Firebase кидает ошибку.
        // Мы ловим её, чтобы мягко отправить юзера в тюрьму, а не разлогинивать.
        if (e.code === 'auth/session-cookie-revoked') {
            try {
                // Читаем "мертвый" токен локально
                const zombieClaims = await authAdmin.verifySessionCookie(sessionCookie, false);

                // Проверяем актуальный статус в БД для Зомби тоже!
                // Вдруг мы его разбанили, но токен все еще считается отозванным?
                const zDoc = await firestoreAdmin.collection('users').doc(zombieClaims.uid).get();
                const zData = zDoc.data();

                if (zData?.isBanned === true) {
                    // Реально забанен -> в тюрьму
                    if (!event.url.pathname.startsWith('/banned')) {
                        return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
                    }
                    event.locals.user = {
                        uid: zombieClaims.uid,
                        email: zombieClaims.email,
                        username: 'BANNED_SUBJECT',
                        isBanned: true
                    };
                    return resolve(event);
                } else {
                    // Если в базе он уже разбанен (isBanned: false), но токен отозван ->
                    // Значит, ему нужно просто перелогиниться, чтобы получить новый чистый токен.
                    // Удаляем куку, пусть входит заново.
                    event.cookies.delete('__session', { path: '/' });
                    event.locals.user = null;
                    return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
                }
            } catch (inner) {
                console.error("Zombie check died:", inner);
            }
        }

        // Любые другие ошибки -> полный сброс
        console.error("Auth Hook Error:", e.code || e.message);
        event.cookies.delete('__session', { path: '/' });
        event.locals.user = null;

        if (['/admin', '/profile', '/casino'].some(p => event.url.pathname.startsWith(p))) {
             return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }
    }

    return resolve(event);
};