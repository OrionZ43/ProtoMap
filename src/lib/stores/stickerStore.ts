// src/lib/stores/stickerStore.ts
// Глобальный кэш стикер-паков — один Firestore-запрос на всё приложение.
// Все компоненты (DMInbox, _page.svelte) подписываются сюда,
// никто больше не вызывает getDoc напрямую.

import { writable, get } from 'svelte/store';
import { db } from '$lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export type StickerPack = {
    id: string;
    name: string;
    folder: string;
    stickers: string[];
    iconUrl: string;
};

type StickerState = {
    packs: StickerPack[];
    loading: boolean;
    loaded: boolean;  // флаг «уже грузили, не надо снова»
};

function createStickerStore() {
    const { subscribe, update } = writable<StickerState>({
        packs: [],
        loading: false,
        loaded: false,
    });

    // ── Хелперы парсинга (перенесены из DMInbox / _page.svelte) ─────────────
    function _parse(data: Record<string, any>): StickerPack[] {
        let rawPacks = data.sticker_packs;

        if (typeof rawPacks === 'string') {
            try {
                rawPacks = JSON.parse(rawPacks.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}'));
            } catch {
                return [];
            }
        }

        let packList: any[] = [];
        if (rawPacks && Array.isArray(rawPacks.pack_list))        packList = rawPacks.pack_list;
        else if (Array.isArray(rawPacks))                          packList = rawPacks;
        else if (rawPacks && typeof rawPacks === 'object')         packList = Object.values(rawPacks);

        return packList
            .map((p): StickerPack | null => {
                if (!p || typeof p !== 'object' || !p.id) return null;

                const packId   = p.id as string;
                const packData = rawPacks[packId] || data[packId] || {};
                const cleanId  = packId.replace(/^(pack_|sp_)/, '');
                const spFolder = 'sp_' + cleanId;
                const basePath = packData.base_path || `stickers/${spFolder}`;

                let stickers: string[] = packData.stickers || p.stickers || [];
                if (!stickers.length) {
                    const count = packData.count || p.count || 30;
                    stickers = Array.from({ length: count }, (_, i) => `${spFolder}_${i + 1}.png`);
                }

                let iconFile = p.icon_file || packData.icon_file || stickers[0] || `${spFolder}_1.png`;
                if (!String(iconFile).endsWith('.png')) iconFile = `${spFolder}_${iconFile}.png`;
                iconFile = String(iconFile).replace('sp_sp_', 'sp_');

                const iconUrl = `https://firebasestorage.googleapis.com/v0/b/protomap-1e1db.firebasestorage.app/o/${encodeURIComponent(basePath + '/' + iconFile)}?alt=media`;

                return {
                    id: packId,
                    name: p.title || packData.title || cleanId,
                    folder: basePath,
                    stickers,
                    iconUrl,
                };
            })
            .filter(Boolean) as StickerPack[];
    }

    // ── Публичный метод: ленивая загрузка ────────────────────────────────────
    async function load(): Promise<void> {
        const current = get({ subscribe });
        // Уже загружено или грузится прямо сейчас — не делаем повторный запрос
        if (current.loaded || current.loading) return;

        update(s => ({ ...s, loading: true }));
        try {
            const snap = await getDoc(doc(db, 'mobileapp', 'sticker_packs'));
            if (!snap.exists()) {
                update(s => ({ ...s, loading: false, loaded: true }));
                return;
            }
            const packs = _parse(snap.data());
            update(() => ({ packs, loading: false, loaded: true }));
        } catch (e) {
            console.error('[StickerStore] load failed:', e);
            update(s => ({ ...s, loading: false, loaded: true }));
        }
    }

    return { subscribe, load };
}

export const stickerStore = createStickerStore();

// ── Утилита для получения URL стикера (единственное место в коде) ────────────
export function getStickerUrl(
    packs: StickerPack[],
    packId: string | null | undefined,
    filenameRaw: string | number
): string {
    if (!packId) return '';
    const pack     = packs.find(p => p.id === packId);
    const cleanId  = packId.replace(/^(pack_|sp_)/, '');
    const spFolder = 'sp_' + cleanId;
    const folder   = pack?.folder || `stickers/${spFolder}`;

    let file = String(filenameRaw);
    if (!file.endsWith('.png')) file = `${spFolder}_${file}.png`;
    file = file.replace('sp_sp_', 'sp_');

    return `https://firebasestorage.googleapis.com/v0/b/protomap-1e1db.firebasestorage.app/o/${encodeURIComponent(folder + '/' + file)}?alt=media`;
}
