/**
 * Сборка бота и точка входа вебхука.
 *
 * ⚠️ ПОРЯДОК ВЫЗОВОВ register() ЗНАЧИМ. Telegraf выполняет обработчики в
 * порядке регистрации, и обработчик, не вызвавший next(), обрывает цепочку.
 * Именно поэтому регистрация вынесена сюда явными вызовами, а не сделана
 * побочным эффектом импортов: сортировка импортов автоформаттером молча
 * поменяла бы поведение бота. Такое уже происходило в этом проекте —
 * см. `functions/src/options.ts`.
 *
 * Что от чего зависит:
 *
 *   guards      — первым, до него не должно выполняться ничего
 *   channel     — до triggers: пост канала может быть текстом, а bot.on('text')
 *                 его перехватит; здесь же приветствие в комментариях, которое
 *                 обязано идти до капчи (та не вызывает next())
 *   команды     — до triggers по той же причине: bot.on('text') ловит и команды
 *   transcribe  — тоже команды, /text и /uwufier
 *   download    — тоже ловит текст (ищет ссылки), но вызывает next(),
 *                 поэтому обязан стоять до triggers
 *   triggers    — ПОСЛЕДНИМ: bot.on('text') ловит любой текст
 */

import { onRequest } from "firebase-functions/v2/https";
import { bot } from "./core/bot";

import * as guards from "./core/guards";
import * as channel from "./features/channel";
import * as info from "./features/info";
import * as linking from "./features/linking";
import * as duel from "./features/duel";
import * as moderation from "./features/moderation";
import * as captcha from "./features/captcha";
import * as transcribe from "./features/transcribe";
import * as download from "./features/download";
import * as triggers from "./features/triggers";

console.log('[BOT] Initializing ProtoMap Guardian Bot v2.1...');

guards.register(bot);
channel.register(bot);
info.register(bot);
linking.register(bot);
duel.register(bot);
moderation.register(bot);
captcha.register(bot);
transcribe.register(bot);
download.register(bot);
triggers.register(bot);

console.log('[BOT] ✅ All handlers registered successfully!');

// ─── Webhook ─────────────────────────────────────────────────────────────────

export const telegramWebhook = onRequest(
    { secrets: ["TELEGRAM_BOT_TOKEN", "TG_VERIFY_HMAC_SECRET", "TG_WEBHOOK_SECRET"] },
    async (request, response) => {
        const secret = request.header('X-Telegram-Bot-Api-Secret-Token');
        if (!process.env.TG_WEBHOOK_SECRET || secret !== process.env.TG_WEBHOOK_SECRET) {
            console.warn('[WEBHOOK] ❌ Rejected: bad or missing secret token');
            response.status(403).send('Forbidden');
            return;
        }

        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            console.error('[WEBHOOK] ❌ No bot token!');
            response.status(500).send("No Token");
            return;
        }
        try {
            // `response` передаётся вторым аргументом намеренно: это режим
            // webhook reply — Telegraf отвечает Telegram прямо в теле этого
            // HTTP-ответа, без отдельного запроса к Bot API. Убрать аргумент
            // и слать 200 вручную можно, но это лишний round-trip на каждое
            // сообщение.
            await bot.handleUpdate(request.body, response);
        } catch (e) {
            console.error("[WEBHOOK] ❌ Error:", e);
            response.status(200).send("Error handled");
        }
    }
);
