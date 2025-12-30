import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        // 1. Проверка живого токена
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        // Получаем свежие данные из БД
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();
        const userData = userDocSnap.data();

        const isBanned = userData?.isBanned || decodedClaims.banned === true;

        if (isBanned) {
            if (!event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
            }
        } else if (event.url.pathname.startsWith('/banned')) {
            // Если НЕ забанен, но ломится на страницу бана — на главную
            return new Response('Redirect', { status: 303, headers: { Location: '/' } });
        }

        if (userData) {
            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData.username || 'Unknown',
                isBanned: !!isBanned
            };
        } else {
            event.locals.user = null;
        }

    } catch (e: any) {
        // === [ ИСПРАВЛЕННЫЙ ZOMBIE PROTOCOL ] ===
        if (e.code === 'auth/session-cookie-revoked') {
            try {
                // Читаем claims без проверки на отзыв
                const zombieClaims = await authAdmin.verifySessionCookie(sessionCookie, false);

                // КРИТИЧЕСКИЙ ФИКС: Проверяем реальный статус в БД перед редиректом
                const dbSnap = await firestoreAdmin.collection('users').doc(zombieClaims.uid).get();
                const dbData = dbSnap.data();

                if (dbData?.isBanned) {
                    // Если в базе реально БАН — шлем в изолятор
                    if (!event.url.pathname.startsWith('/banned')) {
                        return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
                    }
                    event.locals.user = { uid: zombieClaims.uid, email: zombieClaims.email, username: 'BANNED_SUBJECT', isBanned: true };
                    return resolve(event);
                } else {
                    // Если в базе БАНА НЕТ, значит его только что разбанили!
                    // Удаляем плохую куку и шлем на логин, чтобы он получил новую
                    console.log(`User ${zombieClaims.uid} was unbanned. Clearing revoked session.`);
                    event.cookies.delete('__session', { path: '/' });
                    return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
                }
            } catch (inner) {
                console.error("Critical Auth failure:", inner);
            }
        }

        // Для всех остальных ошибок (истек срок и т.д.)
        event.cookies.delete('__session', { path: '/' });
        event.locals.user = null;

        if (event.url.pathname.startsWith('/admin') || event.url.pathname.startsWith('/profile') || event.url.pathname.startsWith('/casino')) {
             return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }
    }

    return resolve(event);
};