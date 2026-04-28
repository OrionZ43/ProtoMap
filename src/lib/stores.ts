import { writable, type Writable } from 'svelte/store';
import { auth } from '$lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { browser } from '$app/environment';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { initPresence, setOffline } from '$lib/client/presence';

export type UserProfile = {
    uid: string;
    username: string;
    email: string | null;
    emailVerified: boolean;
    avatar_url: string;
    social_link: string;
    about_me: string;
    status?: string;
    casino_credits: number;
    last_daily_bonus: Date | null;
    daily_streak: number;
    owned_items: string[];
    equipped_frame: string | null;
    equipped_badge: string | null;
    equipped_bg: string | null;
    blocked_uids: string[];
};

type AuthStore = {
    user: UserProfile | null;
    loading: boolean;
};

export const userStore: Writable<AuthStore> = writable({
    user: null,
    loading: true,
});

let profileUnsubscribe: Unsubscribe | null = null;
let lastUid: string | null = null;

onAuthStateChanged(auth, async (userAuth: User | null) => {
    // Чистим старую подписку при любом изменении Auth
    if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
    }

    if (!userAuth) {
        // Логика выхода (сброс кук и стора)

        if (lastUid) {
            setOffline(lastUid);
            lastUid = null;
        }

        if (browser) {
            try {
                await fetch('/api/auth', { method: 'DELETE' });
            } catch (e) {
                console.error("Сбой fetch:", e);
            }
        }
        userStore.set({ user: null, loading: false });
        return;
    }


    lastUid = userAuth.uid;
    initPresence(userAuth.uid);

    try {
        // Синхронизация сессии для SSR

        const token = await userAuth.getIdToken(true);

        if (browser) {
            try {
                await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken: token }),
                });
            } catch (e) {
                console.error("Сбой fetch:", e);
            }
        }

        // Подписываемся на документ в реальном времени
        const docRef = doc(db, "users", userAuth.uid);
        profileUnsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const userProfile: UserProfile = {
                    uid: userAuth.uid,
                    username: data.username,
                    email: userAuth.email,
                    emailVerified: userAuth.emailVerified,
                    avatar_url: data.avatar_url || '',
                    social_link: data.social_link || '',
                    about_me: data.about_me || '',
                    status: data.status || '',
                    casino_credits: data.casino_credits ?? 100,
                    last_daily_bonus: data.last_daily_bonus && typeof data.last_daily_bonus.toDate === 'function' 
                        ? data.last_daily_bonus.toDate() 
                        : null,
                    daily_streak: data.daily_streak || 0,
                    owned_items: data.owned_items || [],
                    equipped_frame: data.equipped_frame || null,
                    equipped_badge: data.equipped_badge || null,
                    equipped_bg: data.equipped_bg || null,
                    blocked_uids: data.blocked_uids || []
                };
                userStore.set({ user: userProfile, loading: false });
            } else {
                // Документа еще нет в базе (например, при регистрации через Google)
                userStore.set({ user: null, loading: true });
            }
        }, (err) => {
            console.error("Ошибка onSnapshot профиля:", err);
            userStore.set({ user: null, loading: false });
        });

    } catch (e) {
        console.error("Ошибка инициализации профиля:", e);
        userStore.set({ user: null, loading: false });
    }
});

// --- CHAT STORE (без изменений) ---
type ChatState = {
    isOpen: boolean;
    hasUnread: boolean;
    dmUnread: boolean;
    pendingDM: { uid: string; username: string; avatarUrl: string | null } | null;
};

function createChatStore() {
    const { subscribe, update } = writable<ChatState>({
        isOpen: false,
        hasUnread: false,
        dmUnread: false,
        pendingDM: null
    });

    return {
        subscribe,
        toggle: () => update(s => ({ ...s, isOpen: !s.isOpen })),
        open: () => update(s => ({ ...s, isOpen: true, hasUnread: false })),
        close: () => update(s => ({ ...s, isOpen: false })),
        setUnread: (val: boolean) => update(s => ({ ...s, hasUnread: val })),
        setDmUnread: (val: boolean) => update(s => ({ ...s, dmUnread: val })),
        openDM: (partner: { uid: string; username: string; avatarUrl: string | null }) =>
            update(s => ({ ...s, isOpen: true, hasUnread: false, pendingDM: partner })),
        clearPendingDM: () => update(s => ({ ...s, pendingDM: null })),
    };
}

export const chat = createChatStore();