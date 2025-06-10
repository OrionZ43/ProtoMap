import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user;

    if (!user) {
        throw redirect(303, '/login');
    }

    const userDocRef = firestoreAdmin.collection('users').doc(user.uid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
        throw error(404, 'Профиль в базе данных не найден.');
    }

    const userData = userDocSnap.data();

    return {
        profile: {
            username: userData?.username || '',
            avatar_url: userData?.avatar_url || '',
            social_link: userData?.social_link || '',
            about_me: userData?.about_me || ''
        }
    };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const user = locals.user;

        if (!user) {
            return fail(401, { error: 'Необходимо войти в систему.' });
        }

        const data = await request.formData();
        const avatar_url = data.get('avatar_url') as string;
        const social_link = data.get('social_link') as string;
        const about_me = data.get('about_me') as string;

        try {
            const userDocRef = firestoreAdmin.collection('users').doc(user.uid);
            await userDocRef.update({
                avatar_url,
                social_link,
                about_me
            });
            console.log(`Профиль для ${user.name} (UID: ${user.uid}) успешно обновлен.`);
        } catch (e) {
            console.error("Ошибка обновления профиля в Firestore:", e);
            return fail(500, { error: 'Ошибка сервера при сохранении профиля.' });
        }

        throw redirect(303, `/profile/${user.name}`);
    }
};