// src/routes/admin/activity/+page.server.ts
//
// Журнал действий (functions/src/activity). Читается только здесь, через
// Admin SDK: правила закрывают коллекцию для клиентов.
//
// Индексы под фильтры — в firestore.indexes.json: (uid, at), (target, at),
// (group, at), (alert, at). Сочетания фильтров досеиваются в памяти.

import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, redirect } from '@sveltejs/kit';
import { ADMIN_UIDS } from '$env/static/private';
import { Timestamp, type Query } from 'firebase-admin/firestore';
import { toRow, type ActivityRow } from '$lib/server/activityRows';
import type { PageServerLoad } from './$types';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

const PAGE = 100;
const GROUPS = ['economy', 'moderation', 'profile', 'content', 'account', 'admin', 'map'];
const PERIODS: Record<string, number> = { '1': 1, '7': 7, '30': 30, '180': 180 };
const DAY = 86_400_000;

const GAMES = new Set(['slots', 'coinflip', 'crash_bet', 'crash_cashout', 'plinko', 'synthesize', 'duel']);
const BONUSES = new Set(['daily_bonus', 'birthday', 'referral', 'referral_bonus', 'referral_prize', 'stepper']);
const ADMIN_ECON = new Set(['admin_credits', 'admin_items', 'admin_migrate']);

/** Код gRPC FAILED_PRECONDITION: запросу нужен индекс, которого ещё нет (или он строится). */
const FAILED_PRECONDITION = 9;

/**
 * Запрос, которому нужен составной индекс. Пока индекс строится (первые
 * минуты после деплоя), страница не падает, а показывает пометку.
 */
async function indexed<T>(run: () => Promise<T>, fallback: T, onMissing: () => void): Promise<T> {
    try {
        return await run();
    } catch (e) {
        if ((e as { code?: number }).code !== FAILED_PRECONDITION) throw e;
        onMissing();
        return fallback;
    }
}

/** Пользователь по uid или точному нику. */
async function findUser(query: string) {
    const users = firestoreAdmin.collection('users');
    if (!query.includes('/')) {
        const byId = await users.doc(query).get();
        if (byId.exists) return byId;
    }
    const byName = await users.where('username', '==', query).limit(1).get();
    return byName.empty ? null : byName.docs[0];
}

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, '/login');
    if (!adminList.includes(locals.user.uid)) throw error(403, 'ОТКАЗАНО В ДОСТУПЕ.');

    const userQuery = (url.searchParams.get('user') ?? '').trim();
    const groupParam = url.searchParams.get('group') ?? '';
    const group = GROUPS.includes(groupParam) ? groupParam : '';
    const alertsOnly = url.searchParams.get('alerts') === '1';
    const daysParam = url.searchParams.get('days') ?? '1';
    const days = PERIODS[daysParam] ?? 1;
    const before = Number(url.searchParams.get('before')) || null;

    const col = firestoreAdmin.collection('activity_log');
    const since = Timestamp.fromMillis(Date.now() - days * DAY);
    const window = (q: Query) => {
        let r = q.where('at', '>=', since);
        if (before) r = r.where('at', '<', Timestamp.fromMillis(before));
        return r.orderBy('at', 'desc');
    };

    // ── Человек ───────────────────────────────────────────────────────────
    let user: { uid: string; username: string; balance: number; isBanned: boolean } | null = null;
    let userNotFound = false;
    if (userQuery) {
        const snap = await findUser(userQuery);
        if (snap) {
            user = {
                uid: snap.id,
                username: String(snap.get('username') ?? snap.id),
                balance: Number(snap.get('casino_credits') ?? 0),
                isBanned: snap.get('isBanned') === true
            };
        } else {
            userNotFound = true;
        }
    }

    let indexBuilding = false;
    const missing = () => { indexBuilding = true; };
    const docs = (q: Query) => indexed(async () => (await q.get()).docs, [], missing);

    // ── Лента ─────────────────────────────────────────────────────────────
    let rows: ActivityRow[] = [];
    if (!userNotFound) {
        if (user) {
            const [mine, aboutMe] = await Promise.all([
                docs(window(col.where('uid', '==', user.uid)).limit(PAGE)),
                docs(window(col.where('target', '==', user.uid)).limit(PAGE))
            ]);
            const seen = new Map<string, ActivityRow>();
            for (const d of [...mine, ...aboutMe]) seen.set(d.id, toRow(d.id, d.data()));
            rows = [...seen.values()];
        } else if (alertsOnly) {
            rows = (await docs(window(col.where('alert', '==', true)).limit(PAGE))).map((d) => toRow(d.id, d.data()));
        } else if (group) {
            rows = (await docs(window(col.where('group', '==', group)).limit(PAGE))).map((d) => toRow(d.id, d.data()));
        } else {
            rows = (await window(col).limit(PAGE).get()).docs.map((d) => toRow(d.id, d.data()));
        }
        if (group) rows = rows.filter((r) => r.group === group);
        if (alertsOnly) rows = rows.filter((r) => r.alert);
        rows.sort((a, b) => b.at - a.at);
        rows = rows.slice(0, PAGE);
    }
    const nextBefore = rows.length === PAGE ? rows[rows.length - 1].at : null;

    // ── Итоги по человеку за период ───────────────────────────────────────
    let summary: Record<string, number> | null = null;
    if (user && !before) {
        const all = await docs(col.where('uid', '==', user.uid).where('at', '>=', since).orderBy('at', 'desc').limit(2000));
        const s = { won: 0, lost: 0, shop: 0, purchases: 0, bonuses: 0, admin: 0, direct: 0, unexplained: 0,
            comments: 0, chat: 0, channels: 0, truncated: all.length === 2000 ? 1 : 0 };
        for (const d of all) {
            const e = d.data();
            if (e.flag === 'direct') s.direct++;
            if (e.flag === 'unexplained') s.unexplained++;
            if (e.kind === 'profile_comment') s.comments++;
            if (e.kind === 'chat') s.chat++;
            if (e.kind === 'channel_post' || e.kind === 'channel_comment') s.channels++;
            if (e.group !== 'economy' || typeof e.delta !== 'number') continue;
            if (GAMES.has(e.kind)) {
                if (e.delta >= 0) s.won += e.delta;
                else s.lost += e.delta;
            } else if (e.kind === 'purchase') {
                s.purchases++;
                s.shop += -e.delta;
            } else if (BONUSES.has(e.kind)) {
                s.bonuses += e.delta;
            } else if (ADMIN_ECON.has(e.kind)) {
                s.admin += e.delta;
            }
        }
        summary = s;
    }

    // ── Кто сколько за сутки — когда человек не выбран ────────────────────
    let top: { gainers: Array<{ uid: string; name: string; sum: number }>; losers: Array<{ uid: string; name: string; sum: number }> } | null = null;
    if (!user && !userNotFound && !before) {
        const day = await docs(col.where('group', '==', 'economy')
            .where('at', '>=', Timestamp.fromMillis(Date.now() - DAY)).orderBy('at', 'desc').limit(3000));
        const net = new Map<string, { uid: string; name: string; sum: number }>();
        for (const d of day) {
            const e = d.data();
            if (typeof e.uid !== 'string' || typeof e.delta !== 'number') continue;
            const cur = net.get(e.uid) ?? { uid: e.uid, name: String(e.username || e.uid), sum: 0 };
            cur.sum += e.delta;
            net.set(e.uid, cur);
        }
        const ranked = [...net.values()].sort((a, b) => b.sum - a.sum);
        top = {
            gainers: ranked.filter((x) => x.sum > 0).slice(0, 5),
            losers: ranked.filter((x) => x.sum < 0).reverse().slice(0, 5)
        };
    }

    // Счётчик на кнопке «Тревоги» и человеческие названия вещей для строк журнала.
    // Сортировка нужна и подсчёту: индекс (alert, at) построен по убыванию at,
    // без orderBy запрос требует другого индекса и падал — счётчик молча был 0.
    const [alertsCount, shop] = await Promise.all([
        indexed(async () => (await col.where('alert', '==', true).where('at', '>=', since).orderBy('at', 'desc').count().get()).data().count, 0, missing),
        firestoreAdmin.collection('shop_items').get()
    ]);
    const itemNames: Record<string, string> = {};
    for (const d of shop.docs) itemNames[d.id] = String(d.get('name') ?? d.id);

    return {
        rows,
        nextBefore,
        user,
        userNotFound,
        summary,
        top,
        indexBuilding,
        alertsCount,
        itemNames,
        filters: { user: userQuery, group, alerts: alertsOnly, days: PERIODS[daysParam] ? daysParam : '1' }
    };
};
