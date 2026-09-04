/**
 * Отправка скачанного файла в Telegram.
 *
 * Напрямую через Bot API, без прохода через Firebase: иначе файл шёл бы наружу
 * из Cloud Functions и считался бы исходящим трафиком, а бесплатных 5 ГБ в
 * месяц на видео хватает примерно ни на что.
 */

import { createReadStream } from "node:fs";
import { basename, extname } from "node:path";

import { TELEGRAM_BOT_TOKEN } from "./config.js";

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac"]);
const ANIM_EXT = new Set([".gif"]);

type SendResult = { ok: true } | { ok: false; error: string };

/**
 * У картинок отдельный лимит: sendPhoto принимает не больше 10 МБ, тогда как
 * видео и документы — 50. Это не наше ограничение, а Bot API, и узнаётся оно
 * только по ошибке «file of size ... is too big for a photo».
 *
 * Крупную картинку отправляем документом. Она перестанет показываться
 * превьюшкой в ленте, но дойдёт — это лучше, чем «не получилось».
 */
import { PHOTO_MAX_BYTES } from "./image.js";

/**
 * Метод и имя поля зависят от типа файла. Отправлять всё как документ можно,
 * но тогда видео не проигрывается в чате, а превращается в файл на скачивание.
 */
function methodFor(path: string, size: number): { method: string; field: string; canSpoiler: boolean } {
    const ext = extname(path).toLowerCase();
    if (VIDEO_EXT.has(ext)) return { method: "sendVideo", field: "video", canSpoiler: true };
    if (PHOTO_EXT.has(ext)) {
        return size > PHOTO_MAX_BYTES
            ? { method: "sendDocument", field: "document", canSpoiler: true }
            : { method: "sendPhoto", field: "photo", canSpoiler: true };
    }
    if (ANIM_EXT.has(ext)) return { method: "sendAnimation", field: "animation", canSpoiler: true };
    if (AUDIO_EXT.has(ext)) return { method: "sendAudio", field: "audio", canSpoiler: false };
    return { method: "sendDocument", field: "document", canSpoiler: false };
}

export async function sendFile(opts: {
    chatId: number;
    replyTo?: number;
    path: string;
    size: number;
    spoiler: boolean;
    caption?: string;
    /** Метаданные видео — без них превью пустое, а длительность 00:00. */
    duration?: number;
    width?: number;
    height?: number;
    thumbPath?: string;
}): Promise<SendResult> {
    const { method, field, canSpoiler } = methodFor(opts.path, opts.size);

    const form = new FormData();
    form.append("chat_id", String(opts.chatId));

    if (opts.replyTo) {
        // reply_parameters, а не устаревшее reply_to_message_id (Bot API 7.0)
        form.append("reply_parameters", JSON.stringify({ message_id: opts.replyTo }));
    }
    if (opts.caption) form.append("caption", opts.caption);

    // Спойлер поддерживают не все типы: у аудио и документов его просто нет,
    // и попытка передать поле обернётся ошибкой валидации.
    if (opts.spoiler && canSpoiler) form.append("has_spoiler", "true");

    /**
     * Для видео обязательно сообщаем всё, что знаем сами.
     *
     * Telegram пытается вытащить длительность и размеры из файла, но у mp4
     * после склейки заголовок лежит в конце, и он до него не дотягивается —
     * отсюда чёрная превьюшка и 00:00 при том, что видео исправно играет.
     * supports_streaming даёт проигрывание без полной загрузки.
     */
    if (method === "sendVideo") {
        if (opts.duration) form.append("duration", String(opts.duration));
        if (opts.width) form.append("width", String(opts.width));
        if (opts.height) form.append("height", String(opts.height));
        form.append("supports_streaming", "true");

        if (opts.thumbPath) {
            const thumb = await streamToBlob(opts.thumbPath);
            form.append("thumbnail", thumb, "thumb.jpg");
        }
    }

    const file = await streamToBlob(opts.path);
    form.append(field, file, basename(opts.path));

    try {
        const res = await fetch(`${API}/${method}`, { method: "POST", body: form });
        const data = (await res.json()) as any;
        if (!data.ok) {
            return { ok: false, error: data.description || `HTTP ${res.status}` };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/** Отправка текста — для сообщений об ошибке. */
export async function sendMessage(chatId: number, text: string, replyTo?: number): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (replyTo) body.reply_parameters = { message_id: replyTo };

    try {
        await fetch(`${API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch (e) {
        console.error("[telegram] Не удалось отправить сообщение:", e);
    }
}

/**
 * Файл читается в память целиком.
 *
 * Это осознанно: FormData в Node принимает Blob, а не поток, и потолок здесь
 * и так 48 МБ (лимит Bot API). При двух параллельных задачах это меньше сотни
 * мегабайт — в лимит контейнера в 2 ГБ укладывается с запасом.
 */
async function streamToBlob(path: string): Promise<Blob> {
    const chunks: Buffer[] = [];
    for await (const chunk of createReadStream(path)) {
        chunks.push(chunk as Buffer);
    }
    return new Blob([Buffer.concat(chunks)]);
}
