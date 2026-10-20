// src/lib/server/activityRows.ts
//
// Запись журнала действий (activity_log, functions/src/activity) в виде, удобном
// страницам админки: без Timestamp и с пустыми списками вместо отсутствующих полей.

import type { DocumentData } from 'firebase-admin/firestore';

export interface ActivityRow {
    id: string;
    at: number;
    group: string;
    kind: string;
    uid: string | null;
    username: string | null;
    target: string | null;
    targetName: string | null;
    delta: number | null;
    balance: number | null;
    itemsAdded: string[];
    itemsRemoved: string[];
    shards: number | null;
    fields: string[];
    text: string | null;
    ref: string | null;
    authorType: string | null;
    authorId: string | null;
    authType: string | null;
    flag: string | null;
    alert: boolean;
}

export function toRow(id: string, d: DocumentData): ActivityRow {
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        id,
        at: d.at?.toMillis?.() ?? 0,
        group: String(d.group ?? ''),
        kind: String(d.kind ?? ''),
        uid: str(d.uid),
        username: str(d.username),
        target: str(d.target),
        targetName: str(d.targetName),
        delta: n(d.delta),
        balance: n(d.balance),
        itemsAdded: Array.isArray(d.items?.added) ? d.items.added.map(String) : [],
        itemsRemoved: Array.isArray(d.items?.removed) ? d.items.removed.map(String) : [],
        shards: n(d.shards),
        fields: Array.isArray(d.fields) ? d.fields.map(String) : [],
        text: str(d.text),
        ref: str(d.ref),
        authorType: str(d.author?.type),
        authorId: str(d.author?.id),
        authType: str(d.author?.authType),
        flag: str(d.flag),
        alert: d.alert === true
    };
}
