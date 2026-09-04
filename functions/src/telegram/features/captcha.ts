/**
 * Антирейд на входе в чат: карантин и проверка через Cloudflare Turnstile.
 *
 * Шаг 1 (карантин) регистрируется всегда — он под возможностью `moderation`
 * и срабатывает только когда админ включил lockdown вручную.
 * Шаг 2 (капча) — только там, где включена возможность `captcha`.
 */

import { Telegraf, Markup } from "telegraf";
// Именно модуль Node, а не глобальный Web Crypto: у последнего нет createHmac.
import * as crypto from "crypto";
import { db, admin, SETTINGS_DOC_REF, HMAC_SECRET } from "../core/bot";
import { hasFeature } from "../core/registry";

// ─── Генератор подписанной ссылки на верификацию ─────────────────────────────
function buildVerifyUrl(tgId: number): string {
    const sig = crypto
        .createHmac('sha256', HMAC_SECRET)
        .update(String(tgId))
        .digest('hex');
    return `https://proto-map.vercel.app/verify-chat?tgId=${tgId}&sig=${sig}`;
}

export function register(bot: Telegraf): void {
    // ─── Антирейд: вход в чат ─────────────────────────────────────────────────────

    // Шаг 1: Lockdown — бан при входе
    bot.on("new_chat_members", async (ctx, next) => {
        try {
            const settingsSnap = await SETTINGS_DOC_REF.get();
            const isLockdown   = settingsSnap.exists ? settingsSnap.data()?.lockdown : false;

            if (isLockdown) {
                for (const member of ctx.message.new_chat_members) {
                    try {
                        await ctx.banChatMember(member.id);
                        await ctx.deleteMessage();
                    } catch (e) { console.error(`[LOCKDOWN] Failed to autoban ${member.id}`, e); }
                }
                return;
            }
        } catch (e) { console.error("[LOCKDOWN] Check error:", e); }
        return next();
    });

    // Шаг 2: 🆕 Cloudflare Turnstile верификация через сайт
    bot.on("new_chat_members", async (ctx) => {
        // В личном чате и в обсуждении канала капчи нет: там свои люди либо
        // обычные читатели, а не защита от рейдов. Шаг 1 (lockdown) при этом
        // остаётся — он под 'moderation' и срабатывает только по команде админа.
        if (!hasFeature(ctx.chat?.id, 'captcha')) return;

        try {
            for (const member of ctx.message.new_chat_members) {
                if (member.is_bot) continue;

                // Ограничиваем участника до прохождения верификации
                await ctx.restrictChatMember(member.id, {
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

                // Генерируем HMAC-подписанную ссылку
                const verifyUrl = buildVerifyUrl(member.id);

                const sentMsg = await ctx.reply(
                    `🛡 *ЗАЩИТА ПЕРИМЕТРА*\n\n` +
                    `Привет, [${member.first_name}](tg://user?id=${member.id})!\n\n` +
                    `Нажми кнопку — тебя перекинет на сайт. Там нужно пройти проверку Cloudflare.\n` +
                    `Это займёт 2 секунды и защищает чат от ботов 🤖`,
                    {
                        parse_mode: "Markdown",
                        ...Markup.inlineKeyboard([
                            Markup.button.url("✅ ПРОЙТИ ВЕРИФИКАЦИЮ", verifyUrl)
                        ])
                    }
                );

                // Сохраняем messageId чтобы удалить после верификации
                await db.collection('telegram_chat_pending_msg').doc(String(member.id)).set({
                    messageId: sentMsg.message_id,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }).catch((e: any) => console.warn('[CAPTCHA] Failed to save messageId:', e));

                console.log(`[CAPTCHA] Sent Turnstile verify link to ${member.id} (${member.first_name})`);
            }
        } catch (e) {
            console.error("[CAPTCHA ERROR]:", e);
        }
    });

    // Шаг 3: После прохождения Turnstile на сайте — /api/verify-chat снимает ограничения
    // через Bot API напрямую (в server.ts), поэтому bot.action на verify_ больше не нужен.
    // Но оставим старый как fallback на случай если кто-то пришёл со старой ссылкой:
    bot.action(/verify_(\d+)/, async (ctx) => {
        await ctx.answerCbQuery("Эта кнопка устарела. Используй новую ссылку от бота! 🔄");
    });
}
