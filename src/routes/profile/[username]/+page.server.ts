import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { FieldPath } from 'firebase-admin/firestore';

export type Comment = {
    id: string;
    text: string;
    author_uid: string;
    author_username: string;
    author_avatar_url: string;
    author_equipped_frame: string | null;
    createdAt: Date;
    likes: string[];
    parentId: string | null;
    replies?: Comment[];
};

export const load: PageServerLoad = async ({ params, setHeaders }) => {
    const username = params.username;

    try {
        const usersRef = firestoreAdmin.collection('users');
        const userSnapshot = await usersRef.where('username', '==', username).limit(1).get();

        if (userSnapshot.empty) {
            throw error(404, 'Профиль не найден');
        }

        const userProfileDoc = userSnapshot.docs[0];
        const userProfileData = userProfileDoc.data();

        // Загружаем комментарии
        const commentsRef = userProfileDoc.ref.collection('comments').orderBy('createdAt', 'desc').limit(50);
        const commentsSnapshot = await commentsRef.get();

        // 1. Собираем сырые данные (С ЗАЩИТОЙ)
        const rawComments: Comment[] = [];

        commentsSnapshot.docs.forEach(doc => {
            try {
                const data = doc.data();
                // Защита от битых дат
                let createdDate = new Date();
                if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                    createdDate = data.createdAt.toDate();
                }

                rawComments.push({
                    id: doc.id,
                    text: data.text || '',
                    author_uid: data.author_uid || '',
                    author_username: data.author_username || 'Аноним',
                    author_avatar_url: data.author_avatar_url || '',
                    author_equipped_frame: data.author_equipped_frame || null,
                    createdAt: createdDate,
                    likes: Array.isArray(data.likes) ? data.likes : [],
                    parentId: data.parentId || null,
                    replies: []
                });
            } catch (err) {
                console.warn(`Skipping broken comment ${doc.id}:`, err);
            }
        });

        // 2. Актуализируем данные авторов
        const authorUids = [...new Set(rawComments.map(c => c.author_uid).filter(Boolean))];
        const authorsData = new Map<string, any>();

        if (authorUids.length > 0) {
            // Разбиваем на пачки по 10 (FireStore in-query limit)
            const chunkSize = 10;
            for (let i = 0; i < authorUids.length; i += chunkSize) {
                const chunk = authorUids.slice(i, i + chunkSize);
                try {
                    const snaps = await firestoreAdmin.collection('users')
                        .where(FieldPath.documentId(), 'in', chunk)
                        .get();
                    snaps.forEach(d => authorsData.set(d.id, d.data()));
                } catch (e) {
                    console.error("Error fetching authors chunk:", e);
                }
            }
        }

        // 3. Строим дерево
        const commentMap = new Map<string, Comment>();
        const rootComments: Comment[] = [];

        rawComments.forEach(c => {
            const freshAuthor = authorsData.get(c.author_uid);
            if (freshAuthor) {
                c.author_username = freshAuthor.username || c.author_username;
                c.author_avatar_url = freshAuthor.avatar_url || c.author_avatar_url;
                c.author_equipped_frame = freshAuthor.equipped_frame || c.author_equipped_frame;
            }
            commentMap.set(c.id, c);
        });

        rawComments.forEach(c => {
            if (c.parentId && commentMap.has(c.parentId)) {
                const parent = commentMap.get(c.parentId)!;
                if (!parent.replies) parent.replies = [];
                parent.replies.push(c);
            } else {
                rootComments.push(c);
            }
        });

        // Сортировка ответов
        rootComments.forEach(root => {
            if (root.replies && root.replies.length > 0) {
                root.replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            }
        });

        setHeaders({ 'Cache-Control': 'public, max-age=60' });

        return {
            profile: {
                uid: userProfileDoc.id,
                username: userProfileData.username,
                avatar_url: userProfileData.avatar_url,
                about_me: userProfileData.about_me || '',
                status: userProfileData.status || null,
                socials: userProfileData.socials || {},
                equipped_frame: userProfileData.equipped_frame || null,
                equipped_bg: userProfileData.equipped_bg || null
            },
            comments: rootComments
        };

    } catch (e: any) {
        console.error(`Profile Load Error [${username}]:`, e);
        // Если профиль не найден - 404, иначе 500
        if (e.status === 404 || e.message === 'Профиль не найден') {
            throw error(404, 'Профиль не найден');
        }
        throw error(500, 'Ошибка загрузки профиля');
    }
};