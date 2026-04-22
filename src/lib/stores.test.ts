import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { chat } from './stores';

vi.mock('$app/environment', () => ({
    browser: true
}));

vi.mock('$lib/firebase', () => ({
    auth: {},
    db: {}
}));

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    getDoc: vi.fn()
}));

describe('Chat Store', () => {
    beforeEach(() => {
        // Сброс стора перед каждым тестом (close() сбрасывает isOpen, но другие поля нужно тоже сбросить)
        // Чтобы сделать чистый тест, можно добавить set в chat store, либо использовать существующие методы
        chat.close();
        chat.setUnread(false);
        chat.setDmUnread(false);
        chat.clearPendingDM();
    });

    it('should be created with initial state', () => {
        const state = get(chat);
        expect(state.isOpen).toBe(false);
        expect(state.hasUnread).toBe(false);
        expect(state.dmUnread).toBe(false);
        expect(state.pendingDM).toBe(null);
    });

    it('toggle() should switch isOpen state', () => {
        expect(get(chat).isOpen).toBe(false);

        chat.toggle();
        expect(get(chat).isOpen).toBe(true);

        chat.toggle();
        expect(get(chat).isOpen).toBe(false);
    });

    it('open() should set isOpen to true and hasUnread to false', () => {
        chat.setUnread(true);
        expect(get(chat).hasUnread).toBe(true);

        chat.open();
        const state = get(chat);
        expect(state.isOpen).toBe(true);
        expect(state.hasUnread).toBe(false);
    });

    it('close() should set isOpen to false', () => {
        chat.open();
        expect(get(chat).isOpen).toBe(true);

        chat.close();
        expect(get(chat).isOpen).toBe(false);
    });

    it('setUnread() should update hasUnread state', () => {
        chat.setUnread(true);
        expect(get(chat).hasUnread).toBe(true);

        chat.setUnread(false);
        expect(get(chat).hasUnread).toBe(false);
    });

    it('setDmUnread() should update dmUnread state', () => {
        chat.setDmUnread(true);
        expect(get(chat).dmUnread).toBe(true);

        chat.setDmUnread(false);
        expect(get(chat).dmUnread).toBe(false);
    });

    it('openDM() should set isOpen, hasUnread and pendingDM', () => {
        chat.setUnread(true);
        const partner = { uid: '123', username: 'Test', avatarUrl: null };

        chat.openDM(partner);
        const state = get(chat);

        expect(state.isOpen).toBe(true);
        expect(state.hasUnread).toBe(false);
        expect(state.pendingDM).toEqual(partner);
    });

    it('clearPendingDM() should set pendingDM to null', () => {
        const partner = { uid: '123', username: 'Test', avatarUrl: null };
        chat.openDM(partner);
        expect(get(chat).pendingDM).toEqual(partner);

        chat.clearPendingDM();
        expect(get(chat).pendingDM).toBe(null);
    });
});