import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    if (!adminList.includes(locals.user.uid)) {
        throw error(403, 'Доступ запрещен. Вы не обладаете правами администратора.');
    }

    return {
        user: locals.user
    };
};

export const actions: Actions = {
    create: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) {
            return fail(403, { message: 'Нет прав' });
        }

        const data = await request.formData();
        const title = data.get('title') as string;
        const content = data.get('content') as string;
        const imageUrl = data.get('imageUrl') as string;
        const tagsString = data.get('tags') as string;
        const lang = (data.get('lang') as string) || 'ru';

        if (!title || !content) {
            return fail(400, { message: 'Заголовок и текст обязательны', title, content, imageUrl, tagsString });
        }

        try {
            const tags = tagsString
                ? tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0)
                : [];

            await firestoreAdmin.collection('news').add({
                title,
                content,
                image: imageUrl || null,
                tags,
                lang,
                createdAt: FieldValue.serverTimestamp(),
                authorId: locals.user.uid,
                authorName: locals.user.username
            });

            return { success: true };

        } catch (err) {
            console.error('Ошибка публикации новости:', err);
            return fail(500, { message: 'Ошибка сервера при сохранении' });
        }
    }
};