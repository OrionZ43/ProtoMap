// Сезонные события сайта: какие даты к какому сезону относятся.
// Единственное место с датами — по нему выбираются тема оформления (+layout.svelte),
// фраза в шапке (Navbar) и первоапрельская локаль (src/lib/i18n).

/** Сезоны с собственной темой оформления. */
export type ThemeSeason = 'anniversary' | 'halloween' | 'winter' | 'newyear';

/** Все сезоны. У первого апреля нет темы — только фразы и своя локаль. */
export type Season = ThemeSeason | 'april';

/**
 * Текущий момент для сезонов. Дев-сервер можно запустить «в другой день», чтобы
 * посмотреть сезон заранее: `VITE_PREVIEW_DATE=2026-10-25 npm run dev`. По этой же
 * дате открываются окна продаж сезонных товаров на витрине и приз Плинко.
 * В сборке import.meta.env.DEV — false, и подмены нет.
 */
export function seasonNow(): Date {
    const preview = import.meta.env.DEV ? import.meta.env.VITE_PREVIEW_DATE : undefined;
    const date = preview ? new Date(preview) : null;
    return date && !Number.isNaN(date.getTime()) ? date : new Date();
}

export function getSeason(date: Date = seasonNow()): Season | null {
    const m = date.getMonth(); // 0 — январь
    const d = date.getDate();
    if (m === 3 && d === 1) return 'april';
    if (m === 4 && d >= 4 && d <= 10) return 'anniversary';
    if ((m === 9 && d >= 20) || (m === 10 && d <= 2)) return 'halloween';
    if (m === 11 && d >= 1 && d < 15) return 'winter';
    if ((m === 11 && d >= 15) || (m === 0 && d <= 14)) return 'newyear';
    return null;
}

/** Сезон, у которого есть тема оформления, или null. */
export function getThemeSeason(date: Date = seasonNow()): ThemeSeason | null {
    const season = getSeason(date);
    return season === 'april' ? null : season;
}

export const isAprilFools = (date: Date = seasonNow()) => getSeason(date) === 'april';
