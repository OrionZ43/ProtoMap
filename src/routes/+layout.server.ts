import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { LayoutServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

export const load: LayoutServerLoad = async ({ locals }) => {
    let latestNewsDate: string | null = null;

    const isAdmin = locals.user && adminList.includes(locals.user.uid);

    try {
        const snapshot = await firestoreAdmin.collection('news')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            if (data.createdAt) {
                latestNewsDate = data.createdAt.toDate().toISOString();
            }
        }
    } catch (e) {
        console.error("Ошибка получения даты последней новости:", e);
    }

    return {
        user: locals.user,
        latestNewsDate,
        isAdmin
    };
};