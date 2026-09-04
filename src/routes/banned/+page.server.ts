import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { firestoreAdmin } from '$lib/server/firebase.admin';

export const load: PageServerLoad = async ({ locals, cookies }) => {
    if (!locals.user) throw redirect(303, '/');

    const userDoc = await firestoreAdmin.collection('users').doc(locals.user.uid).get();
    const userData = userDoc.data();

    if (!userData || !userData.isBanned) {
        cookies.delete('__session', { path: '/' });
        throw redirect(303, '/login');
    }

    return {
        uid: locals.user.uid,
        reason: userData.banReason || 'Protocol Violation.',
        bannedUntil: userData.bannedUntil || null,
        // Пункт 2.9 Соглашения даёт право обжаловать блокировку, кроме
        // блокировок по пункту 2.3 (безопасность детей) — там решение
        // окончательное. Старые баны поля не имеют: считаем их обжалуемыми.
        appealable: userData.banCategory !== 'child_safety'
    };
};