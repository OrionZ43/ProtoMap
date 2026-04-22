import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock Firebase
vi.mock('$lib/firebase', () => ({
    db: {}
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    getDoc: vi.fn()
}));

// Import tested module after mocks
import { usernameCache, set, invalidate } from './usernameCache';

describe('usernameCache store', () => {
    beforeEach(() => {
        // Clear the cache before each test
        // by imitating the invalidation of all items
        const state = get(usernameCache);
        for (const key of Object.keys(state)) {
            invalidate(key);
        }
    });

    describe('invalidate()', () => {
        it('should remove existing user from cache', () => {
            const uid = 'test-user-123';

            // Add user
            set(uid, {
                username: 'TestUser',
                avatar_url: 'http://example.com/avatar.png'
            });

            // Check if added
            let state = get(usernameCache);
            expect(state[uid]).toBeDefined();
            expect(state[uid].username).toBe('TestUser');

            // Invalidate
            invalidate(uid);

            // Check if removed
            state = get(usernameCache);
            expect(state[uid]).toBeUndefined();
        });

        it('should not throw error and leave cache intact when invalidating non-existent uid', () => {
            const existingUid = 'user-1';
            const missingUid = 'user-999';

            // Add existing user
            set(existingUid, {
                username: 'ExistingUser'
            });

            // Attempt to remove non-existent
            expect(() => invalidate(missingUid)).not.toThrow();

            // Check if existing remained in place
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
