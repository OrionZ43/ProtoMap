import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(303, '/login');
    }

    try {
        const userDoc = await firestoreAdmin.collection('users').doc(user.uid).get();
        if (!userDoc.exists) throw error(404, 'User not found');

        const userData = userDoc.data()!;

        return {
            email: user.email,
            emailVerified: user.emailVerified,
            telegram_id: userData.telegram_id || null,
            telegram_username: userData.telegram_username || null
        };
    } catch (e) {
        console.error("Security Load Error:", e);
        throw error(500, "Failed to load security settings");
    }
};