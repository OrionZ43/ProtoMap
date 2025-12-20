import { writable, type Writable } from 'svelte/store';
import { auth } from '$lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { browser } from '$app/environment';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';

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
    daily_streak: number;        // Серия входов
    owned_items: string[];
    equipped_frame: string | null;
    equipped_badge: string | null;
    equipped_bg: string | null;  // Фон профиля
    blocked_uids: string[];      // Черный список
};

type AuthStore = {
    user: UserProfile | null;
    loading: boolean;
};

export const userStore: Writable<AuthStore> = writable({
    user: null,
    loading: true,
});

onAuthStateChanged(auth, async (userAuth: User | null) => {
    let userProfile: UserProfile | null = null;
    let token: string | null = null;

    if (userAuth) {
        try {
            // Принудительно обновляем статус (например, emailVerified)
            await userAuth.reload();
            token = await userAuth.getIdToken(true);

            const docRef = doc(db, "users", userAuth.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                userProfile = {
                    uid: userAuth.uid,
                    username: data.username,
                    email: userAuth.email,
                    emailVerified: userAuth.emailVerified,
                    avatar_url: data.avatar_url || '',
                    social_link: data.social_link || '',
                    about_me: data.about_me || '',
                    status: data.status || '',
                    casino_credits: data.casino_credits ?? 100,
                    last_daily_bonus: data.last_daily_bonus ? data.last_daily_bonus.toDate() : null,
                    daily_streak: data.daily_streak || 0,
                    owned_items: data.owned_items || [],
                    equipped_frame: data.equipped_frame || null,
                    equipped_badge: data.equipped_badge || null,
                    equipped_bg: data.equipped_bg || null,
                    blocked_uids: data.blocked_uids || []
                };
            }
        } catch (e) {
            console.error("Ошибка обновления профиля:", e);
        }
    }

    // Синхронизация сессии с сервером SvelteKit (cookies)
    if (browser) {
        try {
            await fetch('/api/auth', {
                method: token ? 'POST' : 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: token ? JSON.stringify({ idToken: token }) : undefined,
            });
        } catch (e) {
            console.error("Сбой fetch:", e);
        }
    }

    userStore.set({ user: userProfile, loading: false });
});

// --- CHAT STORE ---

type ChatState = {
    isOpen: boolean;
    hasUnread: boolean; // Флаг непрочитанных сообщений
};

function createChatStore() {
    const { subscribe, update, set } = writable<ChatState>({
        isOpen: false,
        hasUnread: false
    });

    return {
        subscribe,
        toggle: () => update(state => ({ ...state, isOpen: !state.isOpen })),
        open: () => update(state => ({ ...state, isOpen: true, hasUnread: false })), // При открытии сбрасываем уведомление
        close: () => update(state => ({ ...state, isOpen: false })),
        setUnread: (val: boolean) => update(state => ({ ...state, hasUnread: val }))
    };
}

export const chat = createChatStore();