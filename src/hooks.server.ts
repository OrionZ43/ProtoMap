import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    // 1. Если куки нет — сразу аноним
    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        // 2. Проверяем токен на валидность и отзыв (revocation)
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        // 3. Загружаем реальный статус из БД
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();
        const userData = userDocSnap.data();

        // --- [ AMNESTY CHECK: РАЗРЫВАЕМ ПЕТЛЮ ] ---
        // Если в токене стоит бан, а в БД его НЕТ (амнистия), токен "грязный".
        if (decodedClaims.banned === true && !userData?.isBanned) {
            console.log(`[System] Амнистия для ${decodedClaims.uid}. Сброс грязной сессии.`);
            event.cookies.delete('__session', { path: '/' });
            return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }

        // --- [ BAN ENFORCEMENT ] ---
        // Если забанен (в токене или в БД), не пускаем никуда кроме /banned
        const isActuallyBanned = decodedClaims.banned === true || userData?.isBanned === true;

        if (isActuallyBanned) {
            if (!event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
            }
        } else {
            // Если НЕ забанен, но сидит в тюрьме — выпускаем на волю
            if (event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/' } });
            }
        }

        if (userData) {
            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData.username || 'Unknown',
                isBanned: !!isActuallyBanned
            };
        } else {
            event.locals.user = null;
        }

    } catch (e: any) {
        // --- [ ZOMBIE PROTOCOL ] ---
        // Срабатывает, если токен отозван (админ нажал "БАН")
        if (e.code === 'auth/session-cookie-revoked') {
            try {
                // Читаем токен без запроса к Google (checkRevoked: false)
                const zombieClaims = await authAdmin.verifySessionCookie(sessionCookie, false);

                // Проверяем актуальность бана в базе
                const userDoc = await firestoreAdmin.collection('users').doc(zombieClaims.uid).get();
                const userData = userDoc.data();

                if (userData?.isBanned) {
                    // Это реальный бан. Пускаем "Зомби" только в изолятор.
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
                    // Амнистия! Токен отозван, но бан в базе снят.
                    // Просто заставляем перелогиниться.
                    event.cookies.delete('__session', { path: '/' });
                    return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
                }
            } catch (innerError) {
                console.error("Zombie recovery failed:", innerError);
            }
        }

        // Любая другая ошибка сессии (истекла, повреждена)
        event.cookies.delete('__session', { path: '/' });
        event.locals.user = null;

        // Если пытался зайти в личный кабинет или админку без прав
        if (event.url.pathname.startsWith('/admin') || event.url.pathname.startsWith('/profile')) {
             return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }
    }

    return resolve(event);
};