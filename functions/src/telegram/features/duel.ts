/**
 * Дуэли на ProtoCoins: /duel и обработка кнопки присоединения.
 */

import { Telegraf, Markup } from "telegraf";
import { db } from "../core/bot";
import { getUserByTgId } from "../core/helpers";

export function register(bot: Telegraf): void {
    // ─── /duel ────────────────────────────────────────────────────────────────────
    bot.command("duel", async (ctx) => {
        console.log('[COMMAND] /duel called');
        const args   = ctx.message.text.split(' ');
        const betStr = args[1];

        if (!betStr || isNaN(parseInt(betStr))) {
            await ctx.reply("⚔️ Формат: /duel [ставка]\nПример: /duel 100");
            return;
        }

        const bet = parseInt(betStr);
        if (bet < 10)    { await ctx.reply("Минимальная ставка: 10 PC.");    return; }
        if (bet > 10000) { await ctx.reply("Максимальная ставка: 10000 PC."); return; }

        const initiatorTgId = ctx.from.id;
        const initiatorDoc  = await getUserByTgId(initiatorTgId);

        if (!initiatorDoc) {
            await ctx.reply("❌ Вы не привязали аккаунт! Используйте /link (код на сайте).");
            return;
        }

        const initiatorData = initiatorDoc.data();
        if ((initiatorData?.casino_credits || 0) < bet) {
            await ctx.reply(`❌ Недостаточно средств. Ваш баланс: ${initiatorData?.casino_credits} PC.`);
            return;
        }

        await ctx.reply(
            `🤺 *ДУЭЛЬ!*\n\nБоец: *${ctx.from.first_name}*\nСтавка: *${bet} PC*\n\nКто осмелится принять вызов?`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback(`⚔️ ПРИНЯТЬ (${bet} PC)`, `join_duel_${initiatorTgId}_${bet}`)
                ])
            }
        );
    });

    bot.action(/join_duel_(\d+)_(\d+)/, async (ctx) => {
        const initiatorTgId = parseInt(ctx.match[1]);
        const bet           = parseInt(ctx.match[2]);
        const acceptorTgId  = ctx.from.id;

        if (initiatorTgId === acceptorTgId) {
            await ctx.answerCbQuery("Нельзя драться с самим собой! 🗿");
            return;
        }

        const initiatorDoc = await getUserByTgId(initiatorTgId);
        const acceptorDoc  = await getUserByTgId(acceptorTgId);

        if (!acceptorDoc) {
            await ctx.answerCbQuery("Сначала привяжите аккаунт на сайте! (/link)", { show_alert: true });
            return;
        }

        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch (e) {
            await ctx.answerCbQuery("Дуэль уже началась или неактуальна.");
            return;
        }

        const initiatorRef = db.collection('users').doc(initiatorDoc!.id);
        const acceptorRef  = db.collection('users').doc(acceptorDoc.id);

        try {
            let winnerName = "", loserName = "", winAmount = 0;

            await db.runTransaction(async (t) => {
                const iSnap = await t.get(initiatorRef);
                const aSnap = await t.get(acceptorRef);

                if (!iSnap.exists || !aSnap.exists) throw new Error("Users not found");

                const iData = iSnap.data()!;
                const aData = aSnap.data()!;

                if ((iData.casino_credits || 0) < bet) throw new Error("Initiator broke");
                if ((aData.casino_credits || 0) < bet) throw new Error("Acceptor broke");

                const isInitiatorWin = Math.random() < 0.5;
                const pot   = bet * 2;
                const tax   = Math.floor(pot * 0.1);
                winAmount   = pot - tax;

                if (isInitiatorWin) {
                    winnerName = iData.username; loserName = aData.username;
                    t.update(initiatorRef, { casino_credits: (iData.casino_credits || 0) - bet + winAmount });
                    t.update(acceptorRef,  { casino_credits: (aData.casino_credits || 0) - bet });
                } else {
                    winnerName = aData.username; loserName = iData.username;
                    t.update(acceptorRef,  { casino_credits: (aData.casino_credits || 0) - bet + winAmount });
                    t.update(initiatorRef, { casino_credits: (iData.casino_credits || 0) - bet });
                }
            });

            await ctx.reply(
                `⚔️ *ИТОГИ ДУЭЛИ:*\n\n` +
                `💀 Проигравший: ${loserName}\n` +
                `👑 Победитель: *${winnerName}*\n` +
                `💰 Куш: *${winAmount} PC* (Налог: 10%)`,
                { parse_mode: "Markdown" }
            );

        } catch (e: any) {
            console.error("[DUEL ERROR]:", e);
            if (e.message === "Initiator broke") {
                await ctx.reply("🚫 Дуэль отменена: У инициатора закончились деньги.");
            } else if (e.message === "Acceptor broke") {
                await ctx.reply(`🚫 @${ctx.from.username}, у вас недостаточно средств для принятия вызова!`);
            } else {
                await ctx.reply("Сбой системы. Дуэль аннулирована.");
            }
        }
    });
}
