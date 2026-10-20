// src/lib/admin/format.ts
//
// Числа и время в админке — по языку интерфейса и по Минску.

import { dayKey } from './day';

export interface Formats {
    nf: Intl.NumberFormat;
    /** «+1 234» / «−50» / «0». */
    signed: (n: number) => string;
    /** «16:41». */
    clock: (at: number) => string;
    /** Сегодня — «16:41», раньше — «18.10 16:41». */
    when: (at: number, now: number) => string;
    /** «3 ноября». */
    dayMonth: (at: number) => string;
}

export function formats(locale: string | null | undefined): Formats {
    const lang = locale?.startsWith('en') ? 'en-GB' : 'ru-RU';
    const nf = new Intl.NumberFormat(lang);
    const clock = new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Minsk', hour: '2-digit', minute: '2-digit' });
    const short = new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit' });
    const dayMonth = new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Minsk', day: 'numeric', month: 'long' });
    return {
        nf,
        signed: (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf.format(Math.abs(n))}`,
        clock: (at) => clock.format(at),
        when: (at, now) => (dayKey(at) === dayKey(now) ? clock.format(at) : `${short.format(at)} ${clock.format(at)}`),
        dayMonth: (at) => dayMonth.format(at)
    };
}
