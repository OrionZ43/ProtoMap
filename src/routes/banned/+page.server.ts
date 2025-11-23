import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { firestoreAdmin } from '$lib/server/firebase.admin';

export const load: PageServerLoad = async ({ locals }) => {
    // Если пользователь не залогинен - на главную (ему тут делать нечего)
    if (!locals.user) {
        throw redirect(303, '/');
    }

    // Проверяем, забанен ли он реально (чтобы не заходили просто так посмотреть)
    const userDoc = await firestoreAdmin.collection('users').doc(locals.user.uid).get();
    const userData = userDoc.data();

    if (!userData || !userData.isBanned) {
        // Если не забанен - пинок на главную
        throw redirect(303, '/');
    }

    return {
        uid: locals.user.uid,
        reason: userData.banReason || 'Причина не указана (потому что я так захотел).',
        bannedUntil: userData.bannedUntil || null // null = навсегда
    };
};