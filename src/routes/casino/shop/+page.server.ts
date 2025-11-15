import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { PageServerLoad } from './$types';

export type ShopItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    type: 'frame' | 'badge';
    style_value: string;
};

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
    try {
        const itemsSnapshot = await firestoreAdmin.collection('shop_items').orderBy('price', 'asc').get();

        const items: ShopItem[] = itemsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || 'Без названия',
                description: data.description || 'Нет описания',
                price: data.price || 99999,
                type: data.type || 'frame',
                style_value: data.style_value || ''
            };
        });

        // --- НАЧАЛО НОВОГО БЛОКА ---
        let ownedItemIds: string[] = [];
        if (locals.user) {
            const userDoc = await firestoreAdmin.collection('users').doc(locals.user.uid).get();
            if (userDoc.exists) {
                ownedItemIds = userDoc.data()?.owned_items || [];
            }
        }
        // --- КОНЕЦ НОВОГО БЛОКА ---

        setHeaders({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

        return {
            items: items,
            ownedItemIds: ownedItemIds // <--- ПЕРЕДАЕМ НА ФРОНТЕНД
        };

    } catch (error) {
        console.error("Ошибка загрузки товаров из магазина:", error);
        return {
            items: [],
            ownedItemIds: [] // Возвращаем пустой массив в случае ошибки
        };
    }
};