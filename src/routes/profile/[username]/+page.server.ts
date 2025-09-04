import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { FieldValue } from 'firebase-admin/firestore';

// Тип для комментария, чтобы было удобно работать
export type Comment = {
    id: string;
    text: string;
    author_uid: string;
    author_username: string;
    author_avatar_url: string;
    createdAt: Date;
};

export const load: PageServerLoad = async ({ params, setHeaders }) => {
    const username = params.username;

    const usersRef = firestoreAdmin.collection('users');
    const userSnapshot = await usersRef.where('username', '==', username).limit(1).get();

    if (userSnapshot.empty) {
        setHeaders({ 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=5' });
        throw error(404, 'Профиль не найден');
    }

    const userProfileDoc = userSnapshot.docs[0];
    const userProfileData = userProfileDoc.data();

    // Загружаем комментарии для этого профиля
    const commentsRef = userProfileDoc.ref.collection('comments').orderBy('createdAt', 'desc').limit(20);
    const commentsSnapshot = await commentsRef.get();

    const comments: Comment[] = commentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            text: data.text || '',
            author_uid: data.author_uid || '',
            author_username: data.author_username || 'Аноним',
            author_avatar_url: data.author_avatar_url || '',
            createdAt: data.createdAt?.toDate() || new Date()
        };
    });

    setHeaders({ 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=60' });

    return {
        profile: {
            uid: userProfileDoc.id,
            username: userProfileData.username,
            avatar_url: userProfileData.avatar_url,
            social_link: userProfileData.social_link, // Добавил обратно, если нужно
            about_me: userProfileData.about_me,
            socials: userProfileData.socials || {} // Оставляем socials
        },
        comments: comments
    };
};

export const actions: Actions = {
    addComment: async ({ request, locals, params }) => {
        const currentUser = locals.user;
        if (!currentUser) {
            return fail(401, { error: 'Необходимо войти, чтобы оставлять комментарии.' });
        }

        const formData = await request.formData();
        const commentText = formData.get('commentText') as string;

        if (!commentText || commentText.trim().length === 0) {
            return fail(400, { addCommentError: 'Комментарий не может быть пустым.', text: commentText });
        }
        if (commentText.length > 1000) {
            return fail(400, { addCommentError: 'Комментарий слишком длинный.', text: commentText });
        }

        try {
            const profileUsername = params.username;
            if (!profileUsername) {
                return fail(400, { addCommentError: 'Не указан профиль для комментирования.' });
            }

            const usersRef = firestoreAdmin.collection('users');
            const userSnapshot = await usersRef.where('username', '==', profileUsername).limit(1).get();

            if (userSnapshot.empty) {
                return fail(404, { addCommentError: 'Профиль, который вы пытаетесь комментировать, не найден.' });
            }
            const profileDocRef = userSnapshot.docs[0].ref;

            const authorDoc = await usersRef.doc(currentUser.uid).get();
            const authorData = authorDoc.data();

            if (!authorDoc.exists || !authorData) {
                 return fail(404, { addCommentError: 'Ваш профиль не найден, невозможно оставить комментарий.' });
            }

            const newComment = {
                text: commentText.trim(),
                author_uid: currentUser.uid,
                author_username: authorData.username,
                author_avatar_url: authorData.avatar_url || '',
                createdAt: FieldValue.serverTimestamp()
            };

            await profileDocRef.collection('comments').add(newComment);

            return { addCommentSuccess: true, message: 'Комментарий добавлен!' };

        } catch (e) {
            console.error("Ошибка добавления комментария:", e);
            return fail(500, { addCommentError: 'Ошибка сервера. Не удалось добавить комментарий.' });
        }
    },

    deleteComment: async ({ request, locals }) => {
        const currentUser = locals.user;
        if (!currentUser) {
            return fail(401, { error: 'Необходима авторизация.' });
        }

        const formData = await request.formData();
        const commentId = formData.get('commentId') as string;
        const profileUid = formData.get('profileUid') as string;

        if (!commentId || !profileUid) {
            return fail(400, { deleteCommentError: 'Неверные данные для удаления.' });
        }

        try {
            const commentRef = firestoreAdmin.collection('users').doc(profileUid).collection('comments').doc(commentId);
            const commentDoc = await commentRef.get();

            if (!commentDoc.exists) {
                return fail(404, { deleteCommentError: 'Комментарий не найден.' });
            }

            const commentData = commentDoc.data();
            if (commentData?.author_uid !== currentUser.uid) {
                return fail(403, { deleteCommentError: 'Вы не можете удалить чужой комментарий.' });
            }

            await commentRef.delete();

            return { deleteCommentSuccess: true, message: 'Комментарий удален.' };

        } catch (e) {
            console.error("Ошибка удаления комментария:", e);
            return fail(500, { deleteCommentError: 'Ошибка сервера при удалении.' });
        }
    }
};