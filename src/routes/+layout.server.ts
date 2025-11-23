import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, setHeaders }) => {
    let latestNewsDate: string | null = null;

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
        latestNewsDate
    };
};