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
    avatar_url: string;
    social_link: string;
    about_me: string;
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
        const docRef = doc(db, "users", userAuth.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            userProfile = {
                uid: userAuth.uid,
                username: data.username,
                email: userAuth.email,
                avatar_url: data.avatar_url || '',
                social_link: data.social_link || '',
                about_me: data.about_me || '',
            };
        }
        token = await userAuth.getIdToken();
    }

    if (browser) {
        const response = await fetch('/api/auth', {
            method: token ? 'POST' : 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: token ? JSON.stringify({ idToken: token }) : undefined,
        });
        if (!response.ok) {
            console.error("Ошибка синхронизации сессии:", await response.text());
        } else {
            console.log("Сессия успешно синхронизирована с сервером.");
        }
    }

    userStore.set({ user: userProfile, loading: false });
});