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