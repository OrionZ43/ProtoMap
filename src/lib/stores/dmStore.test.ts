// Регрессия: открытие чата не должно падать на документах, записанных
// другим клиентом (мобильное приложение пишет свои форматы полей).
// Раньше `(data.createdAt as Timestamp)?.toDate()` бросал TypeError на числе
// или строке — Array.map падал целиком, и ни одно сообщение не отображалось.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$lib/firebase', () => ({ db: {}, auth: {}, rtdb: {}, functions: {} }));

// openChat регистрирует два слушателя: сначала запрос сообщений, затем typing-документ.
const listeners: ((snap: unknown) => void)[] = [];

vi.mock('firebase/firestore', () => ({
	collection: vi.fn(() => ({})),
	doc: vi.fn(() => ({ id: 'd' })),
	query: vi.fn(() => ({})),
	where: vi.fn(() => ({})),
	orderBy: vi.fn(() => ({})),
	limit: vi.fn(() => ({})),
	onSnapshot: vi.fn((_q: unknown, next: (snap: unknown) => void) => {
		listeners.push(next);
		return () => {};
	}),
	setDoc: vi.fn(() => Promise.resolve()),
	updateDoc: vi.fn(() => Promise.resolve()),
	serverTimestamp: vi.fn(() => ({})),
	increment: vi.fn(() => ({}))
}));

const snapOf = (docs: Record<string, unknown>[]) => ({
	docs: docs.map((d) => ({ id: d.id as string, data: () => d }))
});

const CHAT = {
	id: 'me_them',
	partner: { uid: 'them', username: 'Them', avatarUrl: null, frameId: null },
	lastMessage: '',
	lastMessageTimestamp: null,
	unread: 0
};

/** Открывает чат и отдаёт снапшот в слушателя сообщений. */
async function emit(docs: Record<string, unknown>[]) {
	const dm = await import('./dmStore');
	listeners.length = 0;
	dm.openChat(CHAT as never, 'me');
	listeners[0](snapOf(docs));
	return dm;
}

describe('dmStore.openChat — маппинг сообщений', () => {
	beforeEach(() => {
		listeners.length = 0;
	});

	it('принимает настоящий Firestore Timestamp', async () => {
		const when = new Date('2026-05-05T08:00:00Z');
		const dm = await emit([{ id: 'm1', text: 'hi', createdAt: { toDate: () => when } }]);
		expect(get(dm.messages)).toHaveLength(1);
		expect(get(dm.messages)[0].createdAt).toEqual(when);
	});

	it('подставляет текущее время для pending serverTimestamp (null)', async () => {
		const dm = await emit([{ id: 'm2', text: 'hi', createdAt: null }]);
		expect(get(dm.messages)[0].createdAt).toBeInstanceOf(Date);
	});

	it('принимает createdAt как epoch millis (мобильный клиент)', async () => {
		const dm = await emit([{ id: 'm3', text: 'hi', createdAt: 1750000000000 }]);
		expect(get(dm.messages)).toHaveLength(1);
		expect(get(dm.messages)[0].createdAt.getTime()).toBe(1750000000000);
	});

	it('принимает createdAt как ISO-строку', async () => {
		const dm = await emit([{ id: 'm4', text: 'hi', createdAt: '2026-01-01T10:00:00Z' }]);
		expect(get(dm.messages)[0].createdAt.toISOString()).toBe('2026-01-01T10:00:00.000Z');
	});

	it('один битый документ не ломает остальные сообщения', async () => {
		const dm = await emit([
			{ id: 'ok1', text: 'a', createdAt: { toDate: () => new Date() } },
			{ id: 'bad', text: 'b', createdAt: 1750000000000 },
			{ id: 'ok2', text: 'c', createdAt: 'мусор' }
		]);
		expect(get(dm.messages)).toHaveLength(3);
		for (const m of get(dm.messages)) {
			expect(m.createdAt).toBeInstanceOf(Date);
			expect(isNaN(m.createdAt.getTime())).toBe(false);
		}
	});

	it('нормализует reactions/read_by к словарю — Object.keys в разметке не упадёт', async () => {
		const dm = await emit([
			{ id: 'm5', text: 'hi', createdAt: null, reactions: [], read_by: 'нет' },
			{ id: 'm6', text: 'hi', createdAt: null, reactions: undefined, read_by: null }
		]);
		for (const m of get(dm.messages)) {
			expect(Object.keys(m.reactions)).toEqual([]);
			expect(() => Object.keys(m.read_by ?? {})).not.toThrow();
		}
	});
});
