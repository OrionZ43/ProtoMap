import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { PageServerLoad } from './$types';

export type NewsPost = {
    id: string;
    title: string;
    content: string;
    image?: string;
    createdAt: Date;
    tags?: string[];
};

export const load: PageServerLoad = async ({ setHeaders }) => {
    try {
        const snapshot = await firestoreAdmin.collection('news')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        const news: NewsPost[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'Без заголовка',
                content: data.content || '',
                image: data.image || null,
                createdAt: data.createdAt?.toDate() || new Date(),
                tags: data.tags || []
            };
        });

        setHeaders({ 'Cache-Control': 'public, max-age=300, s-maxage=300' });

        return { news };

    } catch (error) {
        console.error("Ошибка загрузки новостей:", error);
        return { news: [] };
    }
};