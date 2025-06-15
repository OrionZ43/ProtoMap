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
        throw error(500, 'Профиль пользователя не найден в базе данных, хотя он аутентифицирован.');
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
            social_link: userData.social_link || '',
            about_me: userData.about_me || ''
        }
    };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const user = locals.user;

        if (!user || !user.uid || !user.username) {
            return fail(401, { error: 'Необходимо войти в систему или данные пользователя неполные.' });
        }

        const formData = await request.formData();

        const avatar_url_from_form = formData.get('avatar_url') as string | null;
        const social_link_from_form = formData.get('social_link') as string | null;
        const about_me_from_form = formData.get('about_me') as string | null;
        const fieldsToUpdate: { [key: string]: any } = {};
            fieldsToUpdate.avatar_url = avatar_url_from_form;
        if (social_link_from_form !== null) {
            fieldsToUpdate.social_link = social_link_from_form;
        }

        if (about_me_from_form !== null) {
            fieldsToUpdate.about_me = about_me_from_form;
        }

        if (Object.keys(fieldsToUpdate).length === 0) {
            throw redirect(303, `/profile/${user.username}`);
        }

        try {
            const userDocRef = firestoreAdmin.collection('users').doc(user.uid);
            await userDocRef.update(fieldsToUpdate);

            console.log(`Профиль для ${user.username} (UID: ${user.uid}) успешно обновлен. Данные:`, fieldsToUpdate);
        } catch (e: any) {
            console.error("Ошибка обновления профиля в Firestore:", e);
            return fail(500, {
                error: 'Ошибка сервера при сохранении профиля.',
                formData: {
                    avatar_url: avatar_url_from_form,
                    social_link: social_link_from_form,
                    about_me: about_me_from_form
                }
            });
        }
        throw redirect(303, `/profile/${user.username}`);
    }
};