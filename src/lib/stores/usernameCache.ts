/**
 * [ЭТАП 6] usernameCache — глобальный in-memory кэш никнеймов по UID.
 *
 * Принцип работы:
 * - При первом обращении к uid делается запрос в Firestore
 * - Результат кэшируется на 5 минут в памяти (сбрасывается при перезагрузке)
 * - Пока данные грузятся — возвращается author_username как fallback
 * - Дедупликация запросов: если запрос уже летит — второй не отправляется
 */

import { writable, get } from 'svelte/store';
import { db } from '$lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

type CacheEntry = {
    username: string;
    avatar_url: string;
    equipped_frame: string | null;
    fetchedAt: number;
};

type CacheState = Record<string, CacheEntry>;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

// Основной стор: uid -> данные пользователя
const cache = writable<CacheState>({});

// Множество uid-ов за которыми уже летит запрос (дедупликация)
const pending = new Set<string>();

/**
 * Получить никнейм по uid.
 *
 * Принимает текущее состояние кэша (cacheState) как первый аргумент —
 * это позволяет использовать функцию реактивно в Svelte-шаблонах:
 *   {@const name = getUsername($usernameCache, uid, fallback)}
 *
 * Если данных нет — запускает фоновую загрузку и возвращает fallback.
 * Когда Firestore ответит, $usernameCache обновится и Svelte перерисует компонент.
 */
export function getUsername(cacheState: CacheState, uid: string, fallback: string): string {
    const entry = cacheState[uid];

    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
        return entry.username;
    }

    // Запускаем загрузку в фоне если ещё не летит
    if (!pending.has(uid)) {
        fetchUser(uid);
    }

    return fallback;
}

/**
 * Получить аватар по uid — реактивная версия (принимает cacheState).
 */
export function getAvatarUrl(cacheState: CacheState, uid: string, fallback: string): string {
    const entry = cacheState[uid];
    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
        return entry.avatar_url || fallback;
    }
    if (!pending.has(uid)) {
        fetchUser(uid);
    }
    return fallback;
}

/**
 * Получить рамку по uid — реактивная версия.
 */
export function getEquippedFrame(cacheState: CacheState, uid: string): string | null {
    const entry = cacheState[uid];
    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
        return entry.equipped_frame;
    }
    return null;
}

/**
 * Загружает данные пользователя из Firestore и кладёт в кэш.
 * Вызывается один раз на uid (пока не завершится).
 */
async function fetchUser(uid: string): Promise<void> {
    pending.add(uid);
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
            const data = snap.data();
            cache.update(state => ({
                ...state,
                [uid]: {
                    username: data.username || 'Unknown',
                    avatar_url: data.avatar_url || '',
                    equipped_frame: data.equipped_frame || null,
                    fetchedAt: Date.now()
                }
            }));
        }
    } catch (e) {
        console.warn(`[usernameCache] Failed to fetch uid: ${uid}`, e);
    } finally {
        pending.delete(uid);
    }
}

/**
 * Принудительно обновить запись в кэше (вызывается после смены никнейма).
 * Например: usernameCache.invalidate(uid) после changeUsername.
 */
export function invalidate(uid: string): void {
    cache.update(state => {
        const next = { ...state };
        delete next[uid];
        return next;
    });
}

/**
 * Записать данные в кэш вручную (после успешного changeUsername на клиенте).
 * Позволяет не ждать следующего Firestore-запроса.
 */
export function set(uid: string, data: Partial<CacheEntry>): void {
    cache.update(state => ({
        ...state,
        [uid]: {
            username: data.username ?? state[uid]?.username ?? 'Unknown',
            avatar_url: data.avatar_url ?? state[uid]?.avatar_url ?? '',
            equipped_frame: data.equipped_frame ?? state[uid]?.equipped_frame ?? null,
            fetchedAt: Date.now()
        }
    }));
}

/**
 * Реактивный стор для подписки в компонентах через $usernameCache.
 * Используй когда нужно чтобы UI обновился автоматически при изменении кэша.
 *
 * Пример:
 *   $: displayName = $usernameCache[msg.author_uid]?.username ?? msg.author_username;
 */
export const usernameCache = cache;