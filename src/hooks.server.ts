import { authAdmin, firestoreAdmin } from '$lib/server/firebase.admin';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        event.locals.user = null;
        return resolve(event);
    }

    try {
        // 1. Проверяем токен
        // checkRevoked: true обязательно, чтобы поймать момент нажатия "БАН" в админке
        const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie, true);

        // 2. Получаем "Свежую правду" из БД
        const userDocRef = firestoreAdmin.collection('users').doc(decodedClaims.uid);
        const userDocSnap = await userDocRef.get();
        const userData = userDocSnap.data();

        // 3. === АМНИСТИЯ (Конфликт версий) ===
        // Токен говорит "Забанен", а База говорит "Чист".
        // Токен "грязный". Нельзя пускать юзера с ним, иначе Security Rules не дадут писать в базу.
        // РЕШЕНИЕ: Принудительный разлогин. Пусть зайдет и получит чистый токен.
        if (decodedClaims.banned === true && (!userData || userData.isBanned === false)) {
            console.log("Hooks: Обнаружен старый токен бана после амнистии. Сброс сессии.");
            event.cookies.delete('__session', { path: '/' });
            event.locals.user = null;
            return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }

        // 4. === РЕАЛЬНЫЙ БАН ===
        // Если в базе стоит бан (неважно, что в токене)
        if (userData?.isBanned === true) {
            // Если он еще не на странице бана — редирект
            if (!event.url.pathname.startsWith('/banned')) {
                return new Response('Redirect', { status: 303, headers: { Location: '/banned' } });
            }
        }

        // 5. === ОБЫЧНЫЙ ЮЗЕР ===
        // Если бана в базе нет, но он пытается зайти на /banned (по старой памяти)
        else if (event.url.pathname.startsWith('/banned')) {
            return new Response('Redirect', { status: 303, headers: { Location: '/' } });
        }

        // Заполняем сессию
        if (userData) {
            event.locals.user = {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                username: userData.username || 'Unknown',
                emailVerified: decodedClaims.email_verified || false,
                isBanned: userData.isBanned || false
            };
        } else {
            event.locals.user = null;
        }

    } catch (e: any) {
        // === [ ZOMBIE PROTOCOL ] ===
        // Токен был отозван (Revoked) через админку.
        if (e.code === 'auth/session-cookie-revoked') {
            try {
                // Читаем UID из "мертвого" токена
                const zombieClaims = await authAdmin.verifySessionCookie(sessionCookie, false);

                // Проверяем, забанен ли он СЕЙЧАС в базе?
                const zDoc = await firestoreAdmin.collection('users').doc(zombieClaims.uid).get();
                const zData = zDoc.data();

                if (zData?.isBanned === true) {
                    // РЕАЛЬНЫЙ БАН: Пускаем только на /banned
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
                    // ЛОЖНАЯ ТРЕВОГА (Амнистия):
                    // Токен отозван, но в базе бана нет. Значит, это была амнистия (unbanUser делает revoke тоже?)
                    // Или просто старая сессия.
                    // В любом случае токен мертв. Сбрасываем куку, редирект на логин.
                    event.cookies.delete('__session', { path: '/' });
                    event.locals.user = null;
                    return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
                }
            } catch (inner) {
                console.error("Zombie Protocol Failed:", inner);
            }
        }

        // Остальные ошибки (истек срок и т.д.) -> Разлогин
        event.cookies.delete('__session', { path: '/' });
        event.locals.user = null;

        if (['/admin', '/profile', '/casino'].some(p => event.url.pathname.startsWith(p))) {
             return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
        }
    }

    return resolve(event);
};