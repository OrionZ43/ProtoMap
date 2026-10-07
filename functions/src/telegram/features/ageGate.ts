/**
 * Проверка возраста на входе в чат.
 *
 * Вступившему бот задаёт вопрос с двумя кнопками и до ответа запрещает писать.
 * «Да» — ограничение снимается. «Нет» — бан. Молчание — бан через пять минут.
 *
 * Пять минут отсчитывает Cloud Tasks, а не setTimeout: функция вебхука
 * замораживается сразу после ответа Telegram, и таймер внутри неё не сработал бы
 * никогда. Задача лежит в очереди и через пять минут вызывает `ageGateTimeout` —
 * отдельную функцию.
 *
 * Состояние — документ `telegram_age_gate/{chatId}_{userId}`. Кнопка и таймаут
 * соревнуются за него через транзакцию: кто первым записал `resolution`, тот и
 * решает, второй видит, что решено, и ничего не делает. После решения документ
 * удаляется — хранить ответы незачем.
 */

import { Telegraf, Telegram } from "telegraf";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFunctions } from "firebase-admin/functions";
import { REGION } from "../../options";
import { db, admin, bot as sharedBot } from "../core/bot";
import { hasFeature } from "../core/registry";

const TIMEOUT_SECONDS = 5 * 60;

type Resolution = 'yes' | 'no' | 'timeout';

interface PendingCheck {
    chatId: number;
    userId: number;
    /**
     * Дата сервисного сообщения о вступлении. Отличает текущий вход от прошлого:
     * человек мог ответить, выйти и зайти снова, и задача от первого входа не
     * должна решать за второй.
     */
    joinedAt: number;
    /** Сообщение с вопросом — его редактируем, когда всё решено. */
    messageId: number;
    resolution?: Resolution;
}

interface TimeoutTask {
    chatId: number;
    userId: number;
    joinedAt: number;
    firstName: string;
}

interface Person {
    id: number;
    first_name: string;
}

// ─── Тексты ─────────────────────────────────────────────────────────────────────
//
// Имя стоит только в именительном падеже: склонять произвольные имена бот не
// умеет, а «Отправляем Маша в ясли» читается хуже, чем никак. По той же причине
// нет глаголов прошедшего времени — пол по имени не определить.

const REFUSED: Array<(name: string) => string> = [
    (n) => `${n}, в ясли. Возвращайся, когда выдадут паспорт.`,
    (n) => `${n}, тебе в ясли. Тут взрослые разговаривают.`,
    (n) => `${n}, воспитательница уже ждёт. Тихий час сам себя не проспит.`,
];

const SILENT: Array<(name: string) => string> = [
    (n) => `${n}, пять минут тишины. Видимо, мама забрала телефон. В ясли.`,
    (n) => `${n}, пять минут без ответа — значит, тихий час. В ясли.`,
    (n) => `${n}, кто молчит про возраст, тот едет в ясли.`,
];

function pick(variants: Array<(name: string) => string>, name: string): string {
    return variants[Math.floor(Math.random() * variants.length)](name);
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Упоминание со ссылкой — человеку придёт уведомление. */
function mention(person: Person): string {
    return `<a href="tg://user?id=${person.id}">${escapeHtml(person.first_name)}</a>`;
}

/**
 * Все права разом. `true` по всем полям — это способ, которым Bot API снимает
 * ограничения с участника; дальше действуют обычные права чата.
 */
function permissions(allowed: boolean) {
    return {
        can_send_messages:         allowed,
        can_send_audios:           allowed,
        can_send_documents:        allowed,
        can_send_photos:           allowed,
        can_send_videos:           allowed,
        can_send_video_notes:      allowed,
        can_send_voice_notes:      allowed,
        can_send_polls:            allowed,
        can_send_other_messages:   allowed,
        can_add_web_page_previews: allowed,
        can_change_info:           allowed,
        can_invite_users:          allowed,
        can_pin_messages:          allowed,
        can_manage_topics:         allowed,
    };
}

// ─── Состояние ──────────────────────────────────────────────────────────────────

function checkRef(chatId: number, userId: number) {
    return db.collection('telegram_age_gate').doc(`${chatId}_${userId}`);
}

/**
 * Забирает решение себе. `null` — решать нечего: проверки нет, она от другого
 * входа или её уже решили.
 *
 * Таймаут может прийти повторно, если прошлая попытка упала посреди бана, —
 * тогда проверка уже его, и её надо доделать. Кнопкам повтор не нужен: при сбое
 * они откатывают `resolution` сами.
 */
async function claim(
    ref: FirebaseFirestore.DocumentReference,
    resolution: Resolution,
    isThisCheck: (check: PendingCheck) => boolean,
): Promise<PendingCheck | null> {
    return db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) return null;

        const check = snap.data() as PendingCheck;
        if (!isThisCheck(check)) return null;

        const resuming = resolution === 'timeout' && check.resolution === 'timeout';
        if (check.resolution && !resuming) return null;

        t.update(ref, { resolution });
        return check;
    });
}

// ─── Вход в чат ─────────────────────────────────────────────────────────────────

async function ask(telegram: Telegram, chatId: number, member: Person, joinedAt: number): Promise<void> {
    await telegram.restrictChatMember(chatId, member.id, { permissions: permissions(false) });

    const question = await telegram.sendMessage(
        chatId,
        `${mention(member)}, это чат 18+. Тебе есть восемнадцать?\n\n` +
        'Пока не ответишь, писать нельзя. Молчание — тоже ответ: через пять минут бан.',
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: 'Да, мне есть 18', callback_data: `age:yes:${member.id}` },
                    { text: 'Нет', callback_data: `age:no:${member.id}` },
                ]],
            },
        }
    );

    const check: PendingCheck = { chatId, userId: member.id, joinedAt, messageId: question.message_id };
    await checkRef(chatId, member.id).set({
        ...check,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const task: TimeoutTask = { chatId, userId: member.id, joinedAt, firstName: member.first_name };
    try {
        // Регион указан явно: без него Admin SDK ищет очередь в us-central1,
        // а функция живёт в europe-west1.
        await getFunctions()
            .taskQueue(`locations/${REGION}/functions/ageGateTimeout`)
            .enqueue(task, {
                scheduleDelaySeconds: TIMEOUT_SECONDS,
                // Telegram повторяет апдейт, если вебхук не ответил вовремя.
                // Одинаковый id не даст поставить вторую задачу на тот же вход.
                id: `age-${Math.abs(chatId)}-${member.id}-${joinedAt}`,
            });
    } catch (e: any) {
        if (e?.code === 'functions/task-already-exists') return;
        // Человек остаётся с вопросом и без таймаута: ответить кнопкой он может,
        // но молчуна никто не забанит. Чаще всего причина — у сервисного
        // аккаунта функций нет роли Cloud Tasks Enqueuer.
        console.error(`[AGE] ❌ Не удалось поставить таймаут для ${member.id}:`, e);
    }
}

export function register(bot: Telegraf): void {
    bot.on("new_chat_members", async (ctx, next) => {
        if (!hasFeature(ctx.chat.id, 'age_gate')) return next();

        for (const member of ctx.message.new_chat_members) {
            if (member.is_bot) continue;
            try {
                await ask(ctx.telegram, ctx.chat.id, member, ctx.message.date);
                console.log(`[AGE] Спросили возраст у ${member.id}`);
            } catch (e) {
                // Чаще всего — у бота нет права ограничивать участников.
                console.error(`[AGE] ❌ Не удалось спросить возраст у ${member.id}:`, e);
            }
        }

        return next();
    });

    // answerCbQuery здесь всегда ПОСЛЕДНИЙ. Вебхук отвечает Telegram прямо в теле
    // HTTP-ответа (см. telegram/index.ts), и answerCbQuery — один из методов,
    // которые уходят именно так. После него ответ закрыт, и всё, что идёт дальше,
    // выполняется в уже замороженной функции.
    bot.action(/^age:(yes|no):(\d+)$/, async (ctx) => {
        const answer = ctx.match[1] as 'yes' | 'no';
        const userId = Number(ctx.match[2]);
        const chatId = ctx.chat?.id;
        const messageId = ctx.callbackQuery.message?.message_id;

        if (ctx.from.id !== userId) {
            await ctx.answerCbQuery('Не тебя спрашивают.');
            return;
        }
        if (chatId === undefined) return;

        const ref = checkRef(chatId, userId);
        const check = await claim(ref, answer, (c) => c.messageId === messageId);
        if (!check) {
            await ctx.answerCbQuery('Уже решено.');
            return;
        }

        try {
            if (answer === 'yes') {
                await ctx.restrictChatMember(userId, { permissions: permissions(true) });
            } else {
                await ctx.banChatMember(userId);
            }
        } catch (e) {
            console.error(`[AGE] ❌ Не удалось применить ответ «${answer}» для ${userId}:`, e);
            // Возвращаем проверку в ожидание: можно нажать ещё раз, таймаут в силе.
            await ref.update({ resolution: admin.firestore.FieldValue.delete() });
            await ctx.answerCbQuery('Что-то сломалось, нажми ещё раз.');
            return;
        }

        const text = answer === 'yes'
            ? `Окей, ${mention(ctx.from)}. Проходи.`
            : pick(REFUSED, mention(ctx.from));
        await ctx.editMessageText(text, { parse_mode: 'HTML' })
            .catch((e) => console.warn('[AGE] Не удалось отредактировать вопрос:', e));

        await ref.delete();
        console.log(`[AGE] ${userId} ответил «${answer}»`);
        await ctx.answerCbQuery();
    });
}

// ─── Таймаут ────────────────────────────────────────────────────────────────────

/**
 * Срабатывает через пять минут после входа. Если человек к этому времени ответил,
 * документа уже нет, и задача ничего не делает.
 *
 * Ошибка бана пробрасывается наружу намеренно — Cloud Tasks повторит задачу.
 */
export const ageGateTimeout = onTaskDispatched<TimeoutTask>(
    {
        secrets: ["TELEGRAM_BOT_TOKEN"],
        retryConfig: { maxAttempts: 5, minBackoffSeconds: 30 },
    },
    async (request) => {
        const { chatId, userId, joinedAt, firstName } = request.data;

        const ref = checkRef(chatId, userId);
        const check = await claim(ref, 'timeout', (c) => c.joinedAt === joinedAt);
        if (!check) return;

        await sharedBot.telegram.banChatMember(chatId, userId);

        await sharedBot.telegram.editMessageText(
            chatId,
            check.messageId,
            undefined,
            pick(SILENT, mention({ id: userId, first_name: firstName })),
            { parse_mode: 'HTML' }
        ).catch((e) => console.warn('[AGE] Не удалось отредактировать вопрос:', e));

        await ref.delete();
        console.log(`[AGE] ${userId} не ответил за ${TIMEOUT_SECONDS} с — бан`);
    }
);
