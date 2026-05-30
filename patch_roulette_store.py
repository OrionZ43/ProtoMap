with open('src/lib/stores/rouletteStore.ts', 'r') as f:
    content = f.read()

# 1. imports
imports_old = """import { writable, get } from 'svelte/store';
import { ref, onValue, off, type Unsubscribe } from 'firebase/database';
import { getRtdb } from '$lib/rtdb';
import type { Items } from '$lib/types/roulette';"""

imports_new = """import { writable, get } from 'svelte/store';
import { ref, onValue, off, type Unsubscribe } from 'firebase/database';
import { getRtdb } from '$lib/rtdb';
import type { Items, GameEvent } from '$lib/types/roulette';"""
content = content.replace(imports_old, imports_new)

# 2. Add stores
stores_old = """export const rouletteGameId    = writable<string | null>(null);
export const rouletteState     = writable<GamePublicState | null>(null);
export const rouletteLoading   = writable<boolean>(false);"""

stores_new = """export const rouletteGameId    = writable<string | null>(null);
export const rouletteState     = writable<GamePublicState | null>(null);
export const rouletteLoading   = writable<boolean>(false);

export const actionQueue     = writable<GameEvent[]>([]);
export const isPlayingQueue  = writable<boolean>(false);
export const currentOrionSprite = writable<OrionSprite>('idle');

export type OrionSprite = 'idle' | 'holding_gun' | 'aiming_viewer' | 'aiming_self';"""
content = content.replace(stores_old, stores_new)

# 3. Add events to GamePublicState
pubstate_old = """  pskip: boolean;
  oskip: boolean;
  scan:  number | null | undefined;
}"""

pubstate_new = """  pskip: boolean;
  oskip: boolean;
  scan:  number | null | undefined;
  events?: GameEvent[];
}"""
content = content.replace(pubstate_old, pubstate_new)

# 4. update subscribeToGame logic
subscribe_old = """      if (snapshot.exists()) {
        rouletteState.set(snapshot.val() as GamePublicState);
      } else {"""

subscribe_new = """      if (snapshot.exists()) {
        const newState = snapshot.val() as GamePublicState;

        newState.events = Array.isArray(newState.events)
          ? newState.events
          : Object.values(newState.events ?? {});

        rouletteState.set(newState);

        if (newState.events && newState.events.length > 0) {
          actionQueue.update(q => [...q, ...newState.events!]);
        }
      } else {"""
content = content.replace(subscribe_old, subscribe_new)

with open('src/lib/stores/rouletteStore.ts', 'w') as f:
    f.write(content)
