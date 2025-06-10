import { authAdmin } from '$lib/server/firebase.admin';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const { idToken } = await request.json();

    const expiresIn = 60 * 60 * 24 * 5 * 1000;

    try {
        const sessionCookie = await authAdmin.createSessionCookie(idToken, { expiresIn });

        cookies.set('__session', sessionCookie, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: expiresIn / 1000,
        });

        return json({ status: 'success' });
    } catch (e) {
        console.error("Ошибка создания сессионной куки:", e);
        return json({ status: 'error', message: 'Не удалось создать сессию' }, { status: 401 });
    }
};

export const DELETE: RequestHandler = async ({ cookies }) => {
    cookies.delete('__session', { path: '/' });
    return json({ status: 'success' });
};