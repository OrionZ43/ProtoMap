import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUsername } from './usernameCache';
import { getDoc } from 'firebase/firestore';

vi.mock('$lib/firebase', () => ({
    db: {}
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    getDoc: vi.fn()
}));

const CACHE_TTL_MS = 5 * 60 * 1000;

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
                fetchedAt: Date.now() - 1000 // 1 second ago
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
                fetchedAt: Date.now() - CACHE_TTL_MS - 1000 // expired
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
