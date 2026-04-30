// src/lib/stores/dmStore.ts

import { writable, derived } from 'svelte/store';
import { db } from '$lib/firebase';
import {
	collection,
	query,
	where,
	orderBy,
	limit,
	onSnapshot,
	doc,
	setDoc,
	updateDoc,
	serverTimestamp,
	increment,
	type Unsubscribe,
	type Timestamp
} from 'firebase/firestore';
import { getCached, setCache } from '$lib/stores/dmCache';

export type DMChat = {
	id: string;
	partner: { uid: string; username: string; avatarUrl: string | null; frameId?: string | null };
	lastMessage: string;
	lastMessageTimestamp: Date | null;
	unread: number;
};

export type DMMessage = {
	id: string;
	text: string;
	author_uid: string;
	author_username: string;
	createdAt: Date;
	is_deleted: boolean;
	type: string;
	media_url: string | null;
	sticker_pack_id: string | null;
	sticker_id: string | null;
	reactions: Record<string, string>;
	replyTo: { author_username: string; text: string } | null;
	read_by?: Record<string, boolean>;
};

// ── Состояние ──────────────────────────────────────────────────────────────
export const chats = writable<DMChat[]>([]);
export const activeChat = writable<DMChat | null>(null);
export const messages = writable<DMMessage[]>([]);
export const partnerTyping = writable(false);
export const totalUnread = derived(chats, ($c) => $c.reduce((s, c) => s + c.unread, 0));

// ── Подписки (модуль-уровень) ──────────────────────────────────────────────
let unsubInbox: Unsubscribe | null = null;
let unsubMessages: Unsubscribe | null = null;
let unsubTyping: Unsubscribe | null = null;
let myTypingTimeout: ReturnType<typeof setTimeout> | null = null;

// ── startInbox ────────────────────────────────────────────────────────────
export function startInbox(uid: string) {
	unsubInbox?.();

	const q = query(
		collection(db, 'chats'),
		where('participantIds', 'array-contains', uid),
		orderBy('lastMessageTimestamp', 'desc')
	);

	unsubInbox = onSnapshot(
		q,
		(snap) => {
			chats.set(
				snap.docs
					.map((d) => {
						const data = d.data();
						const entries = Object.entries(data.participants || {});
						// Для обычного чата берём партнёра (не себя).
						// Для self-chat эта ветка никогда не выполняется — см. фильтр ниже.
						const partnerEntry = entries.find(([id]) => id !== uid) ?? entries[0];
						const partnerUid = partnerEntry?.[0] ?? '';
						const partnerData = (partnerEntry?.[1] as Record<string, string>) ?? {};
						return {
							id: d.id,
							partner: {
								uid: partnerUid,
								username: partnerData.username ?? 'Unknown',
								avatarUrl: partnerData.avatarUrl ?? null,
								frameId: partnerData.frameId ?? null
							},
							lastMessage: data.lastMessage ?? '',
							lastMessageTimestamp:
								(data.lastMessageTimestamp as Timestamp)?.toDate() ?? null,
							unread: data.unreadCount?.[uid] ?? 0
						};
					})
					// FIX (баг 2): Убираем self-chat из списка — Избранное рендерится
					// отдельной хардкодной кнопкой в sidebar, а дубликат из Firestore
					// не нужен. Также фильтруем битые чаты без partnerUid.
					.filter((c) => c.partner.uid !== '' && c.partner.uid !== uid)
			);
		},
		(err) => {
			console.error('[dmStore] inbox error:', err);
		}
	);
}

// ── stopInbox ─────────────────────────────────────────────────────────────
export function stopInbox() {
	unsubInbox?.();
	unsubInbox = null;
	chats.set([]);
}

// ── openChat ──────────────────────────────────────────────────────────────
export function openChat(dmChat: DMChat, myUid: string) {
	// Закрываем предыдущие подписки
	unsubMessages?.();
	unsubTyping?.();
	unsubMessages = null;
	unsubTyping = null;

	activeChat.set(dmChat);

	// Сразу показываем кэш пока идёт загрузка из Firestore
	const cached = getCached(dmChat.id);
	messages.set(cached.length > 0 ? cached : []);

	const q = query(
		collection(db, 'chats', dmChat.id, 'messages'),
		orderBy('createdAt', 'desc'),
		limit(50)
	);

	unsubMessages = onSnapshot(
		q,
		(snap) => {
			const fresh = snap.docs
				.map((d) => {
					const data = d.data();
					return {
						id: d.id,
						text: data.text ?? '',
						author_uid: data.author_uid ?? '',
						author_username: data.author_username ?? 'unknown',
						createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
						is_deleted: data.is_deleted ?? false,
						type: data.type ?? 'TEXT',
						media_url: data.media_url ?? null,
						sticker_pack_id: data.sticker_pack_id ?? null,
						sticker_id: data.sticker_id ?? null,
						reactions: data.reactions ?? {},
						replyTo: data.replyTo ?? null,
						read_by: data.read_by ?? {}
					};
				})
				.reverse();

			setCache(dmChat.id, fresh);
			messages.set(fresh);
		},
		(err) => {
			console.error('[dmStore] messages error:', err);
		}
	);

	// Typing — только для обычных чатов, не для Избранного (self-chat).
	// У self-chat документ может не существовать до первого сообщения → краш.
	if (dmChat.partner.uid !== myUid) {
		unsubTyping = onSnapshot(
			doc(db, 'chats', dmChat.id),
			(snap) => {
				partnerTyping.set(snap.data()?.typing?.[dmChat.partner.uid] === true);
			},
			(err) => {
				// Тихо глотаем — документ может не существовать для нового чата
				console.warn('[dmStore] typing snapshot error (ok if new chat):', err.code);
			}
		);
	} else {
		partnerTyping.set(false);
	}

	// FIX (баг 1 & 4): Был updateDoc — падал если документ не существует.
	// setDoc + merge: создаёт документ если нет, обновляет если есть.
	// Обнуляем только свой счётчик, не трогаем остальные поля.
	setDoc(
		doc(db, 'chats', dmChat.id),
		{ unreadCount: { [myUid]: 0 } },
		{ merge: true }
	).catch((err) => {
		// Не критично — просто логируем
		console.warn('[dmStore] unread reset failed:', err.code);
	});
}

// ── closeChat ─────────────────────────────────────────────────────────────
export function closeChat(myUid: string, chatId: string) {
	unsubMessages?.();
	unsubTyping?.();
	unsubMessages = null;
	unsubTyping = null;

	activeChat.set(null);
	messages.set([]);
	partnerTyping.set(false);

	// Сбрасываем typing только если это не self-chat
	if (chatId && !chatId.startsWith(`${myUid}_${myUid}`)) {
		updateDoc(doc(db, 'chats', chatId), {
			[`typing.${myUid}`]: false
		}).catch(() => {});
	}
}

// ── setTyping ─────────────────────────────────────────────────────────────
export function setTyping(chatId: string, myUid: string) {
	// Не отправляем typing для self-chat
	if (chatId === `${myUid}_${myUid}`) return;

	if (myTypingTimeout) clearTimeout(myTypingTimeout);

	updateDoc(doc(db, 'chats', chatId), {
		[`typing.${myUid}`]: true
	}).catch(() => {});

	myTypingTimeout = setTimeout(() => {
		updateDoc(doc(db, 'chats', chatId), {
			[`typing.${myUid}`]: false
		}).catch(() => {});
		myTypingTimeout = null;
	}, 2000);
}

// ── destroyDM ─────────────────────────────────────────────────────────────
export function destroyDM(myUid: string, chatId?: string) {
	unsubInbox?.();
	unsubMessages?.();
	unsubTyping?.();
	unsubInbox = null;
	unsubMessages = null;
	unsubTyping = null;

	if (myTypingTimeout) {
		clearTimeout(myTypingTimeout);
		myTypingTimeout = null;
	}

	// Сбрасываем typing при уходе со страницы (только не self-chat)
	if (chatId && !chatId.startsWith(`${myUid}_${myUid}`)) {
		updateDoc(doc(db, 'chats', chatId), {
			[`typing.${myUid}`]: false
		}).catch(() => {});
	}

	chats.set([]);
	activeChat.set(null);
	messages.set([]);
	partnerTyping.set(false);
}