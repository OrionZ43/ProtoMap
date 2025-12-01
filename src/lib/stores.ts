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
    owned_items: string[];
    equipped_frame: string | null;
    equipped_badge: string | null;
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
            // === ФИКС: ПРИНУДИТЕЛЬНО ОБНОВЛЯЕМ СТАТУС ===
            // 1. Скачиваем свежие данные юзера с серверов Auth (включая emailVerified)
            await userAuth.reload();
            // 2. Форсируем обновление токена (true = forceRefresh), чтобы в нем прописался новый статус
            token = await userAuth.getIdToken(true);
            // ==============================================

            const docRef = doc(db, "users", userAuth.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                userProfile = {
                    uid: userAuth.uid,
                    username: data.username,
                    email: userAuth.email,
                    // Теперь тут будет актуальное значение
                    emailVerified: userAuth.emailVerified,
                    avatar_url: data.avatar_url || '',
                    social_link: data.social_link || '',
                    about_me: data.about_me || '',
                    status: data.status || '',
                    casino_credits: data.casino_credits ?? 100,
                    last_daily_bonus: data.last_daily_bonus ? data.last_daily_bonus.toDate() : null,
                    owned_items: data.owned_items || [],
                    equipped_frame: data.equipped_frame || null,
                    equipped_badge: data.equipped_badge || null
                };
            }
        } catch (e) {
            console.error("Ошибка обновления профиля:", e);
        }
    }

    // Синхронизация сессии с сервером SvelteKit (cookies)
    if (browser) {
        try {
            const response = await fetch('/api/auth', {
                method: token ? 'POST' : 'DELETE', // token уже обновлен выше
                headers: { 'Content-Type': 'application/json' },
                body: token ? JSON.stringify({ idToken: token }) : undefined,
            });
            if (!response.ok) {
                console.error("Ошибка синхронизации сессии:", await response.text());
            }
        } catch (e) {
            console.error("Сбой fetch:", e);
        }
    }

    userStore.set({ user: userProfile, loading: false });
});
type ChatState = {
    isOpen: boolean;
};

function createChatStore() {
    const { subscribe, update } = writable<ChatState>({ isOpen: false });

    return {
        subscribe,
        toggle: () => update(state => ({ ...state, isOpen: !state.isOpen })),
        open: () => update(state => ({ ...state, isOpen: true })),
        close: () => update(state => ({ ...state, isOpen: false }))
    };
}

export const chat = createChatStore();