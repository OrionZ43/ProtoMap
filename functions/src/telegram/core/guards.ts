/**
 * Фильтр разрешённых чатов.
 *
 * Единственная защита от того, чтобы бота добавили в чужой чат: всё, чего нет
 * в `ALLOWED_CHATS`, он покидает сам. Регистрируется ПЕРВЫМ — до этой проверки
 * не должен выполняться ни один обработчик.
 *
 * Обратная сторона: добавив бота в новый чат и забыв внести его в список, вы
 * увидите, как он выходит через секунду без единого сообщения об ошибке.
 */

import { Telegraf } from "telegraf";
import { ALLOWED_CHATS } from "./bot";

export function register(bot: Telegraf): void {
    bot.use(async (ctx, next) => {
        if (ctx.chat?.type === 'private') return next();

        if (ctx.chat && ALLOWED_CHATS.includes(ctx.chat.id)) return next();
        console.warn(`[SECURITY] Unauthorized chat ${ctx.chat?.id}. Leaving.`);
        try { await ctx.leaveChat(); } catch (e) { console.error("[SECURITY] Failed to leave:", e); }
    });
}
