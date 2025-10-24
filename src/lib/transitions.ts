import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// 1. ПЕРЕХОД ДЛЯ "ИСЧЕЗАНИЯ" СТАРОЙ СТРАНИЦЫ
export function glitchOut(node: Element, { duration = 300 }): TransitionConfig {
    return {
        duration,
        css: (t: number) => {
            // t идет от 1 (начало) до 0 (конец)
            const eased_t = cubicOut(t);
            return `
                opacity: ${eased_t};
                filter: blur(${ (1 - eased_t) * 5 }px) grayscale(${1 - eased_t});
                transform: scale(${ 0.98 + (eased_t * 0.02) });
            `;
        }
    };
}

// 2. ПЕРЕХОД ДЛЯ "ПОЯВЛЕНИЯ" НОВОЙ СТРАНИЦЫ
export function scanIn(node: Element, { duration = 400, delay = 200 }): TransitionConfig {
    return {
        duration,
        delay, // Начинаем анимацию с задержкой, чтобы 'out' успел начаться
        css: (t: number) => {
            // t идет от 0 (начало) до 1 (конец)
            return `
                opacity: ${t};
                filter: blur(${ (1 - t) * 5 }px);
                transform: scale(${ 0.99 + (t * 0.01) });
            `;
        }
    };
}