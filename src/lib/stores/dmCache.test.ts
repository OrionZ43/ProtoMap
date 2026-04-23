import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { upsertMessage, getCached, clearCache, dmCacheVersion } from './dmCache';

describe('dmCache upsertMessage', () => {
    const chatId = 'chat1';

    const baseMsg = {
        author_uid: 'user1',
        author_username: 'User 1',
        is_deleted: false,
        type: 'text',
        media_url: null,
        sticker_pack_id: null,
        sticker_id: null,
        reactions: {},
        replyTo: null
    };

    beforeEach(() => {
        clearCache(chatId);
    });

    it('should add a new message to an empty cache', () => {
        const msg = {
            ...baseMsg,
            id: 'msg1',
            text: 'Hello',
            createdAt: new Date('2023-01-01T10:00:00Z'),
        };

        upsertMessage(chatId, msg);

        const cached = getCached(chatId);
        expect(cached.length).toBe(1);
        expect(cached[0]).toEqual(msg);
    });

    it('should update an existing message', () => {
        const msg1 = {
            ...baseMsg,
            id: 'msg1',
            text: 'Hello',
            createdAt: new Date('2023-01-01T10:00:00Z'),
        };
        upsertMessage(chatId, msg1);

        const updatedMsg1 = {
            ...msg1,
            text: 'Hello Updated',
            is_deleted: true
        };
        upsertMessage(chatId, updatedMsg1);

        const cached = getCached(chatId);
        expect(cached.length).toBe(1);
        expect(cached[0]).toEqual(updatedMsg1);
    });

    it('should sort messages by createdAt when a new message is added out of order', () => {
        const msg2 = {
            ...baseMsg,
            id: 'msg2',
            text: 'Second Message',
            createdAt: new Date('2023-01-01T10:05:00Z'),
        };
        const msg1 = {
            ...baseMsg,
            id: 'msg1',
            text: 'First Message',
            createdAt: new Date('2023-01-01T10:00:00Z'),
        };
        const msg3 = {
            ...baseMsg,
            id: 'msg3',
            text: 'Third Message',
            createdAt: new Date('2023-01-01T10:10:00Z'),
        };

        upsertMessage(chatId, msg2);
        upsertMessage(chatId, msg3);
        // Add an older message, it should be sorted to the beginning
        upsertMessage(chatId, msg1);

        const cached = getCached(chatId);
        expect(cached.length).toBe(3);
        expect(cached[0].id).toBe('msg1');
        expect(cached[1].id).toBe('msg2');
        expect(cached[2].id).toBe('msg3');
    });

    it('should bump dmCacheVersion on upsertMessage', () => {
        const initialVersion = get(dmCacheVersion);

        const msg = {
            ...baseMsg,
            id: 'msg1',
            text: 'Hello',
            createdAt: new Date('2023-01-01T10:00:00Z'),
        };

        upsertMessage(chatId, msg);

        const newVersion = get(dmCacheVersion);
        expect(newVersion).toBeGreaterThan(initialVersion);
    });
});
