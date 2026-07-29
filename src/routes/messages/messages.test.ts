// Регрессия «весь сайт ложится при входе в чат».
//
// Список диалогов открывался нормально, а при открытии конкретного чата падала
// вся страница. Причина: функции, вызываемые из разметки чата, бросали исключение
// на неполном сообщении (Object.keys(msg.reactions) при отсутствующем поле,
// isSameDay(msg.createdAt, ...) при отсутствующей дате). Исключение во время
// рендера в Svelte разрушает всё дерево компонентов — умирает не чат, а весь layout.
//
// Тест монтирует страницу с враждебными сообщениями: рендер должен выживать.
import { describe, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { readable, writable } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/messages'), data: {}, params: {} })
}));
vi.mock('$lib/firebase', () => ({ db: {}, auth: {}, rtdb: {}, functions: {}, appCheck: null }));

vi.mock('firebase/firestore', () => ({
	collection: vi.fn(() => ({})),
	doc: vi.fn(() => ({ id: 'msg1' })),
	query: vi.fn(() => ({})),
	where: vi.fn(() => ({})),
	orderBy: vi.fn(() => ({})),
	limit: vi.fn(() => ({})),
	onSnapshot: vi.fn(() => () => {}),
	setDoc: vi.fn(() => Promise.resolve()),
	updateDoc: vi.fn(() => Promise.resolve()),
	serverTimestamp: vi.fn(() => ({})),
	increment: vi.fn(() => ({})),
	getDoc: vi.fn(() => Promise.resolve({ exists: () => false }))
}));
vi.mock('firebase/storage', () => ({
	getStorage: vi.fn(() => ({})),
	ref: vi.fn(() => ({})),
	uploadBytesResumable: vi.fn(),
	getDownloadURL: vi.fn()
}));

const userStore = writable({
	user: {
		uid: 'me',
		username: 'Me',
		email: 'me@example.dev',
		emailVerified: true,
		avatar_url: '',
		social_link: '',
		about_me: '',
		casino_credits: 0,
		last_daily_bonus: null,
		daily_streak: 0,
		owned_items: [],
		equipped_frame: null,
		equipped_badge: null,
		equipped_bg: null,
		blocked_uids: []
	},
	loading: false
});

const chatStore = {
	subscribe: writable({ isOpen: false, hasUnread: false, dmUnread: false, pendingDM: null })
		.subscribe,
	setDmUnread: vi.fn(),
	clearPendingDM: vi.fn(),
	toggle: vi.fn(),
	open: vi.fn(),
	close: vi.fn(),
	setUnread: vi.fn(),
	openDM: vi.fn()
};
vi.mock('$lib/stores', () => ({ userStore, chat: chatStore }));

type Overrides = Record<string, unknown>;

const mk = (o: Overrides) => ({
	id: o.id,
	text: o.text ?? '',
	author_uid: o.own ? 'me' : 'them',
	author_username: o.own ? 'Me' : 'Them',
	createdAt: 'createdAt' in o ? o.createdAt : new Date(),
	is_deleted: o.is_deleted ?? false,
	type: o.type ?? 'TEXT',
	media_url: o.media_url ?? null,
	sticker_pack_id: o.sticker_pack_id ?? null,
	sticker_id: o.sticker_id ?? null,
	reactions: 'reactions' in o ? o.reactions : {},
	replyTo: null,
	read_by: o.read_by
});

const yesterday = new Date(Date.now() - 36 * 3600 * 1000);

const VARIANTS: Record<string, Overrides> = {
	'обычный текст от партнёра': mk({ id: 'b', text: 'привет' }),
	'своё сообщение, прочитано': mk({ id: 'c', text: 'моё', own: true, read_by: { them: true } }),
	'своё сообщение без read_by': mk({ id: 'd', text: 'моё2', own: true, read_by: undefined }),
	'разделитель дня': mk({ id: 'a', text: 'старое', createdAt: yesterday }),
	стикер: mk({ id: 'e', type: 'STICKER', sticker_pack_id: 'pack_x', sticker_id: '3' }),
	'картинка по ссылке': mk({ id: 'f', type: 'IMAGE', media_url: 'https://example.dev/i.png' }),
	'картинка base64': mk({ id: 'g', type: 'IMAGE', text: 'BASE64DATA' }),
	'голосовое по ссылке': mk({ id: 'h', type: 'VOICE', media_url: 'https://example.dev/v.webm' }),
	'голосовое base64': mk({ id: 'i', type: 'VOICE', text: 'BASE64AUDIO' }),
	'тип в нижнем регистре': mk({ id: 'j', type: 'voice', media_url: 'https://example.dev/2.webm' }),
	удалённое: mk({ id: 'l', text: 'нет', is_deleted: true }),
	'с реакциями': mk({ id: 'm', text: 'р', reactions: { me: '❤️', them: '🔥' } }),
	// Эти два раньше роняли всю страницу:
	'reactions отсутствует': mk({ id: 'n', text: 'без реакций', reactions: undefined }),
	'createdAt отсутствует': mk({ id: 'o', text: 'без даты', createdAt: undefined }),
	'reactions массивом': mk({ id: 'p', text: 'массив', reactions: [] }),
	'createdAt мусор': mk({ id: 'q', text: 'мусор', createdAt: 'не дата' })
};

async function mountWithMessages(msgs: unknown[]) {
	const dm = await import('$lib/stores/dmStore');
	const Page = (await import('./+page.svelte')).default;
	dm.activeChat.set({
		id: 'me_them',
		partner: { uid: 'them', username: 'Them', avatarUrl: null, frameId: null },
		lastMessage: 'привет',
		lastMessageTimestamp: new Date(),
		unread: 0
	});
	dm.messages.set(msgs as never);
	render(Page as never);
}

describe('страница /messages — открытый чат не роняет рендер', () => {
	for (const [name, msg] of Object.entries(VARIANTS)) {
		it(`рендерит сообщение: ${name}`, async () => {
			await mountWithMessages([msg]);
		});
	}

	it('рендерит все варианты сразу', async () => {
		await mountWithMessages(Object.values(VARIANTS));
	});
});
