// src/lib/stores/dmCache.ts
// In-memory кэш сообщений для личных чатов.
// Сообщения живут пока открыта вкладка браузера — не перезагружаются
// при закрытии/открытии виджета.

import { writable, get } from 'svelte/store';

type CachedMsg = {
    id: string;
    text: string;
    author_uid: string;
    author_username: string;
    createdAt: Date;
    is_deleted: boolean;
    type: string;
    media_url: string | null;
    sticker_pack_id: string | null;
    sticker_id: string | null;
    reactions: Record<string, string>;
    replyTo: { author_username: string; text: string } | null;
};

// chatId → массив сообщений
const _cache = new Map<string, CachedMsg[]>();

// Реактивный счётчик обновлений — чтобы компонент мог подписаться
export const dmCacheVersion = writable(0);

function bump() { dmCacheVersion.update(v => v + 1); }

/** Получить сообщения из кэша (или пустой массив) */
export function getCached(chatId: string): CachedMsg[] {
    return _cache.get(chatId) ?? [];
}

/** Записать весь список сообщений в кэш */
export function setCache(chatId: string, msgs: CachedMsg[]) {
    _cache.set(chatId, msgs);
    bump();
}

/** Добавить/обновить одно сообщение в кэше (приходит из onSnapshot) */
export function upsertMessage(chatId: string, msg: CachedMsg) {
    const list = _cache.get(chatId) ?? [];
    const idx  = list.findIndex(m => m.id === msg.id);
    if (idx !== -1) {
        list[idx] = msg;
    } else {
        list.push(msg);
        list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    _cache.set(chatId, list);
    bump();
}

/** Очистить кэш конкретного чата */
export function clearCache(chatId: string) {
    _cache.delete(chatId);
    bump();
}