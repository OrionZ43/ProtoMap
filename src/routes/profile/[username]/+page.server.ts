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
        const userProfileData = userProfileDoc.data() || {}; // Защита от пустого data

        // --- ЗАГРУЗКА КОММЕНТАРИЕВ ---
        const rawComments: Comment[] = [];

        try {
            const commentsRef = userProfileDoc.ref.collection('comments').orderBy('createdAt', 'desc').limit(50);
            const commentsSnapshot = await commentsRef.get();

            commentsSnapshot.docs.forEach(doc => {
                const data = doc.data();

                // БЕЗОПАСНАЯ ОБРАБОТКА ДАТЫ
                let createdDate = new Date();
                try {
                    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                        createdDate = data.createdAt.toDate();
                    } else if (data.createdAt && data.createdAt.seconds) {
                        createdDate = new Date(data.createdAt.seconds * 1000);
                    }
                } catch(e) { /* Игнорируем битую дату, оставляем текущую */ }

                rawComments.push({
                    id: doc.id,
                    text: data.text || '...',
                    author_uid: data.author_uid || 'unknown',
                    author_username: data.author_username || 'Аноним',
                    author_avatar_url: data.author_avatar_url || '',
                    author_equipped_frame: data.author_equipped_frame || null,
                    createdAt: createdDate,
                    likes: Array.isArray(data.likes) ? data.likes : [],
                    parentId: data.parentId || null,
                    replies: []
                });
            });
        } catch (e) {
            console.error("Comments Load Error:", e);
            // Если комменты упали, профиль всё равно должен грузиться!
        }

        // --- ЗАГРУЗКА АВТОРОВ (ОПТИМИЗАЦИЯ) ---
        const authorUids = [...new Set(rawComments.map(c => c.author_uid).filter(uid => uid && uid !== 'unknown'))];
        const authorsData = new Map<string, any>();

        if (authorUids.length > 0) {
            const chunkSize = 10;
            for (let i = 0; i < authorUids.length; i += chunkSize) {
                const chunk = authorUids.slice(i, i + chunkSize);
                try {
                    const snaps = await firestoreAdmin.collection('users')
                        .where(FieldPath.documentId(), 'in', chunk)
                        .get();
                    snaps.forEach(d => authorsData.set(d.id, d.data()));
                } catch (e) {
                    console.error("Authors Fetch Error:", e);
                }
            }
        }

        // --- СБОРКА ДЕРЕВА ---
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

        rootComments.forEach(root => {
            if (root.replies && root.replies.length > 0) {
                root.replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            }
        });

        setHeaders({ 'Cache-Control': 'public, max-age=30' });

        return {
            profile: {
                uid: userProfileDoc.id,
                username: userProfileData.username || 'Unknown',
                avatar_url: userProfileData.avatar_url || '',
                about_me: userProfileData.about_me || '',
                status: userProfileData.status || null,
                socials: userProfileData.socials || {},
                equipped_frame: userProfileData.equipped_frame || null,
                equipped_bg: userProfileData.equipped_bg || null
            },
            comments: rootComments
        };

    } catch (e: any) {
        console.error(`CRITICAL PROFILE LOAD ERROR [${username}]:`, e);
        // Если это наша ошибка 404 - прокидываем
        if (e.status === 404 || e.message === 'Профиль не найден') {
            throw error(404, 'Профиль не найден');
        }
        // Иначе 500, но с логом на сервере Vercel
        throw error(500, 'Ошибка сервера при загрузке профиля.');
    }
};