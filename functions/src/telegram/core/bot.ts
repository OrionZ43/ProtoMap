/**
 * Инстанс бота и всё, что нужно нескольким модулям сразу.
 *
 * Здесь НЕ регистрируются обработчики — только общие объекты. Регистрация живёт
 * в `features/*`, а порядок вызовов задан явно в `telegram/index.ts`: в Telegraf
 * он значим, и держать его в одном читаемом месте важнее, чем экономить строки.
 */

import { Telegraf } from "telegraf";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

export { admin };

export const db = admin.firestore();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const HMAC_SECRET = process.env.TG_VERIFY_HMAC_SECRET ?? "";

export const bot = new Telegraf(BOT_TOKEN || "");

/** Настройки чата: сейчас там только флаг карантина (`lockdown`). */
export const SETTINGS_DOC_REF = db.collection("system").doc("telegram_config");

/** Служебные аккаунты Telegram — их нельзя банить и мутить. */
export const TELEGRAM_SERVICE_IDS = [777000, 1087968824];

// ─── Чаты ────────────────────────────────────────────────────────────────────

export const PROTOMAP_CHAT_ID = -1002885386686;
export const GAREM_CHAT_ID = -1002413943981;

/** Канал, где Орион публикует посты. */
export const CHANNEL_ID = -1002401094165;

/**
 * Обсуждение канала. Именно сюда Telegram автоматически пересылает каждый пост,
 * и ответ на такую пересылку становится комментарием под постом.
 * Люди из канала регулярно вступают сюда, думая, что это чат сообщества.
 */
export const COMMENTS_CHAT_ID = -1003134894415;

/** Ссылка-заявка в основной чат. */
export const CHAT_INVITE_URL = "https://t.me/+YTiDpneLob05YTMy";

/**
 * Белый список. Из любого другого чата бот выходит сам — см. `core/guards.ts`.
 * Добавляя бота в новый чат, вносить сюда ОБЯЗАТЕЛЬНО, иначе он выйдет молча
 * через секунду после добавления.
 */
export const ALLOWED_CHATS = [
    PROTOMAP_CHAT_ID,
    GAREM_CHAT_ID,
    CHANNEL_ID,
    COMMENTS_CHAT_ID,
];
