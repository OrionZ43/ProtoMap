/**
 * Команды модерации: предупреждения, муты, баны, карантин.
 */

import { Telegraf } from "telegraf";
import { db, admin, SETTINGS_DOC_REF, TELEGRAM_SERVICE_IDS } from "../core/bot";
import { isAdmin, isTargetImmune } from "../core/helpers";

const MAX_WARNS = 3;

function parseTime(input: string): number {
    const match = input.match(/^(\d+)([mhds])$/);
    if (!match) return 0;
    const value = parseInt(match[1]);
    switch (match[2]) {
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        case 's': return value;
        default:  return 0;
    }
}

export function register(bot: Telegraf): void {
    // ─── Команды модерации ────────────────────────────────────────────────────────
    bot.command("warn", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        const replyMsg = (ctx.message as any).reply_to_message;
        if (!replyMsg) {
            await ctx.reply("⚠️ Ошибка: Эту команду нужно писать В ОТВЕТ (Reply) на сообщение нарушителя.");
            return;
        }

        const targetUser = replyMsg.from;
        if (!targetUser || targetUser.is_bot || TELEGRAM_SERVICE_IDS.includes(targetUser.id)) {
            await ctx.reply("❌ Нельзя выдать предупреждение этому пользователю (Бот/Система).");
            return;
        }
        if (await isTargetImmune(ctx, targetUser.id)) {
            await ctx.reply("⛔ Нельзя выдать варн администратору.");
            return;
        }

        const warnRef = db.collection('telegram_moderation').doc(String(targetUser.id));
        await db.runTransaction(async (t) => {
            const doc   = await t.get(warnRef);
            const warns = (doc.exists ? doc.data()?.warns : 0) + 1;

            if (warns >= MAX_WARNS) {
                try {
                    await ctx.banChatMember(targetUser.id);
                    await ctx.reply(`🚫 [BAN] ${targetUser.first_name} был изгнан за превышение лимита предупреждений.`);
                    t.delete(warnRef);
                } catch (e) { await ctx.reply("Ошибка при бане. Проверьте права бота."); }
            } else {
                t.set(warnRef, {
                    warns,
                    lastWarnDate: admin.firestore.FieldValue.serverTimestamp(),
                    username:     targetUser.username || targetUser.first_name
                }, { merge: true });
                await ctx.reply(`⚠️ [WARN] Предупреждение [${warns}/${MAX_WARNS}] для ${targetUser.first_name}.`);
            }
        });
    });

    bot.command("unwarn", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        let targetId: number | null = null;
        let targetName              = "Пользователя";
        const replyMsg              = (ctx.message as any).reply_to_message;

        if (replyMsg) {
            targetId   = replyMsg.from.id;
            targetName = replyMsg.from.first_name;
        } else {
            const args = ctx.message.text.split(' ');
            if (args.length > 1) { targetId = parseInt(args[1]); targetName = `ID ${targetId}`; }
        }

        if (!targetId || isNaN(targetId)) {
            await ctx.reply("ℹ️ Используйте: ответьте на сообщение ИЛИ напишите /unwarn ID");
            return;
        }

        const warnRef = db.collection('telegram_moderation').doc(String(targetId));
        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(warnRef);
                if (!doc.exists || !doc.data()?.warns) throw new Error("No warns");
                const newWarns = doc.data()!.warns - 1;
                newWarns <= 0 ? t.delete(warnRef) : t.update(warnRef, { warns: newWarns });
            });
            await ctx.reply(`✅ Одно предупреждение снято с ${targetName}.`);
        } catch (e: any) {
            if (e.message === "No warns") await ctx.reply("ℹ️ У этого пользователя нет активных предупреждений.");
            else { console.error("[UNWARN ERROR]:", e); await ctx.reply("Ошибка базы данных."); }
        }
    });

    bot.command("ban", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        const replyMsg = (ctx.message as any).reply_to_message;
        if (!replyMsg) {
            await ctx.reply("⚠️ Ошибка: Чтобы забанить, ответьте на сообщение пользователя командой /ban.");
            return;
        }

        const targetUser = replyMsg.from;
        if (!targetUser || TELEGRAM_SERVICE_IDS.includes(targetUser.id)) {
            await ctx.reply("❌ Нельзя забанить системного бота или анонимного администратора.");
            return;
        }
        if (await isTargetImmune(ctx, targetUser.id)) { await ctx.reply("Ты еблан?"); return; }

        try {
            await ctx.banChatMember(targetUser.id);
            await ctx.reply(`🔨 [BANHAMMER] ${targetUser.first_name} отправлен в /dev/null.`);
        } catch (e) { await ctx.reply("Не удалось забанить. Возможно, у меня нет прав."); }
    });

    bot.command("mute", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        const replyMsg = (ctx.message as any).reply_to_message;
        if (!replyMsg) { await ctx.reply("⚠️ Используйте ответ на сообщение: /mute 10m, /mute 2h"); return; }

        const args    = (ctx.message as any).text.split(' ');
        const timeStr = args[1];
        if (!timeStr) { await ctx.reply("⚠️ Укажите время: 10m (минуты), 2h (часы), 1d (дни)."); return; }

        const seconds = parseTime(timeStr);
        if (seconds === 0) { await ctx.reply("❌ Неверный формат времени."); return; }

        const targetUser = replyMsg.from;
        if (await isTargetImmune(ctx, targetUser.id)) { await ctx.reply("Ты еблан?"); return; }

        const untilDate = Math.floor(Date.now() / 1000) + seconds;
        try {
            await ctx.restrictChatMember(targetUser.id, {
                until_date: untilDate,
                permissions: {
                    can_send_messages:         false,
                    can_send_audios:           false,
                    can_send_documents:        false,
                    can_send_photos:           false,
                    can_send_videos:           false,
                    can_send_other_messages:   false,
                    can_add_web_page_previews: false,
                }
            });
            await ctx.reply(`🔇 ${targetUser.first_name} обеззвучен на ${timeStr}.`);
        } catch (e) { await ctx.reply("Ошибка мута. Возможно, время слишком короткое (<30 сек) или у меня нет прав."); }
    });

    bot.command("unmute", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        const replyMsg = (ctx.message as any).reply_to_message;
        if (!replyMsg) { await ctx.reply("⚠️ Ответьте на сообщение пользователя: /unmute"); return; }

        const targetUser = replyMsg.from;
        try {
            await ctx.restrictChatMember(targetUser.id, {
                permissions: {
                    can_send_messages:         true,
                    can_send_audios:           true,
                    can_send_documents:        true,
                    can_send_photos:           true,
                    can_send_videos:           true,
                    can_send_other_messages:   true,
                    can_add_web_page_previews: true,
                    can_invite_users:          true,
                }
            });
            await ctx.reply(`🔊 ${targetUser.first_name} снова может говорить.`);
        } catch (e) { await ctx.reply("Ошибка размута."); }
    });

    bot.command("unban", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        let targetId: number | null = null;
        const replyMsg = (ctx.message as any).reply_to_message;

        if (replyMsg) {
            targetId = replyMsg.from.id;
        } else {
            const args = (ctx.message as any).text.split(' ');
            if (args.length > 1) targetId = parseInt(args[1]);
        }

        if (!targetId || isNaN(targetId)) {
            await ctx.reply("ℹ️ Использование:\n• В ответ на сообщение: /unban\n• По ID: /unban 12345678");
            return;
        }
        if (TELEGRAM_SERVICE_IDS.includes(targetId)) { await ctx.reply("🗿 Этого пользователя нельзя разбанить."); return; }

        try {
            await ctx.unbanChatMember(targetId, { only_if_banned: true });
            await ctx.reply(`✅ Пользователь ${targetId} разбанен. Сброс варнов...`);
            await db.collection('telegram_moderation').doc(String(targetId)).delete();
        } catch (e) { await ctx.reply("Ошибка разбана. Проверьте ID."); }
    });

    bot.command("lockdown", async (ctx) => {
        if (!(await isAdmin(ctx))) return;

        const args = (ctx.message as any).text.split(' ');
        const mode = args[1]?.toLowerCase();

        if (mode === 'on') {
            await SETTINGS_DOC_REF.set({ lockdown: true }, { merge: true });
            await ctx.reply("🚨 ВНИМАНИЕ: РЕЖИМ КАРАНТИНА АКТИВИРОВАН. Все новые участники будут автоматически заблокированы.");
        } else if (mode === 'off') {
            await SETTINGS_DOC_REF.set({ lockdown: false }, { merge: true });
            await ctx.reply("🟢 Режим карантина отключен. Вход свободный (через Cloudflare Turnstile).");
        } else {
            const currentSnap = await SETTINGS_DOC_REF.get();
            const status      = currentSnap.data()?.lockdown ? "🔴 ВКЛЮЧЕН" : "🟢 ВЫКЛЮЧЕН";
            await ctx.reply(`Текущий статус LockDown: ${status}\nИспользуйте: /lockdown on или /lockdown off`);
        }
    });
}
