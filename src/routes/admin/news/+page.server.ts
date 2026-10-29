// src/routes/admin/news/+page.server.ts
//
// «Новости» в админке: публикация в ленту /news и последние публикации.
// Ошибки — кодами; текст для них страница берёт из локалей (admin_news.result).

import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

/** Сколько последних публикаций показывать под формой. */
const RECENT = 8;

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    if (!adminList.includes(locals.user.uid)) {
        throw error(403, 'Доступ запрещен. Вы не обладаете правами администратора.');
    }

    const recent = await firestoreAdmin.collection('news').orderBy('createdAt', 'desc').limit(RECENT).get()
        .then((s) => s.docs.map((d) => ({
            id: d.id,
            title: String(d.get('title') ?? ''),
            lang: String(d.get('lang') ?? 'ru'),
            image: (d.get('image') as string | null) ?? null,
            createdAt: d.get('createdAt')?.toMillis?.() ?? null
        })))
        .catch((e) => {
            console.error('[admin/news] последние публикации:', e);
            return [];
        });

    return {
        user: locals.user,
        recent
    };
};

export const actions: Actions = {
    create: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) {
            return fail(403, { code: 'forbidden' });
        }

        const data = await request.formData();
        const title = (data.get('title') as string ?? '').trim();
        const content = (data.get('content') as string ?? '').trim();
        const imageUrl = (data.get('imageUrl') as string ?? '').trim();
        const tagsString = data.get('tags') as string;
        const lang = data.get('lang') === 'en' ? 'en' : 'ru';

        if (!title || !content) {
            return fail(400, { code: 'required' });
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
            return fail(500, { code: 'failed' });
        }
    }
};
