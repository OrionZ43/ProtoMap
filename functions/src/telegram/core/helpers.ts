/**
 * Мелкие проверки, нужные сразу нескольким модулям.
 *
 * `ctx: any` здесь наследие исходного файла: типы Telegraf в этих местах
 * громоздкие, а поведение простое. Менять на строгие типы — отдельная задача,
 * не смешивать с переездом по папкам.
 */

import { db, bot, ORION_TG_ID, HRUMER_TG_ID } from "./bot";

/**
 * Орион ли это. Только по id: сравнение с именем или username открыло бы
 * «режим создателя» любому, кто переименуется в Ориона.
 */
export function isOrion(userId: number | undefined): boolean {
    return userId === ORION_TG_ID;
}

/** Хрумер ли это — парень Ориона. Тоже только по id. */
export function isHrumer(userId: number | undefined): boolean {
    return userId === HRUMER_TG_ID;
}

/** Кого бот любит: Ориона и Хрумера. Им — тёплые ответы и сердечки. */
export function isLoved(userId: number | undefined): boolean {
    return isOrion(userId) || isHrumer(userId);
}

/**
 * «Печатает…» — через общий экземпляр бота, НЕ через ctx.
 *
 * sendChatAction входит в методы, которые Telegraf в режиме вебхука отправляет
 * прямо в теле HTTP-ответа (см. telegram/index.ts). Вызванный через ctx, он
 * закрыл бы ответ, и сама реплика уходила бы уже из функции, у которой
 * Cloud Run забрал процессор.
 */
export async function sendTyping(chatId: number): Promise<void> {
    try {
        await bot.telegram.sendChatAction(chatId, 'typing');
    } catch { /* без индикатора ответ всё равно уйдёт */ }
}

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
