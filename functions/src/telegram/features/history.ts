/**
 * Бегущая память чата для вопросов боту (features/ask.ts).
 *
 * Зачем. Без неё каждый «Ориоша, …» уходит в Gemini в одиночку: бот не помнит,
 * о чём сейчас говорят, и не держит нить разговора. Здесь копится скользящее
 * окно последних сообщений, а ask.ts отдаёт его модели как фон — помеченный как
 * чужой разговор, а не как вопросы боту (разметку строит ask.ts).
 *
 * Только «Гарем» (возможность `ask`). В ProtoMap памяти нет: там и вопросы к
 * нейросети выключены, и копить переписку посторонних в Firestore незачем.
 *
 * Приватность. В записи НЕ храним Telegram id участников: роль (Орион, Хрумер,
 * бот, прочий) вычисляется по id в момент записи, а наружу идёт только она и имя,
 * которое человек выставил себе сам. Это та же линия, что у `whining_attempts`,
 * откуда id участников убраны как данные без цели обработки. Окно само
 * подрезается по числу и возрасту; в Gemini уходит лишь то, что покажет ask.ts.
 *
 * Порядок регистрации. Пишется РАНЬШЕ transcribe/ask/banter: `bot.on('voice')`
 * в transcribe не зовёт next(), и запись, стоящая ниже, голосовых бы не увидела.
 * Поэтому history.register идёт сразу после channel, а свой обработчик всегда
 * зовёт next() — он только записывает.
 */

import { Telegraf } from "telegraf";
import { db } from "../core/bot";
import { hasFeature } from "../core/registry";
import { isOrion, isHrumer } from "../core/helpers";

export type Role = 'orion' | 'hrumer' | 'bot' | 'other';

export interface HistoryEntry {
    /** message_id — чтобы исключить из фона сам вопрос и то, на что отвечают. */
    id: number;
    role: Role;
    /** Имя, как его выставил участник; показываем только для роли other. */
    name: string;
    /** Текст или краткое описание вложения: «[фото] подпись», «[стикер 😀]». */
    text: string;
    /** Когда отправлено, мс. Берём из msg.date, а не из часов функции. */
    at: number;
}

/**
 * Сколько записей держим в документе. Чуть больше окна подачи (FEED_MAX), чтобы
 * оно оставалось полным после отсева по возрасту.
 */
const STORE_CAP = 140;

/** Старше этого в хранилище не держим: документ не растёт без предела. */
const STORE_TTL_MS = 6 * 60 * 60 * 1000;

/** Длиннее этого текст режем — окно из сотни сообщений должно влезать в документ. */
const MAX_STORE_CHARS = 600;

/** Окно подачи: столько последних сообщений максимум уходит боту как фон. */
const FEED_MAX = 100;

/**
 * Старше этого в фон не берём: вопрос после долгой паузы не должен тащить
 * вчерашнее. Окно режется и по числу (FEED_MAX), и по времени.
 */
const FEED_WINDOW_MS = 40 * 60 * 1000;

function docRef(chatId: number) {
    return db.collection('telegram_history').doc(String(chatId));
}

function roleOf(userId: number | undefined): Role {
    if (isOrion(userId)) return 'orion';
    if (isHrumer(userId)) return 'hrumer';
    return 'other';
}

function clip(text: string, max: number): string {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Сообщение словами: у фото, стикеров и голосовых текста нет — называем вид
 * вложения. Экспортируется: ask.ts тем же описывает сообщение, на которое
 * отвечают.
 */
export function describeMessage(msg: any): string {
    const kind =
        msg.photo ? 'фото' :
        msg.video ? 'видео' :
        msg.animation ? 'гифка' :
        msg.sticker ? `стикер ${msg.sticker.emoji ?? ''}`.trim() :
        msg.voice ? 'голосовое' :
        msg.video_note ? 'кружок' :
        msg.audio ? 'аудио' :
        msg.document ? 'файл' :
        msg.poll ? 'опрос' : null;

    if (typeof msg.text === 'string') return msg.text;
    if (typeof msg.caption === 'string') return `[${kind ?? 'вложение'}] ${msg.caption}`;
    return `[${kind ?? 'сообщение без текста'}]`;
}

/** Есть ли в сообщении содержимое, которое стоит помнить (не служебное событие). */
function hasContent(msg: any): boolean {
    return (
        typeof msg.text === 'string' ||
        typeof msg.caption === 'string' ||
        !!(msg.photo || msg.sticker || msg.voice || msg.video || msg.video_note ||
            msg.animation || msg.audio || msg.document || msg.poll)
    );
}

/**
 * Добавляет запись в окно: отсекает старьё и повтор того же message_id (Telegram
 * иногда доставляет сообщение дважды), подрезает до STORE_CAP. Транзакция — на
 * случай параллельных сообщений в одном чате.
 */
async function append(chatId: number, entry: HistoryEntry): Promise<void> {
    const ref = docRef(chatId);
    const cutoff = entry.at - STORE_TTL_MS;
    await db.runTransaction(async (t) => {
        const entries = ((await t.get(ref)).data()?.entries ?? []) as HistoryEntry[];
        const kept = entries.filter((e) => e.at >= cutoff && e.id !== entry.id);
        kept.push(entry);
        t.set(ref, { entries: kept.slice(-STORE_CAP) }, { merge: true });
    });
}

/** Записывает входящее сообщение. Ошибку проглатывает: память — не критичный путь. */
async function remember(ctx: any): Promise<void> {
    const msg = ctx.message;
    if (!msg || !hasContent(msg)) return;
    // Команды — не разговор; в фоне они только мешают.
    if (typeof msg.text === 'string' && msg.text.startsWith('/')) return;

    const entry: HistoryEntry = {
        id: msg.message_id,
        role: roleOf(ctx.from?.id),
        name: ctx.from?.first_name ?? 'неизвестный',
        text: clip(describeMessage(msg), MAX_STORE_CHARS),
        at: msg.date ? msg.date * 1000 : Date.now(),
    };
    try {
        await append(ctx.chat.id, entry);
    } catch (e) {
        console.error('[HISTORY] Не удалось записать сообщение:', e);
    }
}

/**
 * Добавляет в память собственный ответ бота — чтобы в следующем вопросе он видел
 * свою реплику. Своих сообщений бот из Telegram не получает, поэтому пишем явно.
 */
export async function recordBotReply(chatId: number, messageId: number, text: string): Promise<void> {
    try {
        await append(chatId, {
            id: messageId, role: 'bot', name: '', text: clip(text, MAX_STORE_CHARS), at: Date.now(),
        });
    } catch (e) {
        console.error('[HISTORY] Не удалось записать ответ бота:', e);
    }
}

/**
 * Недавние сообщения чата для фона вопроса. `exclude` — id, которые в фоне не
 * нужны (сам вопрос и то, на которое отвечают: они идут в запрос отдельно).
 * Возвращает по возрастанию времени, не больше FEED_MAX и не старше окна.
 */
export async function getRecent(chatId: number, exclude: number[], now = Date.now()): Promise<HistoryEntry[]> {
    try {
        const entries = ((await docRef(chatId).get()).data()?.entries ?? []) as HistoryEntry[];
        const cutoff = now - FEED_WINDOW_MS;
        return entries
            .filter((e) => e.at >= cutoff && !exclude.includes(e.id))
            .slice(-FEED_MAX);
    } catch (e) {
        console.error('[HISTORY] Не удалось прочитать историю:', e);
        return [];
    }
}

export function register(bot: Telegraf): void {
    // Пишем каждое содержательное сообщение «Гарема» и всегда пропускаем дальше.
    bot.on('message', async (ctx, next) => {
        if (hasFeature(ctx.chat?.id, 'ask')) {
            await remember(ctx);
        }
        return next();
    });
}
