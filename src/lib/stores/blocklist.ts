/**
 * Чёрный список (решение Ориона 21.10.2026, «как в Telegram»).
 *
 * Хранение: users/{кто}/blocked/{кого} = { createdAt }. Кого заблокировали,
 * тот не пишет в личку и не комментирует профиль заблокировавшего (это
 * проверяют правила Firestore, Storage и addComment), а профиль ему показывается
 * без аватара, описания и ссылок. В общих чатах всё видно как обычно.
 *
 * - myBlocked — кого заблокировал я: живая подписка на свой список, пока есть вход.
 * - isBlockedBy(uid) — заблокировал ли меня этот человек: свою запись в чужом
 *   списке правила читать разрешают, так что надпись показывается заранее.
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { userStore } from '$lib/stores';

export const myBlocked = writable<Set<string>>(new Set());
/**
 * Пришёл ли первый снимок списка. До него страницы опираются на то, что
 * сказал сервер, после — только на живой список: серверный ответ может быть
 * старым (разблокировал — а страница всё ещё «заблокирован»).
 */
export const blocklistReady = writable(false);

let unsubscribe: (() => void) | null = null;
let subscribedUid: string | null = null;

if (browser) {
    userStore.subscribe(($user) => {
        const uid = $user.user?.uid ?? null;
        if (uid === subscribedUid) return;
        unsubscribe?.();
        unsubscribe = null;
        subscribedUid = uid;
        myBlocked.set(new Set());
        blocklistReady.set(false);
        if (!uid) return;
        unsubscribe = onSnapshot(
            collection(db, 'users', uid, 'blocked'),
            (snap) => {
                myBlocked.set(new Set(snap.docs.map((d) => d.id)));
                blocklistReady.set(true);
            },
            () => myBlocked.set(new Set())
        );
    });
}

function myUid(): string | null {
    return get(userStore).user?.uid ?? null;
}

/** Заблокировал ли меня этот человек. Ошибка чтения — считаем, что нет. */
export async function isBlockedBy(otherUid: string): Promise<boolean> {
    const me = myUid();
    if (!me || !otherUid || otherUid === me) return false;
    try {
        return (await getDoc(doc(db, 'users', otherUid, 'blocked', me))).exists();
    } catch {
        return false;
    }
}

export async function blockUser(uid: string): Promise<void> {
    const me = myUid();
    if (!me || uid === me) return;
    await setDoc(doc(db, 'users', me, 'blocked', uid), { createdAt: serverTimestamp() });
}

export async function unblockUser(uid: string): Promise<void> {
    const me = myUid();
    if (!me) return;
    await deleteDoc(doc(db, 'users', me, 'blocked', uid));
}
