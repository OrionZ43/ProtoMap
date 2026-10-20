// src/lib/admin/day.ts
//
// Сутки для админки: границы дня по Минску, итоги дня по журналу действий
// (functions/src/activity), текст сводки и кривая активности. Чистые функции —
// ими пользуются сервер главной админки, её страница и тесты.

/** Минск живёт по UTC+3 круглый год: летнее время в Беларуси отменено в 2011-м. */
export const MINSK_OFFSET = 3 * 3_600_000;
export const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Начало минских суток, в которые попадает момент `ms`. */
export function dayStart(ms: number): number {
    return Math.floor((ms + MINSK_OFFSET) / DAY) * DAY - MINSK_OFFSET;
}

/** Ключ суток вида 2026-10-20 — по Минску. */
export function dayKey(ms: number): string {
    return new Date(dayStart(ms) + MINSK_OFFSET).toISOString().slice(0, 10);
}

/** Час по Минску, 0–23. */
export function minskHour(ms: number): number {
    return Math.floor((ms - dayStart(ms)) / HOUR);
}

// ── Итоги дня ────────────────────────────────────────────────────────────

/** Игры против казино: их итог и есть результат казино. Дуэли — между игроками. */
export const HOUSE_GAMES = new Set(['slots', 'coinflip', 'crash_bet', 'crash_cashout', 'plinko']);

/** Ставки для «сыграли N раз». Выплата краша — продолжение той же игры. */
const ROUNDS = new Set(['slots', 'coinflip', 'crash_bet', 'plinko']);

/** Начисления от проекта: бонусы, рефералы, шагомер. */
export const BONUSES = new Set(['daily_bonus', 'birthday', 'referral', 'referral_bonus', 'referral_prize', 'stepper']);

/** Что нужно от записи журнала для итогов. */
export interface DayEntry {
    at: number;
    group: string;
    kind: string;
    uid: string | null;
    delta: number | null;
    alert: boolean;
    itemsAdded: string[];
    ref: string | null;
}

export interface DayStats {
    /** Версия подсчёта: изменился подсчёт — сохранённые итоги прошлых дней пересчитаются. */
    v: number;
    events: number;
    /** Сколько разных людей что-то сделали. */
    actors: number;
    rounds: number;
    /** Сколько казино выиграло у игроков; минус — проиграло. */
    casinoNet: number;
    purchases: number;
    /** Самая покупаемая вещь дня (id). */
    topItem: string | null;
    bonuses: number;
    alerts: number;
    /** События по часам, 24 значения. */
    hourly: number[];
}

export const STATS_VERSION = 1;

export function aggregateDay(entries: DayEntry[]): DayStats {
    const actors = new Set<string>();
    const items = new Map<string, number>();
    const stats: DayStats = {
        v: STATS_VERSION, events: 0, actors: 0, rounds: 0, casinoNet: 0,
        purchases: 0, topItem: null, bonuses: 0, alerts: 0, hourly: new Array(24).fill(0)
    };
    for (const e of entries) {
        stats.events++;
        stats.hourly[minskHour(e.at)]++;
        if (e.uid) actors.add(e.uid);
        if (e.alert) stats.alerts++;
        if (e.group !== 'economy') continue;
        const delta = e.delta ?? 0;
        if (HOUSE_GAMES.has(e.kind)) stats.casinoNet -= delta;
        if (ROUNDS.has(e.kind)) stats.rounds++;
        if (BONUSES.has(e.kind)) stats.bonuses += delta;
        if (e.kind === 'purchase') {
            stats.purchases++;
            const id = e.itemsAdded[0] ?? e.ref;
            if (id) items.set(id, (items.get(id) ?? 0) + 1);
        }
    }
    stats.actors = actors.size;
    // Без отрицательного нуля: он печатается как «−0».
    stats.casinoNet += 0;
    let best = 0;
    for (const [id, n] of items) {
        if (n > best) {
            best = n;
            stats.topItem = id;
        }
    }
    return stats;
}

// ── Подробности для раскрытых плиток ─────────────────────────────────────

/** Игры казино по названию: краш — это ставка и выплата вместе. */
export const GAMES = ['slots', 'coinflip', 'crash', 'plinko'] as const;
export type Game = (typeof GAMES)[number];

const gameOf = (kind: string): Game | null =>
    kind === 'crash_bet' || kind === 'crash_cashout' ? 'crash'
        : (GAMES as readonly string[]).includes(kind) ? (kind as Game) : null;

/** По каждой игре: сколько раз сыграли и сколько казино выиграло (минус — проиграло). */
export function gameBreakdown(entries: DayEntry[]): Array<{ game: Game; rounds: number; net: number }> {
    const by = new Map<Game, { game: Game; rounds: number; net: number }>(GAMES.map((g) => [g, { game: g, rounds: 0, net: 0 }]));
    for (const e of entries) {
        if (e.group !== 'economy') continue;
        const game = gameOf(e.kind);
        if (!game) continue;
        const row = by.get(game)!;
        if (ROUNDS.has(e.kind)) row.rounds++;
        row.net -= e.delta ?? 0;
    }
    return [...by.values()].map((r) => ({ ...r, net: r.net + 0 }));
}

/** Самые крупные выигрыши и проигрыши игроков в казино за день — отдельными событиями. */
export function bigMoves<T extends DayEntry>(entries: T[], n: number): { wins: T[]; losses: T[] } {
    const games = entries.filter((e) => e.group === 'economy' && HOUSE_GAMES.has(e.kind) && typeof e.delta === 'number' && e.delta !== 0);
    return {
        wins: games.filter((e) => (e.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, n),
        losses: games.filter((e) => (e.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, n)
    };
}

/** Начисления от проекта по видам: сколько раз и на сколько PC. */
export function bonusBreakdown(entries: DayEntry[]): Array<{ kind: string; count: number; sum: number }> {
    const by = new Map<string, { kind: string; count: number; sum: number }>();
    for (const e of entries) {
        if (e.group !== 'economy' || !BONUSES.has(e.kind)) continue;
        const row = by.get(e.kind) ?? { kind: e.kind, count: 0, sum: 0 };
        row.count++;
        row.sum += e.delta ?? 0;
        by.set(e.kind, row);
    }
    return [...by.values()].sort((a, b) => b.sum - a.sum);
}

/** Кто больше всех сделал за день: число записей журнала и разбивка по группам. */
export function topActors<T extends DayEntry & { username: string | null }>(entries: T[], n: number):
    Array<{ uid: string; username: string; count: number; groups: Record<string, number> }> {
    const by = new Map<string, { uid: string; username: string; count: number; groups: Record<string, number> }>();
    for (const e of entries) {
        if (!e.uid) continue;
        const row = by.get(e.uid) ?? { uid: e.uid, username: e.username || e.uid, count: 0, groups: {} };
        row.count++;
        row.groups[e.group] = (row.groups[e.group] ?? 0) + 1;
        if (e.username) row.username = e.username;
        by.set(e.uid, row);
    }
    return [...by.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

/** Сколько записей в каждой группе журнала. */
export function groupCounts(entries: DayEntry[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of entries) out[e.group] = (out[e.group] ?? 0) + 1;
    return out;
}

// ── Текст сводки ─────────────────────────────────────────────────────────

export type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string;

export interface BriefInput {
    visited: number;
    online: number;
    stats: DayStats;
    topItemName: string | null;
    alerts24h: number;
}

/**
 * Сводка дня обычными словами — пока её не пишет Gemini. Числа помечены
 * [[...]]: страница их выделяет (см. segments).
 */
export function composeBrief(b: BriefInput, tr: Translate, nf: Intl.NumberFormat): string {
    const say = (key: string, values: Record<string, string | number> = {}) => tr(`admin_home.brief.${key}`, { values });
    const parts: string[] = [];

    parts.push(b.visited > 0
        ? say('visited', { count: b.visited }) + (b.online > 0 ? say('online', { count: b.online }) : '')
        : say('visited_none'));

    if (b.stats.rounds > 0) {
        const net = b.stats.casinoNet;
        const result = net > 0 ? say('casino_plus', { amount: nf.format(net) })
            : net < 0 ? say('casino_minus', { amount: nf.format(-net) })
            : say('casino_even');
        parts.push(say('games', { count: b.stats.rounds }) + result);
    } else {
        parts.push(say('games_none'));
    }

    if (b.stats.purchases > 0) {
        parts.push(say('purchases', { count: b.stats.purchases }) + (b.topItemName ? say('purchases_top', { item: b.topItemName }) : ''));
    }

    parts.push(b.alerts24h > 0 ? say('alerts', { count: b.alerts24h }) : say('alerts_none'));
    return parts.map((p) => `${p.trim()}.`).join(' ');
}

/** Текст с пометками [[...]] → куски; помеченные выделяет разметка, без HTML. */
export function segments(text: string): Array<{ text: string; mark: boolean }> {
    return text
        .split(/\[\[|\]\]/)
        .map((part, i) => ({ text: part, mark: i % 2 === 1 }))
        .filter((p) => p.text);
}

// ── Кривая активности ────────────────────────────────────────────────────

export interface Curve {
    line: string;
    area: string;
    peak: { x: number; y: number; index: number; value: number } | null;
}

/**
 * Плавная кривая по точкам (Catmull-Rom → кубические Безье) для SVG
 * шириной `width` и высотой `height`. Верх и низ — с отступом, чтобы пик
 * и нулевая линия не прилипали к краям.
 */
export function curvePath(values: number[], width: number, height: number): Curve {
    if (values.length === 0) return { line: '', area: '', peak: null };
    const top = 14;
    const bottom = height - 8;
    const max = Math.max(...values);
    const pts = values.map((v, i) => ({
        x: values.length === 1 ? width : (i / (values.length - 1)) * width,
        y: max > 0 ? bottom - (v / max) * (bottom - top) : bottom
    }));
    const r = (n: number) => Math.round(n * 10) / 10;

    let line = `M${r(pts[0].x)},${r(pts[0].y)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        // Сглаживание не должно уводить кривую ниже нуля и выше пика.
        const clamp = (y: number) => Math.min(bottom, Math.max(top, y));
        line += ` C${r(c1.x)},${r(clamp(c1.y))} ${r(c2.x)},${r(clamp(c2.y))} ${r(p2.x)},${r(p2.y)}`;
    }
    const last = pts[pts.length - 1];
    const area = `${line} L${r(last.x)},${height} L${r(pts[0].x)},${height} Z`;

    let peak: Curve['peak'] = null;
    if (max > 0) {
        const index = values.indexOf(max);
        peak = { x: r(pts[index].x), y: r(pts[index].y), index, value: max };
    }
    return { line, area, peak };
}
