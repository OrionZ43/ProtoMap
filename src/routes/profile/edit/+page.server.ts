import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user;

    if (!user) {
        throw redirect(303, '/login');
    }

    const userDocRef = firestoreAdmin.collection('users').doc(user.uid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
        throw error(500, 'Профиль пользователя не найден в базе данных.');
    }

    const userData = userDocSnap.data();

    if (!userData) {
         throw error(500, 'Не удалось получить данные профиля из базы.');
    }

    return {
        profile: {
            uid: user.uid,
            username: userData.username || '',
            avatar_url: userData.avatar_url || '',
            about_me: userData.about_me || '',
            socials: {
                telegram: userData.socials?.telegram || '',
                discord: userData.socials?.discord || '',
                vk: userData.socials?.vk || '',
                twitter: userData.socials?.twitter || '',
                website: userData.socials?.website || ''
            }
        }
    };
};