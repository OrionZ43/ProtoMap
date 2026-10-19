/**
 * Обсуждение канала: подсказка вступившим.
 *
 * Люди из канала регулярно вступают в обсуждение, думая, что это чат
 * сообщества. Бот говорит им, что здесь только комментарии к постам.
 *
 * Ссылки на личный чат здесь нет по решению Ориона (2026-10-18): через неё
 * в чат приходили посторонние. По той же причине бот больше не оставляет
 * под постами комментарий-приглашение.
 */

import { Telegraf } from "telegraf";
import { hasFeature } from "../core/registry";

export function register(bot: Telegraf): void {
    // Капчи в обсуждении нет и быть не должно: вступление в обсуждение — обычное
    // действие, а не рейд. Человеку достаточно сказать, что он не туда попал.
    bot.on("new_chat_members", async (ctx, next) => {
        if (!hasFeature(ctx.chat?.id, 'comments_greeting')) return next();

        try {
            const names = ctx.message.new_chat_members
                .filter((m) => !m.is_bot)
                .map((m) => m.first_name)
                .join(', ');
            if (!names) return next();

            await ctx.reply(
                `${names}, это чат комментариев к постам канала — тут только обсуждение публикаций.`,
                { reply_parameters: { message_id: ctx.message.message_id } }
            );
        } catch (e) {
            console.error('[COMMENTS] Не удалось поприветствовать:', e);
        }

        return next();
    });
}
