import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';

export type Comment = {
    id: string;
    text: string;
    author_uid: string;
    author_username: string;
    author_avatar_url: string;
    author_equipped_frame: string | null;
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

    const commentsRef = userProfileDoc.ref.collection('comments').orderBy('createdAt', 'desc').limit(20);
    const commentsSnapshot = await commentsRef.get();

    const authorUids = [...new Set(commentsSnapshot.docs.map(doc => doc.data().author_uid).filter(Boolean))];
    const authorsData = new Map<string, any>();

    if (authorUids.length > 0) {
        const authorPromises = [];
        for (let i = 0; i < authorUids.length; i += 30) {
            const chunk = authorUids.slice(i, i + 30);
            const promise = firestoreAdmin.collection('users')
                .where(FieldPath.documentId(), 'in', chunk)
                .get()
                .then(snapshot => {
                    snapshot.forEach(doc => authorsData.set(doc.id, doc.data()));
                });
            authorPromises.push(promise);
        }
        await Promise.all(authorPromises);
    }

    const comments: Comment[] = commentsSnapshot.docs.map(doc => {
        const data = doc.data();
        const author = authorsData.get(data.author_uid);
        return {
            id: doc.id,
            text: data.text || '',
            author_uid: data.author_uid || '',
            author_username: author?.username || data.author_username || 'Аноним',
            author_avatar_url: author?.avatar_url || data.author_avatar_url || '',
            author_equipped_frame: author?.equipped_frame || null,
            createdAt: data.createdAt?.toDate() || new Date()
        };
    });

    setHeaders({ 'Cache-Control': 'public, max-age=900, stale-while-revalidate=60' });

    return {
        profile: {
            uid: userProfileDoc.id,
            username: userProfileData.username,
            avatar_url: userProfileData.avatar_url,
            about_me: userProfileData.about_me,
            status: userProfileData.status || null,
            socials: userProfileData.socials || {},
            equipped_frame: userProfileData.equipped_frame || null,
            equipped_bg: userProfileData.equipped_bg || null
        },
        comments: comments
    };
};