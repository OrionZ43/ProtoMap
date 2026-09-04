/**
 * Мелкие проверки, нужные сразу нескольким модулям.
 *
 * `ctx: any` здесь наследие исходного файла: типы Telegraf в этих местах
 * громоздкие, а поведение простое. Менять на строгие типы — отдельная задача,
 * не смешивать с переездом по папкам.
 */

import { db } from "./bot";

export async function isAdmin(ctx: any): Promise<boolean> {
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

/**
 * Нельзя ли применять к цели меры модерации.
 * Иммунны админы, создатель чата и сам бот.
 */
export async function isTargetImmune(ctx: any, targetId: number): Promise<boolean> {
    try {
        const member = await ctx.getChatMember(targetId);
        return ['administrator', 'creator'].includes(member.status) || targetId === ctx.botInfo.id;
    } catch (e) { return false; }
}

export async function getUserByTgId(tgId: number): Promise<FirebaseFirestore.DocumentSnapshot | null> {
    const snapshot = await db.collection('users').where('telegram_id', '==', tgId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0];
}
