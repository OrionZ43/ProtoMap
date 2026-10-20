// src/routes/admin/+page.server.ts
//
// «Сегодня» — главная админки: сводка дня, плитки по разделам и подробности,
// в которые плитки раскрываются. Источники: журнал действий (activity_log,
// functions/src/activity), присутствие в Realtime Database (status/{uid}),
// пользователи, витрина и банк казино.
//
// Сегодняшние итоги считаются на лету — записей за день немного. Итоги прошлых
// дней (столбики казино за неделю) считаются один раз и ложатся в
// admin_daily/{день}: закончившийся день больше не меняется. Разрешающего
// правила для admin_daily в firestore.rules нет — клиентам она закрыта, читает
// и пишет её только сервер.

import { firestoreAdmin, rtdbAdmin } from '$lib/server/firebase.admin';
import { error, redirect } from '@sveltejs/kit';
import { ADMIN_UIDS } from '$env/static/private';
import { Timestamp, type DocumentReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { toRow, type ActivityRow } from '$lib/server/activityRows';
import {
    aggregateDay, bigMoves, bonusBreakdown, dayKey, dayStart, DAY, gameBreakdown, groupCounts, STATS_VERSION,
    topActors, type DayStats
} from '$lib/admin/day';
import { getThemeSeason } from '$lib/seasonal/seasons';
import type { PageServerLoad } from './$types';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

/** Потолок записей за сутки. Журнал пока набирает десятки; упрёмся — итоги занизятся. */
const DAY_LIMIT = 5000;
const WEEK = 7;
/** Длина списков в раскрытых плитках. */
const LIST = 40;
const VISITORS = 150;
const NEWCOMERS = 50;

const activity = () => firestoreAdmin.collection('activity_log');
const users = () => firestoreAdmin.collection('users');

/** Ошибка одной плитки не должна ронять всю страницу. */
async function safe<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await run();
    } catch (e) {
        console.error(`[admin/сегодня] ${what}:`, e);
        return fallback;
    }
}

async function entriesBetween(from: number, to?: number): Promise<ActivityRow[]> {
    let q = activity().where('at', '>=', Timestamp.fromMillis(from));
    if (to !== undefined) q = q.where('at', '<', Timestamp.fromMillis(to));
    const snap = await q.orderBy('at', 'desc').limit(DAY_LIMIT).get();
    return snap.docs.map((d) => toRow(d.id, d.data()));
}

/** Итоги закончившегося дня: из admin_daily или посчитать и сохранить. */
async function pastDay(start: number): Promise<DayStats> {
    const ref = firestoreAdmin.collection('admin_daily').doc(dayKey(start));
    const cached = (await ref.get()).get('stats') as DayStats | undefined;
    if (cached?.v === STATS_VERSION) return cached;
    const stats = aggregateDay(await entriesBetween(start, start + DAY));
    await ref.set({ stats, computedAt: Timestamp.now() }, { merge: true });
    return stats;
}

interface Presence {
    state?: unknown;
    last_changed?: unknown;
}

/**
 * Кто заходил сегодня — по статусам присутствия, свежие сверху. «online» с
 * прошлых дней не считаем: таких зависших статусов в базе много — клиент
 * закрылся, не успев записать «offline».
 */
async function presence(todayStart: number) {
    const all = ((await rtdbAdmin().ref('status').get()).val() ?? {}) as Record<string, Presence>;
    return Object.entries(all)
        .map(([uid, p]) => ({ uid, online: p?.state === 'online', at: typeof p?.last_changed === 'number' ? p.last_changed : 0 }))
        .filter((p) => p.at >= todayStart)
        .sort((a, b) => b.at - a.at);
}

/** Ники и аватарки по uid; getAll — пачками по 100. */
async function profiles(uids: string[]): Promise<Map<string, { username: string; avatar: string | null }>> {
    const out = new Map<string, { username: string; avatar: string | null }>();
    for (let i = 0; i < uids.length; i += 100) {
        const refs: DocumentReference[] = uids.slice(i, i + 100).map((uid) => users().doc(uid));
        if (refs.length === 0) continue;
        for (const s of await firestoreAdmin.getAll(...refs)) {
            out.set(s.id, { username: String(s.get('username') ?? '?'), avatar: (s.get('avatar_url') as string | undefined) || null });
        }
    }
    return out;
}

const millis = (v: unknown): number | null =>
    v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as Timestamp).toMillis() : null;

const pick = (rows: ActivityRow[], test: (r: ActivityRow) => boolean) => rows.filter(test).slice(0, LIST);

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    if (!adminList.includes(locals.user.uid)) throw error(403, 'ОТКАЗАНО В ДОСТУПЕ.');

    const now = Date.now();
    const todayStart = dayStart(now);
    const lastDay = Timestamp.fromMillis(now - DAY);
    const weekAgo = Timestamp.fromMillis(now - WEEK * DAY);

    // Сводка дня от Gemini — пишут её функции (functions/src/activity/brief.ts):
    // в 21:00 вместе с дайджестом и по просьбе этой страницы (refreshAdminBrief).
    const brief = await safe('сводка Gemini', async () => {
        const b = (await firestoreAdmin.collection('admin_daily').doc(dayKey(now)).get()).get('brief');
        if (!b || typeof b.ru !== 'string') return null;
        return {
            ru: b.ru as string,
            en: typeof b.en === 'string' ? (b.en as string) : (b.ru as string),
            at: (b.at?.toMillis?.() as number | undefined) ?? 0,
            scope: (b.scope === 'day' ? 'day' : 'today') as 'day' | 'today'
        };
    }, null);

    const [todayRows, pastWeek, visits, newWeek, total, newcomerDocs, alertsCount, alerts, feed, bank, shop] = await Promise.all([
        safe('журнал за сегодня', () => entriesBetween(todayStart), [] as ActivityRow[]),
        safe('итоги прошлых дней',
            () => Promise.all(Array.from({ length: WEEK - 1 }, (_, i) => pastDay(todayStart - (WEEK - 1 - i) * DAY))),
            [] as DayStats[]),
        safe('присутствие', () => presence(todayStart), [] as Array<{ uid: string; online: boolean; at: number }>),
        safe('новые за неделю', async () => (await users().where('createdAt', '>=', weekAgo).count().get()).data().count, 0),
        safe('всего пользователей', async () => (await users().count().get()).data().count, 0),
        safe('список новых',
            async () => (await users().where('createdAt', '>=', weekAgo).orderBy('createdAt', 'desc').limit(NEWCOMERS).get()).docs,
            [] as QueryDocumentSnapshot[]),
        // Индекс (alert, at) построен по убыванию at — orderBy нужен и подсчёту.
        safe('тревоги',
            async () => (await activity().where('alert', '==', true).where('at', '>=', lastDay).orderBy('at', 'desc').count().get()).data().count, 0),
        safe('список тревог',
            async () => (await activity().where('alert', '==', true).where('at', '>=', lastDay).orderBy('at', 'desc').limit(LIST).get())
                .docs.map((d) => toRow(d.id, d.data())),
            [] as ActivityRow[]),
        safe('лента', async () => (await activity().orderBy('at', 'desc').limit(LIST).get()).docs.map((d) => toRow(d.id, d.data())), [] as ActivityRow[]),
        safe('банк', async () => Number((await firestoreAdmin.collection('system').doc('casino_stats').get()).get('bank_balance') ?? 0), 0),
        safe('витрина', async () => (await firestoreAdmin.collection('shop_items').get()).docs, [] as QueryDocumentSnapshot[])
    ]);

    const today = aggregateDay(todayRows);
    const days = [...pastWeek, today];
    const week = days.map((s, i) => ({ key: dayKey(todayStart - (days.length - 1 - i) * DAY), net: s.casinoNet }));

    // ── Люди ──────────────────────────────────────────────────────────────
    const shown = visits.slice(0, VISITORS);
    const known = await safe('профили', () => profiles(shown.map((v) => v.uid)), new Map());
    const visitors = shown.map((v) => ({ uid: v.uid, online: v.online, at: v.at, ...(known.get(v.uid) ?? { username: '?', avatar: null }) }));
    const newcomers = newcomerDocs.map((d) => ({
        uid: d.id,
        username: String(d.get('username') ?? '?'),
        avatar: (d.get('avatar_url') as string | undefined) || null,
        at: millis(d.get('createdAt')) ?? 0
    }));

    const itemNames: Record<string, string> = {};
    for (const d of shop) itemNames[d.id] = String(d.get('name') ?? d.id);

    // ── Сезон — по вещам витрины со сроком продажи, которые продаются сейчас ──
    const limited = shop
        .filter((d) => d.get('is_hidden') !== true)
        .map((d) => ({ id: d.id, from: millis(d.get('available_from')), until: millis(d.get('available_until')) }))
        .filter((x): x is { id: string; from: number | null; until: number } =>
            x.until !== null && x.until > now && (x.from === null || x.from <= now));

    let season: {
        theme: string; until: number; day: number; total: number; sold: number;
        items: Array<{ id: string; name: string; sold: number }>;
    } | null = null;
    if (limited.length > 0) {
        const from = Math.min(...limited.map((x) => x.from ?? todayStart));
        const until = Math.max(...limited.map((x) => x.until));
        const sold = new Map(limited.map((x) => [x.id, 0]));
        await safe('продажи сезона', async () => {
            const s = await activity().where('group', '==', 'economy').where('at', '>=', Timestamp.fromMillis(from))
                .orderBy('at', 'desc').limit(DAY_LIMIT).get();
            for (const d of s.docs) {
                const r = toRow(d.id, d.data());
                const id = r.itemsAdded[0] ?? r.ref ?? '';
                if (r.kind === 'purchase' && sold.has(id)) sold.set(id, sold.get(id)! + 1);
            }
        }, undefined);
        const items = [...sold].map(([id, n]) => ({ id, name: itemNames[id] ?? id, sold: n })).sort((a, b) => b.sold - a.sold);
        season = {
            theme: getThemeSeason(new Date(now)) ?? 'default',
            until,
            day: Math.floor((todayStart - dayStart(from)) / DAY) + 1,
            total: Math.round((dayStart(until - 1) - dayStart(from)) / DAY) + 1,
            sold: items.reduce((s, x) => s + x.sold, 0),
            items
        };
    }

    // ── Подробности по разделам — из сегодняшнего журнала ─────────────────
    const moves = bigMoves(todayRows, 5);
    const details = {
        games: gameBreakdown(todayRows),
        wins: moves.wins,
        losses: moves.losses,
        bonuses: bonusBreakdown(todayRows),
        active: topActors(todayRows, 10),
        groups: groupCounts(todayRows),
        purchases: pick(todayRows, (r) => r.kind === 'purchase'),
        spent: todayRows.filter((r) => r.kind === 'purchase').reduce((s, r) => s - (r.delta ?? 0), 0),
        chat: pick(todayRows, (r) => r.kind === 'chat'),
        comments: pick(todayRows, (r) => r.kind.startsWith('profile_comment')),
        channels: pick(todayRows, (r) => r.kind.startsWith('channel_')),
        map: pick(todayRows, (r) => r.group === 'map'),
        moderation: pick(todayRows, (r) => r.group === 'moderation' || r.kind === 'report'),
        admin: pick(todayRows, (r) => r.group === 'admin'),
        counts: {
            chat: todayRows.filter((r) => r.kind === 'chat').length,
            comments: todayRows.filter((r) => r.kind === 'profile_comment').length,
            channels: todayRows.filter((r) => r.kind === 'channel_post' || r.kind === 'channel_comment').length,
            map: todayRows.filter((r) => r.group === 'map').length,
            moderation: todayRows.filter((r) => r.group === 'moderation' || r.kind === 'report').length,
            admin: todayRows.filter((r) => r.group === 'admin').length
        }
    };

    return {
        now,
        name: locals.user.username ?? '',
        brief,
        today,
        week,
        people: {
            visited: visits.length,
            online: visits.filter((v) => v.online).length,
            newWeek,
            total,
            visitors,
            newcomers
        },
        attention: { count: alertsCount, list: alerts },
        feed,
        bank,
        season,
        itemNames,
        topItemName: today.topItem ? itemNames[today.topItem] ?? today.topItem : null,
        details
    };
};
