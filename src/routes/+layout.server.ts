import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, setHeaders }) => {
    let latestNewsDate: string | null = null;

    try {
        // Получаем только ОДНУ последнюю новость, нам нужна только дата
        const snapshot = await firestoreAdmin.collection('news')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            // Превращаем дату в строку ISO, чтобы передать на клиент
            if (data.createdAt) {
                latestNewsDate = data.createdAt.toDate().toISOString();
            }
        }
    } catch (e) {
        console.error("Ошибка получения даты последней новости:", e);
    }

    return {
        user: locals.user, // Прокидываем юзера (это у нас уже было в hooks, но тут тоже пригодится)
        latestNewsDate     // <-- ВОТ ЭТО НАМ НУЖНО
    };
};