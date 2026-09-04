/**
 * Настройки воркера. Всё читается из окружения — в образ ничего не зашито.
 */

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Не задана переменная окружения ${name}`);
    }
    return value;
}

/** Путь к JSON-ключу сервисного аккаунта Firebase (монтируется в контейнер). */
export const SERVICE_ACCOUNT_PATH =
    process.env.SERVICE_ACCOUNT_PATH || "/secrets/sa.json";

export const TELEGRAM_BOT_TOKEN = required("TELEGRAM_BOT_TOKEN");

/** Рабочая папка для временных файлов. В compose она смонтирована на HDD. */
export const WORK_DIR = process.env.WORK_DIR || "/work";

/** Куда кладётся самообновляемый бинарник yt-dlp. */
export const YTDLP_DIR = process.env.YTDLP_DIR || "/opt/ytdlp";

/** Коллекция очереди в Firestore. */
export const QUEUE_COLLECTION = "tg_download_queue";

/** Документ с пульсом воркера — его читает команда /dlstatus в боте. */
export const HEARTBEAT_DOC = "system/downloader_status";

/**
 * Как часто опрашивать очередь, мс.
 *
 * Это подстраховка, а не основной путь: задачи приходят подпиской Firestore
 * мгновенно. Опрос нужен на случай, если подписка отвалится по сети и не
 * восстановится — иначе очередь встала бы молча.
 */
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30000);

/** Как часто писать пульс, мс. */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Сколько задач качать одновременно.
 *
 * Два — сознательный потолок: у сервера 8 ГБ и обычный HDD под временные файлы,
 * а параллельные загрузки видео упираются именно в диск, а не в процессор.
 */
export const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);

/**
 * Через сколько задача в статусе processing считается зависшей и возвращается
 * в очередь. Без этого одна упавшая загрузка затыкает очередь навсегда.
 */
export const STALE_JOB_MS = 10 * 60 * 1000;

/**
 * Потолок размера файла.
 *
 * 50 МБ — жёсткий лимит Bot API на загрузку файла ботом, не наш выбор.
 * Берём с запасом: превысив его, отправка упадёт уже после скачивания,
 * то есть впустую потратив время и трафик.
 */
export const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;

/** Сколько ждать саму загрузку, прежде чем считать её зависшей. */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * User-Agent для e621: их API отклоняет запросы без осмысленного заголовка,
 * это прямо написано в их правилах.
 */
export const E621_USER_AGENT =
    process.env.E621_USER_AGENT || "ProtoMapBot/1.0 (by Orion_Z43 on e621)";
