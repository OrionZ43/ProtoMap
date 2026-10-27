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
 *   channel     — приветствие в обсуждении канала; вызывает next() всегда
 *   history     — до transcribe: пишет сообщения в память бота, а bot.on('voice')
 *                 в transcribe не зовёт next(), и запись ниже голосовых бы не
 *                 увидела; свой обработчик зовёт next() всегда
 *   команды     — до triggers: bot.on('text') ловит и команды
 *   age_gate    — после captcha: карантин (шаг 1 капчи) должен забанить
 *                 вошедшего раньше, чем ему зададут вопрос
 *   transcribe  — тоже команды, /text и /uwufier
 *   download    — тоже ловит текст (ищет ссылки), но вызывает next(),
 *                 поэтому обязан стоять до triggers
 *   ask         — до banter: ставит ctx.state.asked, и banter не отвечает
 *                 готовой фразой на вопрос, на который уже ответила нейросеть
 *   banter      — ловит текст, стикеры и любые сообщения, вызывает next()
 *                 всегда; до triggers по той же причине
 *   triggers    — ПОСЛЕДНИМ: bot.on('text') ловит любой текст
 */

import { onRequest } from "firebase-functions/v2/https";
import { bot } from "./core/bot";

import * as guards from "./core/guards";
import * as channel from "./features/channel";
import * as history from "./features/history";
import * as info from "./features/info";
import * as linking from "./features/linking";
import * as duel from "./features/duel";
import * as moderation from "./features/moderation";
import * as captcha from "./features/captcha";
import * as ageGate from "./features/ageGate";
import * as transcribe from "./features/transcribe";
import * as download from "./features/download";
import * as ask from "./features/ask";
import * as banter from "./features/banter";
import * as triggers from "./features/triggers";

console.log('[BOT] Initializing ProtoMap Guardian Bot v2.1...');

guards.register(bot);
channel.register(bot);
history.register(bot);
info.register(bot);
linking.register(bot);
duel.register(bot);
moderation.register(bot);
captcha.register(bot);
ageGate.register(bot);
transcribe.register(bot);
download.register(bot);
ask.register(bot);
banter.register(bot);
triggers.register(bot);

console.log('[BOT] ✅ All handlers registered successfully!');

// Таймаут проверки возраста — отдельная функция, её вызывает Cloud Tasks.
export { ageGateTimeout } from "./features/ageGate";

// Конец режима еблана — тоже отложенная задача Cloud Tasks (см. features/ask.ts).
export { eblanTimeout } from "./features/ask";

// ─── Webhook ─────────────────────────────────────────────────────────────────

export const telegramWebhook = onRequest(
    // 512 МБ, а не дефолтные 256: бот тянет много зависимостей (telegraf,
    // firebase-admin, vision, cloudinary), и на 256 МБ холодный старт иногда
    // не успевал начать слушать порт за стартовый probe Cloud Run — деплой падал
    // с «Container Healthcheck failed». Больше памяти — больше CPU на старте.
    { memory: "512MiB", secrets: ["TELEGRAM_BOT_TOKEN", "TG_VERIFY_HMAC_SECRET", "TG_WEBHOOK_SECRET"] },
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
            // Ответ мог уйти раньше: в режиме webhook reply или если Cloud Run
            // уже оборвал запрос по таймауту. Повторная отправка бросала бы
            // ERR_HTTP_HEADERS_SENT поверх настоящей ошибки.
            if (!response.headersSent) response.status(200).send("Error handled");
        }
    }
);
