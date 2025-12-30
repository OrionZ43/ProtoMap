import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    // 1. Нет куки — аноним
    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        // 2. Жесткая проверка токена.
        // Если токен отозван (Revoked) — это сразу Error.
        // Мы НЕ ловим ошибку, чтобы "спасти" зомби. Пусть умирает.
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        // 3. Получаем данные из БД (Source of Truth)
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();
        const userData = userDocSnap.data();

        // 4. Определение статуса бана
        // Бан есть, если он есть в БД ИЛИ если он "выжжен" в токене
        const isBanned = (userData?.isBanned === true) || (decodedClaims.banned === true);

        // === БЛОКИРОВКА ===
        if (isBanned) {
            // Если юзер забанен, но токен все еще валиден (не отозван)
            // Мы просто держим его на странице /banned
            if (!event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
            }
        }
        // === ОБЫЧНЫЙ ЮЗЕР ===
        else {
            // Если НЕ забанен, но зашел на /banned — выгоняем на главную
            if (event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/' } });
            }
        }

        // Заполняем сессию
        if (userData) {
            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData.username || 'Unknown',
                emailVerified: decodedClaims.email_verified || false,
                isBanned: isBanned
            };
        } else {
            event.locals.user = null; // Токен есть, юзера в базе нет
        }

    } catch (e: any) {
        // 5. ОБРАБОТКА ОШИБОК (Включая Revoked Token)
        // Если мы здесь — токен невалиден (истек, подделка или ОТОЗВАН админом).
        // Единственное правильное действие — убить сессию.

        console.log("Auth Hook: Invalid/Revoked Token. Destroying session.");

        // Удаляем куку с параметрами (важно для надежности)
        event.cookies.delete('__session', { path: '/' });

        // На всякий случай чистим locals
        event.locals.user = null;

        // Если это API-запрос — 401
        if (event.url.pathname.startsWith('/api')) {
             return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
        }

        // Если юзер уже на логине — пусть там и остается
        if (event.url.pathname === '/login' || event.url.pathname === '/register') {
            return resolve(event);
        }

        // Иначе — редирект на вход
        return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
    }

    return resolve(event);
};