// src/lib/admin/describe.ts
//
// Запись журнала действий обычной фразой: «Слоты, ставка 50», «Покупка: Лунная
// ночь». Общая для журнала (/admin/activity) и главной админки (плитка «Сейчас»).

import type { Translate } from './day';

/** Что нужно от записи журнала для фразы. */
export interface DescribableEntry {
    group: string;
    kind: string;
    text: string | null;
    ref: string | null;
    itemsAdded: string[];
    fields: string[];
}

// Виды, где деталь лежит в ref: ставка, день бонуса, множитель, месяц.
const WITH_REF = new Set(['slots', 'coinflip', 'crash_bet', 'crash_cashout', 'plinko', 'duel', 'daily_bonus', 'referral_prize']);
// Виды, где в записи текст сообщения или причина — показываем в кавычках.
export const QUOTED = new Set(['profile_comment', 'profile_comment_deleted', 'chat', 'channel_created', 'channel_deleted',
    'channel_post', 'channel_post_deleted', 'channel_comment', 'channel_comment_deleted', 'ban', 'report',
    'news_added', 'news_removed', 'news_changed']);
// Виды, где текст — короткая деталь без кавычек: город, роль, цена.
export const PLAIN = new Set(['location_added', 'location_moved', 'location_removed', 'role', 'shop_added', 'shop_changed']);

/** Название вида записи; незнакомый вид — как есть, а не сырым ключом перевода. */
export function kindLabel(kind: string, tr: Translate): string {
    const key = `admin_activity.kinds.${kind}`;
    const s = tr(key);
    return s === key ? kind : s;
}

export function fieldNames(fields: string[], tr: Translate): string {
    const names = fields.map((f) => {
        const key = `admin_activity.field_names.${f.split('.')[0]}`;
        const s = tr(key);
        return s === key ? f : s;
    });
    return [...new Set(names)].join(', ');
}

/** Фраза для записи; `items` — названия вещей витрины по id. */
export function describeEntry(r: DescribableEntry, tr: Translate, items: Record<string, string>): string {
    const say = (key: string, values: Record<string, string> = {}) => tr(`admin_activity.say.${key}`, { values });
    const item = (id: string | null | undefined) => (id ? items[id] ?? id : '?');

    // Действия админки сайта: сайт сам пишет, что сделано («изменил баланс», «бан: …»).
    if (r.group === 'admin' && r.kind.startsWith('admin_') && r.text) {
        return r.text.charAt(0).toUpperCase() + r.text.slice(1);
    }

    let base: string;
    if (r.kind === 'purchase') base = say('purchase', { item: item(r.itemsAdded[0] ?? r.ref) });
    else if (r.kind === 'admin_items') base = say('admin_items', { count: r.ref ?? String(r.itemsAdded.length) });
    else if (r.kind === 'admin_migrate') base = say(r.ref === 'out' ? 'admin_migrate_out' : 'admin_migrate_in');
    else if (r.kind === 'profile') base = say('profile', { fields: fieldNames(r.fields, tr) });
    else if (r.kind === 'username') base = say('username', { change: r.text ?? '' });
    else if (r.kind.startsWith('shop_')) base = say(r.kind, { item: item(r.ref) });
    else if (r.kind.startsWith('channel_') && r.kind !== 'channel_created' && r.kind !== 'channel_deleted') {
        base = say(r.kind, { channel: r.ref ?? '?' });
    } else if (WITH_REF.has(r.kind) && r.ref) base = say(r.kind, { ref: r.ref });
    else base = kindLabel(r.kind, tr);

    if (r.text && QUOTED.has(r.kind)) return `${base}: ${tr('admin_activity.quote', { values: { text: r.text } })}`;
    if (r.text && PLAIN.has(r.kind)) return `${base}: ${r.text}`;
    return base;
}
