/**
 * Скачивание медиа по ссылкам.
 *
 * Бот сам ничего не качает — он только кладёт задачу в очередь `tg_download_queue`.
 * Забирает её воркер на сервере Дениса (`worker/` в этом репозитории).
 *
 * Почему не в Cloud Functions: yt-dlp питоновский, а главное — YouTube и TikTok
 * жёстко режут запросы с дата-центровых IP, и адреса Google Cloud среди них
 * самые заблокированные. С обычного провайдерского канала те же ссылки
 * качаются без вопросов.
 */

import { Telegraf } from "telegraf";
import { db } from "../core/bot";
import { hasFeature } from "../core/registry";

/**
 * Откуда качаем автоматически.
 *
 * Список, а не «любая ссылка» намеренно: иначе бот будет дёргаться на каждую
 * ссылку в чате, включая ссылки друг на друга и на документацию.
 */
const SFW_HOSTS = [
    /(^|\.)youtube\.com$/,
    /(^|\.)youtu\.be$/,
    /(^|\.)tiktok\.com$/,
    /(^|\.)twitter\.com$/,
    /(^|\.)x\.com$/,
    /(^|\.)instagram\.com$/,
    /(^|\.)reddit\.com$/,
    /(^|\.)twitch\.tv$/,
];

/**
 * Источники со взрослым контентом.
 *
 * Отделены от остальных не из брезгливости: в чате ProtoMap, по словам Ориона,
 * почти все младше 18, и там же действует Соглашение с разделом о безопасности
 * детей. Поэтому такие ссылки качаются только в чатах с возможностью
 * `download_nsfw` — то есть в личном.
 */
const NSFW_HOSTS = [
    /(^|\.)e621\.net$/,
    /(^|\.)e926\.net$/,
    /(^|\.)rule34\.xxx$/,
];

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

type Match = { url: string; nsfw: boolean };

function classify(raw: string): Match | null {
    let host: string;
    try {
        host = new URL(raw).hostname.toLowerCase();
    } catch {
        return null;
    }

    if (NSFW_HOSTS.some((re) => re.test(host))) return { url: raw, nsfw: true };
    if (SFW_HOSTS.some((re) => re.test(host))) return { url: raw, nsfw: false };
    return null;
}

/** Первая поддерживаемая ссылка в тексте. Больше одной за раз не берём. */
function findSupported(text: string): Match | null {
    for (const raw of text.match(URL_RE) ?? []) {
        const m = classify(raw.replace(/[.,;)]+$/, ""));
        if (m) return m;
    }
    return null;
}

async function enqueue(opts: {
    url: string;
    chatId: number;
    messageId: number;
    userId: number;
    spoiler: boolean;
}): Promise<void> {
    await db.collection("tg_download_queue").add({
        status: "pending",
        url: opts.url,
        chatId: opts.chatId,
        messageId: opts.messageId,
        requestedBy: opts.userId,
        spoiler: opts.spoiler,
        createdAt: new Date(),
    });
}

/** Не протух ли пульс воркера. Две минуты при интервале в минуту — с запасом. */
const HEARTBEAT_STALE_MS = 2 * 60 * 1000;

export function register(bot: Telegraf): void {
    /**
     * `/spoiler <ссылка>` — то же скачивание, но файл уйдёт под спойлером.
     * Отдельной командой, а не флагом в тексте: так понятнее и не ломается,
     * когда ссылку присылают без подписи.
     */
    bot.command("spoiler", async (ctx) => {
        if (!hasFeature(ctx.chat?.id, "download")) return;

        const text = (ctx.message as any)?.text ?? "";
        const found = findSupported(text);

        if (!found) {
            await ctx.reply("Дай ссылку: /spoiler https://...");
            return;
        }
        if (found.nsfw && !hasFeature(ctx.chat?.id, "download_nsfw")) {
            await ctx.reply("Этот источник в этом чате не качаю.");
            return;
        }

        await enqueue({
            url: found.url,
            chatId: ctx.chat!.id,
            messageId: ctx.message!.message_id,
            userId: ctx.from!.id,
            spoiler: true,
        });
    });

    /** Жив ли воркер. Без этого его смерть замечают через неделю. */
    bot.command("dlstatus", async (ctx) => {
        if (!hasFeature(ctx.chat?.id, "download")) return;

        const snap = await db.collection("system").doc("downloader_status").get();
        if (!snap.exists) {
            await ctx.reply("Качалка ни разу не выходила на связь.");
            return;
        }

        const d = snap.data()!;
        const updated = d.updatedAt?.toMillis?.() ?? 0;
        const ageSec = Math.round((Date.now() - updated) / 1000);
        const alive = Date.now() - updated < HEARTBEAT_STALE_MS;

        await ctx.reply(
            [
                alive ? "Качалка на связи." : "Качалка НЕ отвечает.",
                `Последний пульс: ${ageSec} с назад`,
                `yt-dlp: ${d.ytdlpVersion ?? "неизвестно"}`,
                `В очереди: ${d.pending ?? "?"}`,
                d.lastError ? `Последняя ошибка: ${d.lastError}` : null,
            ].filter(Boolean).join("\n")
        );
    });

    /**
     * Автоматическое распознавание ссылок.
     *
     * next() вызывается всегда: сообщение со ссылкой может одновременно
     * содержать слово-триггер, и обрывать цепочку здесь нельзя.
     */
    bot.on("text", async (ctx, next) => {
        if (!hasFeature(ctx.chat?.id, "download")) return next();

        const text = ctx.message.text;
        if (text.startsWith("/")) return next();

        const found = findSupported(text);
        if (!found) return next();
        if (found.nsfw && !hasFeature(ctx.chat?.id, "download_nsfw")) return next();

        try {
            await enqueue({
                url: found.url,
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
                userId: ctx.from.id,
                // Взрослые источники всегда уходят под спойлером — команду
                // /spoiler для них звать не надо. Она остаётся для обычных
                // площадок, где спойлер нужен по настроению.
                spoiler: found.nsfw,
            });
        } catch (e) {
            console.error("[DOWNLOAD] Не удалось поставить задачу:", e);
        }

        return next();
    });
}
