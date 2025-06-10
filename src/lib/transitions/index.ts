import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export function glitch(node: Element, { duration = 400 }): TransitionConfig {
    return {
        duration,
        css: (t: number) => {
            return '';
        }
    };
}