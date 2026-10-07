import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { PageServerLoad } from './$types';
import { isOnSale, toMillis } from '$lib/shop/rules';
import { seasonNow } from '$lib/seasonal/seasons';
import { previewShopItems } from '$lib/server/seasonPreview';

export type ShopItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    type: 'frame' | 'badge';
    style_value: string;
    /** Конец окна продаж (ISO) у сезонных товаров — для плашки «до …». */
    available_until: string | null;
};


export const load: PageServerLoad = async ({ locals, setHeaders }) => {
    try {
        const itemsSnapshot = await firestoreAdmin.collection('shop_items').orderBy('price', 'asc').get();
        const docs = itemsSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

        // Только на дев-сервере с подменой даты: товары сезона, которых ещё нет в базе.
        const preview = await previewShopItems();
        if (preview.size > 0) {
            for (const [id, data] of preview) {
                if (!docs.some(doc => doc.id === id)) docs.push({ id, data });
            }
            docs.sort((a, b) => (a.data.price ?? 0) - (b.data.price ?? 0));
        }

        // Витрина — только то, что продаётся прямо сейчас: без скрытых, призовых
        // и сезонных вне их окна. Те же правила проверяет purchaseShopItem.
        const now = seasonNow().getTime();
        const items: ShopItem[] = docs.filter(doc => isOnSale(doc.id, doc.data, now)).map(({ id, data }) => {
            const until = toMillis(data.available_until);
            return {
                id,
                name: data.name || 'Без названия',
                description: data.description || 'Нет описания',
                price: data.price || 99999,
                type: data.type || 'frame',
                style_value: data.style_value || '',
                available_until: until === null ? null : new Date(until).toISOString()
            };
        });

        let ownedItemIds: string[] = [];
        if (locals.user) {
            const userDoc = await firestoreAdmin.collection('users').doc(locals.user.uid).get();
            if (userDoc.exists) {
                ownedItemIds = userDoc.data()?.owned_items || [];
            }
        }

        // В странице список вещей конкретного пользователя — общий кеш CDN отдал бы
        // его другим. Окно продаж к тому же должно открываться вовремя, а не через час.
        setHeaders({ 'Cache-Control': 'private, no-cache' });

        return {
            items: items,
            ownedItemIds: ownedItemIds
        };

    } catch (error) {
        console.error("Ошибка загрузки товаров из магазина:", error);
        return {
            items: [],
            ownedItemIds: []
        };
    }
};