import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();

        if (userDocSnap.exists) {
            const userData = userDocSnap.data();

            // === [ BANHAMMER LOGIC ] ===
            // Если поле isBanned существует и равно true
            if (userData?.isBanned) {
                // Если пользователь пытается зайти куда угодно, кроме страницы бана
                if (!event.url.pathname.startsWith('/banned')) {
                    console.log(`Хук: Забаненный пользователь ${userData.username} перенаправлен в изолятор.`);
                    return new Response('Redirect', {
                        status: 303,
                        headers: { Location: '/banned' }
                    });
                }
            } else {
                // Если пользователь НЕ забанен, но находится на странице /banned -> выкидываем на главную
                // (чтобы не сидели в тюрьме просто так)
                if (event.url.pathname.startsWith('/banned')) {
                    return new Response('Redirect', {
                        status: 303,
                        headers: { Location: '/' }
                    });
                }
            }
            // ===========================

            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData?.username || null,
            };
            console.log("Хук: найден валидный пользователь в сессии (из Firestore):", event.locals.user.username);
        } else {
            console.error(`Хук: Пользователь ${decodedClaims.uid} аутентифицирован, но не найден в Firestore.`);
            event.locals.user = null;
        }
    } catch (e) {
        console.error("Хук: ошибка при проверке сессионной куки или загрузке данных пользователя:", e);
        event.locals.user = null;
    }

    return resolve(event);
};