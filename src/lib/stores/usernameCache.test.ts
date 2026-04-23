import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUsername, getAvatarUrl } from './usernameCache';
import { getDoc } from 'firebase/firestore';

// --- ГЛОБАЛЬНЫЕ МОКИ ---
vi.mock('$lib/firebase', () => ({
    db: {}
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    getDoc: vi.fn()
}));

vi.mock('svelte/store', () => ({
    writable: vi.fn(() => ({
        update: vi.fn(),
        subscribe: vi.fn(),
        set: vi.fn()
    })),
    get: vi.fn()
}));

const CACHE_TTL_MS = 5 * 60 * 1000;

// =========================================================
// ТЕСТЫ: getUsername (Из ветки main)
// =========================================================
describe('getUsername', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the fallback and calls fetchUser if cache is empty', () => {
        const uid = 'test-uid-1';
        const fallback = 'Fallback Name';

        vi.mocked(getDoc).mockReturnValue(new Promise(() => {}));

        const result = getUsername({}, uid, fallback);

        expect(result).toBe(fallback);
        expect(getDoc).toHaveBeenCalledTimes(1);
    });

    it('returns the cached username if cache is fresh', () => {
        const uid = 'test-uid-2';
        const fallback = 'Fallback Name';
        const cacheState = {
            [uid]: {
                username: 'Cached Name',
                avatar_url: '',
                equipped_frame: null,
                fetchedAt: Date.now() - 1000 // 1 секунда назад
            }
        };

        const result = getUsername(cacheState, uid, fallback);

        expect(result).toBe('Cached Name');
        expect(getDoc).not.toHaveBeenCalled();
    });

    it('returns the fallback and calls fetchUser if cache is expired', () => {
        const uid = 'test-uid-3';
        const fallback = 'Fallback Name';
        const cacheState = {
            [uid]: {
                username: 'Expired Name',
                avatar_url: '',
                equipped_frame: null,
                fetchedAt: Date.now() - CACHE_TTL_MS - 1000 // протухло
            }
        };

        vi.mocked(getDoc).mockReturnValue(new Promise(() => {}));

        const result = getUsername(cacheState, uid, fallback);

        expect(result).toBe(fallback);
        expect(getDoc).toHaveBeenCalledTimes(1);
    });

    it('deduplicates fetch calls for the same uid', () => {
        const uid = 'test-uid-4';
        const fallback = 'Fallback Name';

        vi.mocked(getDoc).mockReturnValue(new Promise(() => {}));

        getUsername({}, uid, fallback);
        expect(getDoc).toHaveBeenCalledTimes(1);

        getUsername({}, uid, fallback);
        expect(getDoc).toHaveBeenCalledTimes(1);
    });
});

// =========================================================
// ТЕСТЫ: getAvatarUrl (Из текущего PR #10)
// =========================================================
describe('usernameCache - getAvatarUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return the avatar URL from the cache if it is valid', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const cacheState = {
            'user1': {
                username: 'Test User',
                avatar_url: 'https://example.com/avatar.png',
                equipped_frame: null,
                fetchedAt: Date.now() - 1000 // 1 секунда назад
            }
        };

        const result = getAvatarUrl(cacheState, 'user1', 'fallback.png');
        expect(result).toBe('https://example.com/avatar.png');
    });

    it('should return fallback if cache exists but avatar_url is missing', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const cacheState = {
            'user1': {
                username: 'Test User',
                avatar_url: '',
                equipped_frame: null,
                fetchedAt: Date.now() - 1000
            }
        };

        const result = getAvatarUrl(cacheState, 'user1', 'fallback.png');
        expect(result).toBe('fallback.png');
    });

    it('should return fallback and trigger fetch if cache is expired', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));

        vi.mocked(getDoc).mockResolvedValue({
            exists: () => true,
            data: () => ({ avatar_url: 'https://example.com/new_avatar.png' }),
            id: 'user2',
            ref: {} as any,
            metadata: {} as any,
            get: () => {}
        } as any);

        const cacheState = {
            'user2': {
                username: 'Test User',
                avatar_url: 'https://example.com/old_avatar.png',
                equipped_frame: null,
                fetchedAt: Date.now() - CACHE_TTL_MS - 1000 // протухло
            }
        };

        const result = getAvatarUrl(cacheState, 'user2', 'fallback.png');

        expect(result).toBe('fallback.png');
        expect(getDoc).toHaveBeenCalled();
    });

    it('should return fallback and trigger fetch if cache is missing', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const cacheState = {};

        vi.mocked(getDoc).mockResolvedValue({
            exists: () => true,
            data: () => ({ avatar_url: 'https://example.com/avatar.png' }),
            id: 'user3',
            ref: {} as any,
            metadata: {} as any,
            get: () => {}
        } as any);

        const result = getAvatarUrl(cacheState, 'user3', 'fallback.png');

        expect(result).toBe('fallback.png');
        expect(getDoc).toHaveBeenCalled();
    });

    it('should not trigger fetch again if a fetch is already pending', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const cacheState = {};

        let resolvePromise: any;
        const promise = new Promise(resolve => {
            resolvePromise = resolve;
        });

        vi.mocked(getDoc).mockReturnValue(promise as any);

        // Первый вызов
        getAvatarUrl(cacheState, 'user4', 'fallback.png');
        expect(getDoc).toHaveBeenCalledTimes(1);

        // Второй вызов
        getAvatarUrl(cacheState, 'user4', 'fallback.png');
        expect(getDoc).toHaveBeenCalledTimes(1); // Количество вызовов не выросло

        // Очистка, чтобы тест не повис
        resolvePromise({ exists: () => false });
    });
});