/**
 * Привязка Telegram-аккаунта к учётной записи на сайте (/link).
 */

import { Telegraf } from "telegraf";
import { db, admin } from "../core/bot";

// ─── При привязке аккаунта: переносим pending-верификацию если она уже есть ──
async function checkPendingChatVerification(uid: string, tgId: number): Promise<void> {
    try {
        const pendingRef  = db.collection('telegram_chat_pending').doc(String(tgId));
        const pendingSnap = await pendingRef.get();
        if (pendingSnap.exists) {
            await db.collection('users').doc(uid).update({
                telegram_chat_verified:    true,
                telegram_chat_verified_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await pendingRef.delete();
            console.log(`[LINK] Chat verification transferred from pending: uid=${uid} tgId=${tgId}`);
        }
    } catch (e) {
        console.error('[LINK] checkPendingChatVerification error:', e);
    }
}

export function register(bot: Telegraf): void {
    // ─── /link — привязка аккаунта ────────────────────────────────────────────────
    bot.command("link", async (ctx) => {
        console.log('[COMMAND] /link called by', ctx.from.id);
        try { await ctx.deleteMessage(); } catch (e) {}

        try {
            const message = ctx.message as any;
            const args    = message.text.split(' ');
            const code    = args[1]?.trim();

            if (!code) {
                await ctx.reply("❌ Введите код с сайта. Пример: `/link PM-A1B2C3`", { parse_mode: 'Markdown' });
                return;
            }

            const codeRef = db.collection('system').doc('telegram_codes').collection('active_codes').doc(code);
            const codeDoc = await codeRef.get();

            if (!codeDoc.exists) {
                console.log(`[LINK] Code ${code} not found`);
                await ctx.reply("❌ Код не найден. Возможно, он устарел или введен с ошибкой.");
                return;
            }

            const data = codeDoc.data();

            if (data?.expiresAt && Date.now() > data.expiresAt) {
                console.log(`[LINK] Code ${code} expired`);
                await codeRef.delete();
                await ctx.reply("❌ Срок действия кода истек. Сгенерируйте новый.");
                return;
            }

            const uid      = data?.uid;
            if (!uid) { await ctx.reply("❌ Ошибка данных кода (нет UID)."); return; }

            const tgId     = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name || "Unknown";

            const existing = await db.collection('users').where('telegram_id', '==', tgId).get();
            if (!existing.empty && existing.docs[0].id !== uid) {
                await ctx.reply("❌ Этот Telegram аккаунт уже привязан к другому профилю на сайте.");
                return;
            }

            console.log(`[LINK] Linking TG ${tgId} to UID ${uid}`);
            await db.collection('users').doc(uid).update({
                telegram_id:       tgId,
                telegram_username: username,
            });

            await codeRef.delete();

            // 🆕 Переносим верификацию чата если пользователь прошёл Turnstile до привязки
            await checkPendingChatVerification(uid, tgId);

            await ctx.reply("✅ Аккаунт успешно привязан! Теперь вы можете участвовать в дуэлях.");

        } catch (error: any) {
            console.error("[LINK ERROR]:", error);
            await ctx.reply(`⚠️ Системная ошибка при привязке: ${error.message}`);
        }
    });
}
