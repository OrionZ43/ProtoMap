import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUsername, getAvatarUrl, usernameCache, set, invalidate } from './usernameCache';
import { getDoc } from 'firebase/firestore';
import { get } from 'svelte/store';

// --- ГЛОБАЛЬНЫЕ МОКИ ---
vi.mock('$lib/firebase', () => ({
    db: {}
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    getDoc: vi.fn()
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
// ТЕСТЫ: getAvatarUrl (Из ветки main)
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
});

// =========================================================
// ТЕСТЫ: usernameCache store (Из текущего PR #15)
// =========================================================
describe('usernameCache store', () => {
    beforeEach(() => {
        const state = get(usernameCache);
        for (const key of Object.keys(state)) {
            invalidate(key);
        }
    });

    describe('invalidate()', () => {
        it('should remove existing user from cache', () => {
            const uid = 'test-user-123';

            set(uid, {
                username: 'TestUser',
                avatar_url: 'http://example.com/avatar.png'
            });

            let state = get(usernameCache);
            expect(state[uid]).toBeDefined();
            expect(state[uid].username).toBe('TestUser');

            invalidate(uid);

            state = get(usernameCache);
            expect(state[uid]).toBeUndefined();
        });

        it('should not throw error and leave cache intact when invalidating non-existent uid', () => {
            const existingUid = 'user-1';
            const missingUid = 'user-999';

            set(existingUid, {
                username: 'ExistingUser'
            });

            expect(() => invalidate(missingUid)).not.toThrow();

            const state = get(usernameCache);
            expect(state[existingUid]).toBeDefined();
            expect(state[existingUid].username).toBe('ExistingUser');
        });

        it('should not affect other cache entries', () => {
            const uid1 = 'user-1';
            const uid2 = 'user-2';

            set(uid1, { username: 'User One' });
            set(uid2, { username: 'User Two' });

            invalidate(uid1);

            const state = get(usernameCache);
            expect(state[uid1]).toBeUndefined();
            expect(state[uid2]).toBeDefined();
            expect(state[uid2].username).toBe('User Two');
        });
    });
});