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

export async function refreshUserStore(forceUser?: User | null) {
    const userAuth = forceUser !== undefined ? forceUser : auth.currentUser;
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
}

onAuthStateChanged(auth, async (userAuth: User | null) => {
    await refreshUserStore(userAuth);
});

// --- CHAT STORE ---

type ChatState = {
    isOpen:    boolean;
    hasUnread: boolean;
    dmUnread:  boolean;
    // Если задан — при открытии виджет сразу переходит на DM с этим пользователем
    pendingDM: { uid: string; username: string; avatarUrl: string | null } | null;
};


function createChatStore() {
    const { subscribe, update, set } = writable<ChatState>({
        isOpen:    false,
        hasUnread: false,
        dmUnread:  false,
    });

    return {
        subscribe,
        toggle:      () => update(s => ({ ...s, isOpen: !s.isOpen })),
        open:        () => update(s => ({ ...s, isOpen: true, hasUnread: false })),
        close:       () => update(s => ({ ...s, isOpen: false })),
        setUnread:   (val: boolean) => update(s => ({ ...s, hasUnread: val })),
        setDmUnread: (val: boolean) => update(s => ({ ...s, dmUnread: val })),

        // Открыть виджет сразу на вкладке DM с конкретным пользователем
        openDM: (partner: { uid: string; username: string; avatarUrl: string | null }) =>
            update(s => ({ ...s, isOpen: true, hasUnread: false, pendingDM: partner })),

        // Вызывается из DMInbox когда он обработал pendingDM
        clearPendingDM: () => update(s => ({ ...s, pendingDM: null })),
    };
}

export const chat = createChatStore();