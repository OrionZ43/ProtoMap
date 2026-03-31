// src/lib/stores/dmStore.ts
// Общий стор состояния DM — используется в виджете и на странице /messages

import { writable, derived } from 'svelte/store';
import { db } from '$lib/firebase';
import {
    collection, query, where, orderBy, limit, onSnapshot,
    doc, setDoc, updateDoc, addDoc, serverTimestamp, increment,
    type Unsubscribe, type Timestamp
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
    read_by?: Record<string, any>;
};

// ── Состояние ──────────────────────────────────────────────────────────────
export const chats        = writable<DMChat[]>([]);
export const activeChat   = writable<DMChat | null>(null);
export const messages     = writable<DMMessage[]>([]);
export const partnerTyping = writable(false);
export const totalUnread  = derived(chats, $c => $c.reduce((s, c) => s + c.unread, 0));

// ── Подписки ───────────────────────────────────────────────────────────────
let unsubInbox:    Unsubscribe | null = null;
let unsubMessages: Unsubscribe | null = null;
let unsubTyping:   Unsubscribe | null = null;
let myTypingTimeout: ReturnType<typeof setTimeout>;

export function startInbox(uid: string) {
    unsubInbox?.();
    const q = query(
        collection(db, 'chats'),
        where('participantIds', 'array-contains', uid),
        orderBy('lastMessageTimestamp', 'desc')
    );
    unsubInbox = onSnapshot(q, snap => {
        chats.set(snap.docs.map(d => {
            const data = d.data();
            const partnerEntry = Object.entries(data.participants || {}).find(([id]) => id !== uid);
            const partnerUid   = partnerEntry?.[0] ?? '';
            const partnerData  = partnerEntry?.[1] as any ?? {};
            return {
                id: d.id,
                partner: { uid: partnerUid, username: partnerData.username ?? 'Unknown',
                           avatarUrl: partnerData.avatarUrl ?? null, frameId: partnerData.frameId ?? null },
                lastMessage:          data.lastMessage ?? '',
                lastMessageTimestamp: (data.lastMessageTimestamp as Timestamp)?.toDate() ?? null,
                unread:               data.unreadCount?.[uid] ?? 0,
            };
        }).filter(c => c.partner.uid !== uid && c.partner.username !== 'Unknown'));
    });
}

export function stopInbox() {
    unsubInbox?.();
    chats.set([]);
}

export function openChat(dmChat: DMChat, myUid: string) {
    unsubMessages?.();
    unsubTyping?.();
    activeChat.set(dmChat);

    // Сразу из кэша
    const cached = getCached(dmChat.id);
    if (cached.length > 0) messages.set(cached);
    else messages.set([]);

    const q = query(
        collection(db, 'chats', dmChat.id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(50)
    );
    unsubMessages = onSnapshot(q, snap => {
        const fresh = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id, text: data.text ?? '',
                author_uid: data.author_uid ?? '', author_username: data.author_username ?? 'unknown',
                createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
                is_deleted: data.is_deleted ?? false, type: data.type ?? 'TEXT',
                media_url: data.media_url ?? null,
                sticker_pack_id: data.sticker_pack_id ?? null,
                sticker_id: data.sticker_id ?? null,
                reactions: data.reactions ?? {},
                replyTo: data.replyTo ?? null,
                read_by: data.read_by ?? {},
            };
        }).reverse();
        setCache(dmChat.id, fresh);
        messages.set(fresh);
    });

    // Typing партнёра
    if (dmChat.partner.uid !== myUid) {
        unsubTyping = onSnapshot(doc(db, 'chats', dmChat.id), snap => {
            partnerTyping.set(snap.data()?.typing?.[dmChat.partner.uid] === true);
        });
    }

    // Сброс счётчика
    updateDoc(doc(db, 'chats', dmChat.id), { [`unreadCount.${myUid}`]: 0 }).catch(() => {});
}

export function closeChat(myUid: string, chatId: string) {
    unsubMessages?.();
    unsubTyping?.();
    activeChat.set(null);
    messages.set([]);
    partnerTyping.set(false);
    updateDoc(doc(db, 'chats', chatId), { [`typing.${myUid}`]: false }).catch(() => {});
}

export function setTyping(chatId: string, myUid: string) {
    clearTimeout(myTypingTimeout);
    updateDoc(doc(db, 'chats', chatId), { [`typing.${myUid}`]: true }).catch(() => {});
    myTypingTimeout = setTimeout(() => {
        updateDoc(doc(db, 'chats', chatId), { [`typing.${myUid}`]: false }).catch(() => {});
    }, 2000);
}

export function destroyDM(myUid: string, chatId?: string) {
    unsubInbox?.();
    unsubMessages?.();
    unsubTyping?.();
    if (chatId) updateDoc(doc(db, 'chats', chatId), { [`typing.${myUid}`]: false }).catch(() => {});
    chats.set([]); activeChat.set(null); messages.set([]); partnerTyping.set(false);
}