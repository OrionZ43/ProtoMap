import { writable } from 'svelte/store';
import { rtdb } from '$lib/firebase';
import { ref, onValue, off, type DatabaseReference } from 'firebase/database';
import type { PubState } from '$lib/types/roulette';

export const rouletteStore = writable<PubState | null>(null);

let currentGameRef: DatabaseReference | null = null;

export function subscribeToGame(gameId: string) {
    if (currentGameRef) {
        off(currentGameRef);
    }

    currentGameRef = ref(rtdb, `games/${gameId}`);

    onValue(currentGameRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val() as PubState;
            // RTDB doesn't store empty arrays, so we need to default them
            data.pit = data.pit || [];
            data.oit = data.oit || [];
            data.log = data.log || [];
            rouletteStore.set(data);
        } else {
            rouletteStore.set(null);
        }
    });
}

export function unsubscribeFromGame() {
    if (currentGameRef) {
        off(currentGameRef);
        currentGameRef = null;
    }
    rouletteStore.set(null);
}
