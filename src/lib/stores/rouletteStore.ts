/**
 * src/lib/stores/rouletteStore.ts
 *
 * Подписка на публичный стейт игры в RTDB.
 * ВАЖНО: off() вызывается при unsubscribeFromGame() — экономим Concurrent Connections.
 */
import { writable, get } from 'svelte/store';
import { ref, onValue, off, type Unsubscribe } from 'firebase/database';
import { getRtdb } from '$lib/rtdb';
import type { Items } from '$lib/types/roulette';

/* ══════════════════════════════════════════════════════════
   ПУБЛИЧНЫЙ ТИП (зеркало PubState с бэкенда)
══════════════════════════════════════════════════════════ */
export interface GamePublicState {
  uid:   string;
  turn:  'p' | 'o';
  php:   number;
  ohp:   number;
  mhp:   number;
  pit:   Items;
  oit:   Items;
  sl:    number;
  log:   string;
  st:    'a' | 'p' | 'o';
  pdbl:  boolean;
  odbl:  boolean;
  pskip: boolean;
  oskip: boolean;
  scan:  number | null | undefined;
}

/* ══════════════════════════════════════════════════════════
   STORES
══════════════════════════════════════════════════════════ */
export const rouletteGameId    = writable<string | null>(null);
export const rouletteState     = writable<GamePublicState | null>(null);
export const rouletteLoading   = writable<boolean>(false);

/* ══════════════════════════════════════════════════════════
   ПОДПИСКА / ОТПИСКА
══════════════════════════════════════════════════════════ */

// Хранит функцию отписки от onValue (listener reference для off())
let _listenerRef: ReturnType<typeof ref> | null  = null;
let _listenerFn:  Unsubscribe | null             = null;

export function subscribeToGame(gameId: string): void {
  // Сначала отписываемся от предыдущей (если была)
  _cleanup();

  rouletteLoading.set(true);
  rouletteGameId.set(gameId);

  const db      = getRtdb();
  const gameRef = ref(db, `games/${gameId}`);

  // Запоминаем ref для будущего off()
  _listenerRef = gameRef;

  _listenerFn = onValue(
    gameRef,
    (snapshot) => {
      rouletteLoading.set(false);
      if (snapshot.exists()) {
        rouletteState.set(snapshot.val() as GamePublicState);
      } else {
        // Узел удалён — игра завершена (cleanup с бэкенда)
        rouletteState.set(null);
      }
    },
    (error) => {
      console.error('[rouletteStore] RTDB error:', error);
      rouletteLoading.set(false);
    }
  );
}

export function unsubscribeFromGame(): void {
  _cleanup();
  rouletteGameId.set(null);
  rouletteState.set(null);
  rouletteLoading.set(false);
}

function _cleanup(): void {
  if (_listenerRef && _listenerFn) {
    // off() с конкретным listener — НЕ удаляет другие подписки на тот же ref
    off(_listenerRef, 'value', _listenerFn);
    _listenerRef = null;
    _listenerFn  = null;
  }
}

/** Утилита: возвращает текущий gameId из store без подписки. */
export function getCurrentGameId(): string | null {
  return get(rouletteGameId);
}
