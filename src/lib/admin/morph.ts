// src/lib/admin/morph.ts
//
// Плитка главной админки «вырастает» в карточку с подробностями и обратно:
// пара send/receive из crossfade переносит элемент с места плитки на место
// карточки по общему ключу. Общая для плиток и карточки — поэтому отдельный модуль.

import { crossfade, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

const reduced = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export const [send, receive] = crossfade({
    duration: () => (reduced() ? 0 : 420),
    easing: cubicOut,
    fallback: (node) => fade(node, { duration: reduced() ? 0 : 180 })
});
