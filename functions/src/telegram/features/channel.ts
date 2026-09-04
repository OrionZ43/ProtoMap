/**
 * Работа с каналом и его обсуждением.
 *
 * Telegram сам пересылает каждый пост канала в привязанное обсуждение, помечая
 * пересылку флагом `is_automatic_forward`. Ответ на такое сообщение показывается
 * как комментарий под постом — другого способа комментировать от имени бота нет.
 *
 * Регистрируется РАНО, до обработчиков текста: пост может быть и текстом, и фото,
 * а `bot.on('text')` в triggers обрывал бы цепочку.
 */

import { Telegraf } from "telegraf";
import { CHAT_INVITE_URL } from "../core/bot";
import { hasFeature } from "../core/registry";

export function register(bot: Telegraf): void {
    // ─── Приглашение в чат под постами канала ────────────────────────────────────
    //
    // Telegram сам пересылает каждый пост канала в привязанное обсуждение, помечая
    // пересылку флагом `is_automatic_forward`. Ответ на это сообщение показывается
    // как комментарий под постом — другого способа комментировать от имени бота нет.
    //
    // Зарегистрировано ДО остальных обработчиков сообщений намеренно: пост может
    // быть и текстом, и фото, и видео, а `bot.on('text')` ниже обрывал бы цепочку.
    // Во всех неподходящих случаях вызывается next(), иначе бот проглотит вообще
    // все сообщения.
    bot.on('message', async (ctx, next) => {
        const msg = ctx.message as any;

        if (!hasFeature(ctx.chat?.id, 'channel_promo')) return next();
        if (!msg?.is_automatic_forward) return next();

        try {
            // Шутка про название объясняет сама себя намеренно: это видят читатели
            // канала, которые в чате не были, и «гарем» без контекста читается
            // буквально. Формулировка сразу помечает название как несерьёзное.
            await ctx.reply(
                'У нас есть чат. Называется «Гарем протогена» — не спрашивай, так вышло. Заходи.',
                {
                    reply_parameters: { message_id: msg.message_id },
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Вступить в гарем', url: CHAT_INVITE_URL }]],
                    },
                }
            );
        } catch (e) {
            // Чаще всего — нет прав на отправку в обсуждении. Не роняем остальное.
            console.error('[CHANNEL] Не удалось прокомментировать пост:', e);
        }

        return next();
    });

    // Шаг 1.5: подсказка вступившим в чат комментариев
    //
    // В обсуждение канала регулярно вступают люди, думая, что это чат сообщества.
    // Капчи здесь нет и быть не должно — вступление в обсуждение это нормальное
    // действие, а не рейд; просто человеку надо сказать, что он не туда попал.
    bot.on("new_chat_members", async (ctx, next) => {
        if (!hasFeature(ctx.chat?.id, 'comments_greeting')) return next();

        try {
            const names = ctx.message.new_chat_members
                .filter((m) => !m.is_bot)
                .map((m) => m.first_name)
                .join(', ');
            if (!names) return next();

            await ctx.reply(
                `${names}, это чат комментариев к постам канала — тут только обсуждение публикаций.\n\n` +
                'Если хочешь в чатик Ориоши, подавай заявку по кнопке ниже.',
                {
                    reply_parameters: { message_id: ctx.message.message_id },
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Подать заявку в чат', url: CHAT_INVITE_URL }]],
                    },
                }
            );
        } catch (e) {
            console.error('[COMMENTS] Не удалось поприветствовать:', e);
        }

        return next();
    });
}
