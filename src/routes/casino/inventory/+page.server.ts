import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export type ShopItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    type: 'frame' | 'badge';
    style_value: string;
};

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }
    const uid = locals.user.uid;

    try {
        const userDocRef = firestoreAdmin.collection('users').doc(uid);
        const itemsRef = firestoreAdmin.collection('shop_items');
        const [userDocSnap, itemsSnapshot] = await Promise.all([
            userDocRef.get(),
            itemsRef.get()
        ]);

        if (!userDocSnap.exists) {
            throw error(404, 'Профиль не найден');
        }

        const allItems: { [id: string]: ShopItem } = {};
        itemsSnapshot.forEach(doc => {
            const data = doc.data();
            allItems[doc.id] = {
                id: doc.id,
                name: data.name,
                description: data.description,
                price: data.price,
                type: data.type,
                style_value: data.style_value
            };
        });

        const userData = userDocSnap.data()!;

        return {
            ownedItemIds: userData.owned_items || [],
            equippedFrame: userData.equipped_frame || null,
            equippedBg: userData.equipped_bg || null,
            allItems: allItems
        };

    } catch (e) {
        console.error("Ошибка загрузки инвентаря:", e);
        throw error(500, "Не удалось загрузить инвентарь");
    }
};