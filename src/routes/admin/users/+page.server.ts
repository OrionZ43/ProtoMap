// src/routes/admin/users/+page.server.ts
//
// «Люди» в админке: поиск человека и действия с аккаунтом — баланс, вещи,
// почта, бан, перенос. Каждое действие возвращает код результата (страница
// показывает его своим текстом на трёх языках) и заново прочитанную карточку
// человека. Раньше возвращалась русская фраза, и страница искала в ней слова
// («ИЗОЛИРОВАН», «Баланс» и число), чтобы понять, что изменилось.

import { firestoreAdmin, authAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { econOp, logAdminAction } from '$lib/server/activity';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

/** Набор, который выдаёт «Выдать набор»: рамки и фоны, без сезонных и командных. */
const ITEM_PACK = [
    'frame_neon_blue', 'frame_glitch', 'frame_high_roller',
    'frame_biohazard', 'frame_plasma', 'frame_stealth',
    'frame_cryo', 'frame_festive', 'frame_aurora', 'frame_ludoman',
    'bg_carbon', 'bg_matrix', 'bg_synthwave'
];

/** Похоже на uid: такое в поиске сначала пробуем как uid, потом как ник. */
const UID_LIKE = /^[A-Za-z0-9_-]{20,128}$/;

// Централизованная проверка прав — вызывается в каждом action
function assertAdmin(locals: App.Locals) {
    if (!locals.user || !adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ.');
    }
}

/** Карточка человека — то, что показывает страница. */
export interface Target {
    uid: string;
    username: string;
    email: string | null;
    emailVerified: boolean;
    casino_credits: number;
    avatar_url: string | null;
    owned_items: number;
    isBanned: boolean;
    banReason: string | null;
    telegram_id: string | null;
    createdAt: number | null;
    daily_streak: number;
    owned_items_list: string[];
    equipped_frame: string | null;
    equipped_bg: string | null;
    cooldowns: { daily: boolean; username: boolean; birthday: boolean };
    history: HistoryEntry[];
}

/** Строка истории админ-действий по человеку (из activity_log). */
export interface HistoryEntry {
    kind: string;
    text: string;
    byName: string | null;
    delta: number | null;
    at: number | null;
}

/** Предмет каталога косметики для пикера (из shop_items). */
export interface CatalogItem {
    id: string;
    name: string;
    type: 'frame' | 'background';
}

async function loadTarget(uid: string): Promise<Target | null> {
    const doc = await firestoreAdmin.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    // Подтверждена ли почта — знает только Firebase Auth.
    const authUser = await authAdmin.getUser(uid).catch(() => null);
    return {
        uid,
        username: String(d.username ?? uid),
        email: (d.email as string | undefined) ?? null,
        emailVerified: authUser?.emailVerified ?? false,
        casino_credits: Number(d.casino_credits ?? 0),
        avatar_url: (d.avatar_url as string | undefined) || null,
        owned_items: Array.isArray(d.owned_items) ? d.owned_items.length : 0,
        isBanned: d.isBanned === true,
        banReason: (d.banReason as string | undefined) ?? null,
        telegram_id: d.telegram_id != null ? String(d.telegram_id) : null,
        createdAt: d.createdAt?.toMillis?.() ?? null,
        daily_streak: Number(d.daily_streak ?? 0),
        owned_items_list: Array.isArray(d.owned_items) ? d.owned_items.map(String) : [],
        equipped_frame: (d.equipped_frame as string | undefined) || null,
        equipped_bg: (d.equipped_bg as string | undefined) || null,
        cooldowns: {
            daily: d.last_daily_bonus != null,
            username: d.last_username_change != null,
            birthday: d.birthday_bonus_claimed === true
        },
        history: await loadHistory(uid)
    };
}

/**
 * Последние админ-действия по человеку. Нужен составной индекс
 * (target ==, group ==, at desc); пока его нет — тихо отдаём пусто, карточка
 * работает без истории.
 */
async function loadHistory(uid: string): Promise<HistoryEntry[]> {
    try {
        const snap = await firestoreAdmin.collection('activity_log')
            .where('target', '==', uid)
            .where('group', '==', 'admin')
            .orderBy('at', 'desc')
            .limit(15)
            .get();
        return snap.docs.map((doc) => {
            const a = doc.data();
            return {
                kind: String(a.kind ?? ''),
                text: String(a.text ?? ''),
                byName: (a.username as string | undefined) ?? null,
                delta: typeof a.delta === 'number' ? a.delta : null,
                at: a.at?.toMillis?.() ?? null
            };
        });
    } catch (e) {
        console.error('[admin/users] история:', e);
        return [];
    }
}

/** Каталог рамок и фонов из shop_items — для поштучного пикера. */
async function loadCatalog(): Promise<CatalogItem[]> {
    try {
        const snap = await firestoreAdmin.collection('shop_items').get();
        return snap.docs
            .map((doc): CatalogItem | null => {
                const type = doc.get('type');
                const t: 'frame' | 'background' | null =
                    type === 'frame' || type === 'background' ? type :
                    doc.id.startsWith('frame_') ? 'frame' :
                    doc.id.startsWith('bg_') ? 'background' : null;
                return t ? { id: doc.id, name: String(doc.get('name') ?? doc.id), type: t } : null;
            })
            .filter((x): x is CatalogItem => x !== null)
            .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));
    } catch (e) {
        console.error('[admin/users] каталог:', e);
        return [];
    }
}

/**
 * Пуш человеку с сервера (для уведомления из админки). Токен — только из
 * users/{uid}/private/data (новое приложение): тип admin_message старое не
 * понимает. Best-effort: ошибка не роняет действие.
 */
async function pushToUser(uid: string, data: Record<string, string>): Promise<void> {
    try {
        const priv = await firestoreAdmin.collection('users').doc(uid)
            .collection('private').doc('data').get();
        const token = priv.get('fcmToken');
        if (typeof token !== 'string' || !token) return;
        await getMessaging().send({
            token, data,
            android: { priority: 'high', ttl: 24 * 60 * 60 * 1000 }
        });
    } catch (e) {
        console.error('[admin/users] пуш:', e);
    }
}

/** Успех: код, подробности для текста и свежая карточка. */
async function done(code: string, uid: string, extra: Record<string, string | number> = {}) {
    return { ok: true as const, code, values: extra, target: await loadTarget(uid) };
}

/** Неудача: код и, если есть, текст ошибки для подробностей. */
function failed(status: number, code: string, detail?: unknown) {
    return fail(status, {
        ok: false as const,
        code,
        values: { detail: detail instanceof Error ? detail.message : detail ? String(detail) : '' }
    });
}

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, '/login');
    if (!adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ. Уровень допуска: "Смертный". Возвращайтесь в песочницу.');
    }
    // Ссылка из журнала, /admin/users?uid=…, сразу открывает карточку человека.
    const uid = (url.searchParams.get('uid') ?? '').trim();
    const initial = UID_LIKE.test(uid) ? await loadTarget(uid) : null;
    const catalog = await loadCatalog();
    return { user: locals.user, packSize: ITEM_PACK.length, initial, catalog };
};

export const actions: Actions = {

    search: async ({ request, locals }) => {
        assertAdmin(locals);
        const data  = await request.formData();
        const query = (data.get('query') as string ?? '').trim();
        // Выбор из списка похожих присылает uid: ники не уникальны, и по
        // нику открылся бы первый попавшийся из тёзок.
        const picked = (data.get('uid') as string ?? '').trim();
        if (!query && !picked) return failed(400, 'empty_query');

        try {
            // В поле можно вставить и uid — например, из журнала.
            for (const uid of [picked, query]) {
                if (!UID_LIKE.test(uid)) continue;
                const target = await loadTarget(uid);
                if (target) return { ok: true as const, target };
            }

            const usersRef = firestoreAdmin.collection('users');
            const exact = await usersRef.where('username', '==', query).limit(1).get();
            if (!exact.empty) return { ok: true as const, target: await loadTarget(exact.docs[0].id) };

            const snapshot = await usersRef
                .where('username', '>=', query)
                .where('username', '<=', query + '')
                .limit(8).get();
            if (snapshot.empty) return failed(404, 'not_found');

            const candidates = snapshot.docs.map((doc) => ({
                uid: doc.id,
                username: String(doc.get('username') ?? doc.id),
                avatar_url: (doc.get('avatar_url') as string | undefined) || null
            }));
            return { ok: true as const, candidates };
        } catch (err) {
            console.error('[admin/users] поиск:', err);
            return failed(500, 'search_failed', err);
        }
    },

    modifyCredits: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        // «Обнулить» шлёт zero=1: сумму считает сервер по текущему балансу.
        // Раньше страница присылала минус тот баланс, что видела сама, и если
        // человек успел сыграть, обнуление промахивалось.
        const zero      = data.get('zero') === '1';
        let amount      = parseInt(data.get('amount') as string);
        if (!targetUid || (!zero && isNaN(amount))) return failed(400, 'bad_input');
        // Защита: нельзя начислять себе
        if (targetUid === locals.user!.uid) return failed(403, 'self_balance');
        try {
            const ref = firestoreAdmin.collection('users').doc(targetUid);
            if (zero) {
                amount = await firestoreAdmin.runTransaction(async (t) => {
                    const balance = Number((await t.get(ref)).get('casino_credits') ?? 0);
                    t.update(ref, { casino_credits: 0, econ_op: econOp('admin_credits', -balance) });
                    return -balance;
                });
            } else {
                await ref.update({
                    casino_credits: FieldValue.increment(amount),
                    econ_op: econOp('admin_credits', amount)
                });
            }
            await logAdminAction({
                kind: 'admin_credits', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: 'изменил баланс', delta: amount
            });
            return done('credits', targetUid, { amount });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    grantAllItems: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        if (!targetUid) return failed(400, 'bad_input');
        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                owned_items: FieldValue.arrayUnion(...ITEM_PACK),
                econ_op: econOp('admin_items', ITEM_PACK.length)
            });
            await logAdminAction({
                kind: 'admin_items', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `выдал все рамки и фоны (${ITEM_PACK.length})`
            });
            return done('items', targetUid, { count: ITEM_PACK.length });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Принудительная верификация email
    verifyEmail: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        if (!targetUid) return failed(400, 'bad_input');
        try {
            await authAdmin.updateUser(targetUid, { emailVerified: true });
            console.log(`[ADMIN] Email verified for uid=${targetUid} by admin=${locals.user!.uid}`);
            await logAdminAction({
                kind: 'admin_verify_email', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: 'подтвердил почту вручную'
            });
            return done('email_verified', targetUid);
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    banUser: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const reason    = (data.get('reason') as string ?? '').trim();
        // Категория блокировки. Влияет только на одно: по пункту 2.3
        // Соглашения (безопасность детей) решение окончательное и кнопка
        // обжалования на /banned не показывается. Все остальные блокировки
        // обжалуются — по пункту 2.9.
        const category  = data.get('category') === 'child_safety' ? 'child_safety' : 'general';
        if (!targetUid) return failed(400, 'bad_input');
        // Защита: нельзя банить самого себя и других админов
        if (targetUid === locals.user!.uid) return failed(403, 'self_ban');
        if (adminList.includes(targetUid))  return failed(403, 'admin_ban');
        try {
            await authAdmin.setCustomUserClaims(targetUid, { banned: true });
            await authAdmin.revokeRefreshTokens(targetUid);
            await firestoreAdmin.collection('users').doc(targetUid).update({
                isBanned:    true,
                banReason:   reason || 'Нарушение протоколов сети.',
                banCategory: category,
                bannedAt:    FieldValue.serverTimestamp()
            });
            console.log(`[ADMIN] Banned uid=${targetUid} reason="${reason}" category=${category} by admin=${locals.user!.uid}`);
            await logAdminAction({
                kind: 'admin_ban', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `бан: ${reason || 'без причины'}`
            });
            return done('banned', targetUid);
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    unbanUser: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        if (!targetUid) return failed(400, 'bad_input');
        try {
            await authAdmin.setCustomUserClaims(targetUid, { banned: false });
            await firestoreAdmin.collection('users').doc(targetUid).update({
                isBanned:    false,
                banReason:   FieldValue.delete(),
                banCategory: FieldValue.delete(),
                bannedAt:    FieldValue.delete()
            });
            await logAdminAction({
                kind: 'admin_unban', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: 'разбан'
            });
            return done('unbanned', targetUid);
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    migrate: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const sourceUid = (data.get('sourceUid') as string ?? '').trim();
        const targetUid = (data.get('targetUid') as string ?? '').trim();
        if (!sourceUid || !targetUid || sourceUid === targetUid) return failed(400, 'bad_migrate');
        // Нельзя мигрировать аккаунт другого админа
        if (adminList.includes(sourceUid)) return failed(403, 'admin_migrate');

        const sourceRef = firestoreAdmin.collection('users').doc(sourceUid);
        const targetRef = firestoreAdmin.collection('users').doc(targetUid);

        try {
            await firestoreAdmin.runTransaction(async (t) => {
                const sourceDoc = await t.get(sourceRef);
                const targetDoc = await t.get(targetRef);
                if (!sourceDoc.exists || !targetDoc.exists) throw new Error('Один из аккаунтов не найден.');

                const s = sourceDoc.data()!;
                const tg = targetDoc.data()!;

                t.update(targetRef, {
                    casino_credits: (tg.casino_credits || 0) + (s.casino_credits || 0),
                    owned_items:    [...new Set([...(tg.owned_items || []), ...(s.owned_items || [])])],
                    daily_streak:   Math.max(s.daily_streak || 0, tg.daily_streak || 0),
                    avatar_url:     tg.avatar_url || s.avatar_url,
                    migratedFrom:   sourceUid,
                    migratedAt:     FieldValue.serverTimestamp(),
                    econ_op:        econOp('admin_migrate', 'in')
                });

                t.update(sourceRef, {
                    casino_credits: 0,
                    daily_streak:   0,
                    isBanned:       true,
                    banReason:      `MIGRATED TO: ${targetUid}`,
                    username:       `MIGRATED_${s.username}`,
                    status:         'ACCOUNT_TRANSFER_COMPLETE',
                    econ_op:        econOp('admin_migrate', 'out')
                });
            });

            const locQuery = await firestoreAdmin.collection('locations').where('user_id', '==', sourceUid).get();
            if (!locQuery.empty) {
                const batch = firestoreAdmin.batch();
                locQuery.docs.forEach(doc => batch.update(doc.ref, { user_id: targetUid }));
                await batch.commit();
            }

            console.log(`[ADMIN] Migrated ${sourceUid} -> ${targetUid} by admin=${locals.user!.uid}`);
            await logAdminAction({
                kind: 'admin_migrate', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `перенос аккаунта ${sourceUid} → ${targetUid}`
            });
            return done('migrated', targetUid, { from: sourceUid, to: targetUid });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Выдать один предмет (рамку/фон) поштучно.
    grantItem: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const itemId    = (data.get('itemId') as string ?? '').trim();
        if (!targetUid || !itemId) return failed(400, 'bad_input');
        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                owned_items: FieldValue.arrayUnion(itemId),
                econ_op: econOp('admin_items', 1)
            });
            await logAdminAction({
                kind: 'admin_grant_item', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `выдал предмет ${itemId}`
            });
            return done('item_granted', targetUid, { item: itemId });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Снять один предмет. Если он надет — снять и со слота (в транзакции),
    // иначе останется надетым предмет, которого уже нет.
    revokeItem: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const itemId    = (data.get('itemId') as string ?? '').trim();
        if (!targetUid || !itemId) return failed(400, 'bad_input');
        try {
            const ref = firestoreAdmin.collection('users').doc(targetUid);
            await firestoreAdmin.runTransaction(async (t) => {
                const snap = await t.get(ref);
                const updates: Record<string, unknown> = {
                    owned_items: FieldValue.arrayRemove(itemId),
                    econ_op: econOp('admin_items', -1)
                };
                if (snap.get('equipped_frame') === itemId) updates.equipped_frame = null;
                if (snap.get('equipped_bg') === itemId) updates.equipped_bg = null;
                t.update(ref, updates as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
            });
            await logAdminAction({
                kind: 'admin_revoke_item', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `снял предмет ${itemId}`
            });
            return done('item_revoked', targetUid, { item: itemId });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Надеть рамку/фон (пусто = снять). Только из уже купленного.
    equipItem: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const slot      = data.get('slot') === 'bg' ? 'equipped_bg' : 'equipped_frame';
        const itemId    = (data.get('itemId') as string ?? '').trim();
        if (!targetUid) return failed(400, 'bad_input');
        try {
            const ref = firestoreAdmin.collection('users').doc(targetUid);
            if (itemId) {
                const owned = (await ref.get()).get('owned_items');
                if (!Array.isArray(owned) || !owned.includes(itemId)) return failed(400, 'not_owned');
            }
            await ref.update({ [slot]: itemId || null });
            await logAdminAction({
                kind: 'admin_equip', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid,
                text: itemId ? `надел ${itemId}` : `снял ${slot === 'equipped_bg' ? 'фон' : 'рамку'}`
            });
            return done('equipped', targetUid);
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Отправить человеку уведомление в колокольчик (+ по желанию пуш).
    sendNotification: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const text      = (data.get('text') as string ?? '').trim();
        const withPush  = data.get('push') === '1';
        if (!targetUid || !text) return failed(400, 'bad_input');
        if (text.length > 2000) return failed(400, 'too_long');
        try {
            const adminUid    = locals.user!.uid;
            const adminAvatar = (await firestoreAdmin.collection('users').doc(adminUid).get()).get('avatar_url');
            const notifRef = await firestoreAdmin.collection('users').doc(targetUid).collection('notifications').add({
                type: 'admin_message',
                actor: {
                    uid: adminUid,
                    username: locals.user!.username ?? 'Администрация',
                    avatarUrl: typeof adminAvatar === 'string' ? adminAvatar : null
                },
                text,
                target: {},
                read: false,
                createdAt: FieldValue.serverTimestamp(),
                expireAt: Timestamp.fromMillis(Date.now() + 60 * 86_400_000)
            });
            if (withPush) {
                await pushToUser(targetUid, {
                    type: 'admin_message',
                    notificationId: notifRef.id,
                    title: 'Сообщение от администрации',
                    body: text.slice(0, 120)
                });
            }
            await logAdminAction({
                kind: 'admin_notify', by: adminUid, byName: locals.user!.username,
                target: targetUid,
                text: `отправил уведомление: «${text.slice(0, 100).replace(/\s+/g, ' ').trim()}»`
            });
            return done('notified', targetUid);
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Задать дневной стрик.
    setStreak: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const streak    = parseInt(data.get('streak') as string);
        if (!targetUid || isNaN(streak) || streak < 0 || streak > 100000) return failed(400, 'bad_input');
        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({ daily_streak: streak });
            await logAdminAction({
                kind: 'admin_streak', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `задал стрик ${streak}`
            });
            return done('streak_set', targetUid, { streak });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    },

    // Сбросить кулдаун: дейлик / смена ника / подарок на ДР.
    resetCooldown: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const which     = (data.get('which') as string ?? '').trim();
        const FIELD: Record<string, string> = {
            daily: 'last_daily_bonus',
            username: 'last_username_change',
            birthday: 'birthday_bonus_claimed'
        };
        const field = FIELD[which];
        if (!targetUid || !field) return failed(400, 'bad_input');
        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({ [field]: FieldValue.delete() });
            await logAdminAction({
                kind: 'admin_cooldown', by: locals.user!.uid, byName: locals.user!.username,
                target: targetUid, text: `сбросил кулдаун: ${which}`
            });
            return done('cooldown_reset', targetUid, { which });
        } catch (e) {
            return failed(500, 'failed', e);
        }
    }
};
