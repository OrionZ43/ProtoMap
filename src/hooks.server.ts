import { authAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        event.locals.user = {
            uid: decodedClaims.uid,
            email: decodedClaims.email,
            name: decodedClaims.name
        };
        console.log("Хук: найден валидный пользователь в сессии:", event.locals.user.name);
    } catch (e) {
        event.locals.user = null;
        console.log("Хук: найдена невалидная сессионная куки.");
    }

    return resolve(event);
};