import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAvatarUrl } from './usernameCache';

import * as firestore from 'firebase/firestore';

// We need to mock firebase/firestore and svelte/store
vi.mock('firebase/firestore', () => {
    return {
        doc: vi.fn(),
        getDoc: vi.fn()
    };
});

vi.mock('$lib/firebase', () => {
    return {
        db: {}
    };
});

vi.mock('svelte/store', () => {
    return {
        writable: vi.fn(() => ({
            update: vi.fn(),
            subscribe: vi.fn(),
            set: vi.fn()
        })),
        get: vi.fn()
    };
});

describe('usernameCache - getAvatarUrl', () => {
    const CACHE_TTL_MS = 5 * 60 * 1000;

    beforeEach(() => {
        vi.clearAllMocks();
        // Since we cannot directly clear the `pending` set inside the module,
        // tests that check "pending" states might bleed state if not isolated.
        // We will mock `Date.now` to control cache expiration.
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
                fetchedAt: Date.now() - 1000 // 1 second ago
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
                fetchedAt: Date.now() - 1000 // 1 second ago
            }
        };

        const result = getAvatarUrl(cacheState, 'user1', 'fallback.png');
        expect(result).toBe('fallback.png');
    });

    it('should return fallback and trigger fetch if cache is expired', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));

        vi.mocked(firestore.getDoc).mockResolvedValue({
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
                fetchedAt: Date.now() - CACHE_TTL_MS - 1000 // Expired
            }
        };

        const result = getAvatarUrl(cacheState, 'user2', 'fallback.png');

        // It should return fallback immediately because cache is expired
        expect(result).toBe('fallback.png');

        // It should have triggered a fetch
        expect(firestore.getDoc).toHaveBeenCalled();
    });

    it('should return fallback and trigger fetch if cache is missing', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const cacheState = {};

        vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            data: () => ({ avatar_url: 'https://example.com/avatar.png' }),
            id: 'user3',
            ref: {} as any,
            metadata: {} as any,
            get: () => {}
        } as any);

        const result = getAvatarUrl(cacheState, 'user3', 'fallback.png');

        // It should return fallback
        expect(result).toBe('fallback.png');

        // It should have triggered a fetch
        expect(firestore.getDoc).toHaveBeenCalled();
    });

    it('should not trigger fetch again if a fetch is already pending', () => {
        vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const cacheState = {};

        // Create a delayed promise to keep it pending
        let resolvePromise: any;
        const promise = new Promise(resolve => {
            resolvePromise = resolve;
        });

        vi.mocked(firestore.getDoc).mockReturnValue(promise as any);

        // First call should trigger fetch
        getAvatarUrl(cacheState, 'user4', 'fallback.png');
        expect(firestore.getDoc).toHaveBeenCalledTimes(1);

        // Second call should NOT trigger fetch because it's pending
        getAvatarUrl(cacheState, 'user4', 'fallback.png');
        expect(firestore.getDoc).toHaveBeenCalledTimes(1);

        // Cleanup: resolve the promise so it doesn't hang the test suite
        resolvePromise({ exists: () => false });
    });
});