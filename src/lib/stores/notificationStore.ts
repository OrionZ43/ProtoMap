// src/lib/stores/notificationStore.ts
//
// Лента уведомлений сайта: подписка на users/{uid}/notifications (владелец
// читает только свои — см. firestore.rules). Пишет ленту сервер (Cloud
// Functions), клиент только читает и помечает прочитанным.

import { writable, derived, get } from 'svelte/store';
import { db } from '$lib/firebase';
import {
	collection,
	query,
	orderBy,
	limit,
	onSnapshot,
	doc,
	updateDoc,
	type Unsubscribe
} from 'firebase/firestore';
import { toJsDate } from '$lib/utils/firestoreDate';

export type AppNotification = {
	id: string;
	type: string;
	actor: { uid: string; username: string; avatarUrl: string | null };
	text: string;
	target: Record<string, string>;
	read: boolean;
	createdAt: Date | null;
};

/** true только для обычного словаря — не массив, не null, не примитив. */
function isPlainMap(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── Состояние ──────────────────────────────────────────────────────────────
export const notifications = writable<AppNotification[]>([]);
export const unreadNotifications = derived(notifications, ($n) =>
	$n.reduce((s, x) => s + (x.read ? 0 : 1), 0)
);

// ── Подписка (модуль-уровень) ───────────────────────────────────────────────
let unsub: Unsubscribe | null = null;
let currentUid: string | null = null;

// ── startNotifications ───────────────────────────────────────────────────────
export function startNotifications(uid: string) {
	if (!uid) return;
	// Уже слушаем этого же пользователя — не переподписываемся на каждый тик.
	if (currentUid === uid && unsub) return;
	unsub?.();
	currentUid = uid;

	const q = query(
		collection(db, 'users', uid, 'notifications'),
		orderBy('createdAt', 'desc'),
		limit(30)
	);

	unsub = onSnapshot(
		q,
		(snap) => {
			notifications.set(
				snap.docs.map((d) => {
					const data = d.data();
					const actor = isPlainMap(data.actor) ? data.actor : {};
					return {
						id: d.id,
						type: typeof data.type === 'string' ? data.type : 'unknown',
						actor: {
							uid: typeof actor.uid === 'string' ? actor.uid : '',
							username: typeof actor.username === 'string' ? actor.username : '',
							avatarUrl: typeof actor.avatarUrl === 'string' ? actor.avatarUrl : null
						},
						text: typeof data.text === 'string' ? data.text : '',
						target: isPlainMap(data.target) ? (data.target as Record<string, string>) : {},
						read: data.read === true,
						// createdAt сервер пишет serverTimestamp; toJsDate на всякий случай
						// терпит и Timestamp, и число, и строку, и null.
						createdAt: toJsDate(data.createdAt)
					};
				})
			);
		},
		(err) => {
			console.error('[notificationStore] error:', err);
		}
	);
}

// ── stopNotifications ────────────────────────────────────────────────────────
export function stopNotifications() {
	unsub?.();
	unsub = null;
	currentUid = null;
	notifications.set([]);
}

// ── markRead ──────────────────────────────────────────────────────────────────
// Пометить одно прочитанным (read false→true). Правило разрешает ровно это
// изменение и только когда resource.read==false; уже прочитанное не трогаем.
export async function markRead(id: string) {
	if (!currentUid) return;
	const n = get(notifications).find((x) => x.id === id);
	if (!n || n.read) return;
	try {
		await updateDoc(doc(db, 'users', currentUid, 'notifications', id), { read: true });
	} catch (e) {
		console.warn('[notificationStore] markRead failed:', e);
	}
}

// ── markAllRead ────────────────────────────────────────────────────────────────
// Помечаем ПО ОДНОМУ, не атомарным пакетом: правило отклонит batch, в котором
// есть уже-прочитанный документ (требует resource.read==false). Трогаем только
// непрочитанные; гонку (успели прочитать) тихо глотаем.
export async function markAllRead() {
	const uid = currentUid;
	if (!uid) return;
	const unread = get(notifications).filter((x) => !x.read);
	await Promise.all(
		unread.map((n) =>
			updateDoc(doc(db, 'users', uid, 'notifications', n.id), { read: true }).catch(() => {})
		)
	);
}
