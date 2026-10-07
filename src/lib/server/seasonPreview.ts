import type { DocumentData } from 'firebase-admin/firestore';

/**
 * Дев-сервер с VITE_PREVIEW_DATE (см. seasonNow в $lib/seasonal/seasons):
 * сезонные товары из каталога, которых ещё нет в базе, видны так, будто их уже
 * записал scripts/seed-halloween-shop.mjs. Купить их нельзя — покупку проверяет
 * purchaseShopItem по базе. В сборке ветка вырезается, функция отдаёт пустой список.
 */
export async function previewShopItems(): Promise<Map<string, DocumentData>> {
    const items = new Map<string, DocumentData>();
    if (!import.meta.env.DEV || !import.meta.env.VITE_PREVIEW_DATE) return items;

    const { default: catalog } = await import('$lib/shop/halloween.json');
    for (const [id, item] of Object.entries(catalog.items)) {
        items.set(id, {
            ...item,
            style_value: id,
            available_from: catalog.available_from,
            available_until: catalog.available_until
        });
    }
    return items;
}
