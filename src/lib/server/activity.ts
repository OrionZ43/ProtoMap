// src/lib/server/activity.ts
//
// Журнал действий со стороны сайта. Схема записи и смысл полей —
// functions/src/activity/log.ts; здесь только то, что пишет сервер сайта:
//
// - действия админов (бан, баланс, предметы, перенос, почта) — с alert: true,
//   Ориону их отправляет в Telegram триггер activityAlert;
// - пометка econ_op для изменений баланса из админки — по ней триггер журнала
//   понимает, откуда взялись PC.
//
// Запись в журнал не должна ронять само действие админа: ошибки логируются.

import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestoreAdmin } from '$lib/server/firebase.admin';

/** Как в functions/src/activity/log.ts: журнал безопасности живёт 6 месяцев. */
const RETENTION_DAYS = 180;

/** Пометка «откуда изменение баланса» — та же форма, что у econOp в функциях. */
export function econOp(kind: string, ref?: string | number) {
    return { kind, ref: ref === undefined ? null : String(ref), id: randomUUID() };
}

export type AdminActionKind =
    | 'admin_credits'
    | 'admin_items'
    | 'admin_grant_item'
    | 'admin_revoke_item'
    | 'admin_equip'
    | 'admin_notify'
    | 'admin_streak'
    | 'admin_cooldown'
    | 'admin_ban'
    | 'admin_unban'
    | 'admin_verify_email'
    | 'admin_migrate';

export interface AdminAction {
    kind: AdminActionKind;
    /** uid админа, который действует. */
    by: string;
    byName: string | null;
    /** uid того, к кому применено. */
    target: string;
    /** Что сделано, словами: уходит в Telegram и в журнал. */
    text: string;
    delta?: number;
}

async function usernameOf(uid: string): Promise<string | null> {
    try {
        const snap = await firestoreAdmin.collection('users').doc(uid).get();
        return snap.exists ? String(snap.get('username') ?? '') || null : null;
    } catch {
        return null;
    }
}

export async function logAdminAction(a: AdminAction): Promise<void> {
    try {
        const targetName = await usernameOf(a.target);
        await firestoreAdmin.collection('activity_log').add({
            at: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 86_400_000),
            group: 'admin',
            kind: a.kind,
            uid: a.by,
            ...(a.byName ? { username: a.byName } : {}),
            target: a.target,
            ...(targetName ? { targetName } : {}),
            text: a.text.slice(0, 140),
            ...(typeof a.delta === 'number' ? { delta: a.delta } : {}),
            author: { type: 'server', authType: 'admin_panel', id: a.by },
            alert: true
        });
    } catch (e) {
        console.error(`[ACTIVITY] Не записалось действие админа ${a.kind}:`, e);
    }
}
