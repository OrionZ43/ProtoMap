/**
 * Скачивание медиа по ссылке.
 *
 * Два пути: общий через yt-dlp (YouTube, TikTok, Twitter и ещё сотни сайтов) и
 * отдельный для e621 — его yt-dlp не знает, зато у него есть простой JSON API.
 */

import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    WORK_DIR,
    MAX_UPLOAD_BYTES,
    DOWNLOAD_TIMEOUT_MS,
    E621_USER_AGENT,
} from "./config.js";
import { runYtdlp } from "./ytdlp.js";
import { checkUrl } from "./urlcheck.js";

export type Downloaded = {
    path: string;
    /** Каталог, который надо удалить после отправки. */
    dir: string;
    size: number;
    /** Взрослый источник — от этого зависит набор подписей. */
    nsfw: boolean;
    /**
     * Метаданные для Telegram.
     *
     * Без них видео приходит с чёрной превьюшкой и длительностью 00:00:
     * Telegram пытается вытащить их из файла сам, но у склеенного mp4
     * метаданные лежат в конце, и до них он не дотягивается. При открытии
     * плеер дочитывает файл целиком, поэтому воспроизведение работает —
     * отсюда путаное «превью сломано, а видео играет».
     */
    duration?: number;
    width?: number;
    height?: number;
    /** Обложка, подготовленная под требования Telegram. */
    thumbPath?: string;
};

export class DownloadError extends Error {}

const E621_POST = /^https?:\/\/(?:www\.)?e621\.net\/posts\/(\d+)/i;

/**
 * Короткая ссылка e621 — то, чем реально делятся.
 * Ведёт редиректом на обычный /posts/NNNNN.
 */
const E621_SHORT = /^https?:\/\/(?:www\.)?e621\.net\/p\/[a-z0-9]+/i;

export function isE621(url: string): boolean {
    return E621_POST.test(url) || E621_SHORT.test(url);
}

/**
 * Приводит короткую ссылку к обычной.
 *
 * Раньше `/p/xxxxx` не распознавался как e621 и уходил в yt-dlp: тот по
 * счастливой случайности вытаскивал видео своим generic-экстрактором, а на
 * картинках и гифках падал с «Unsupported URL». Отсюда выглядело как
 * «видео качает, картинки нет».
 */
async function resolveE621(url: string): Promise<string> {
    if (E621_POST.test(url)) return url;

    const res = await fetch(url, {
        headers: { "User-Agent": E621_USER_AGENT },
        redirect: "follow",
    });
    if (!E621_POST.test(res.url)) {
        throw new DownloadError("Короткая ссылка e621 никуда не привела");
    }
    return res.url;
}

async function makeWorkDir(): Promise<string> {
    // Каталог создаётся в WORK_DIR (на HDD), а не в /tmp: /tmp смонтирован как
    // tmpfs в оперативной памяти, и видео туда класть нельзя — съест RAM.
    try {
        return await mkdtemp(join(WORK_DIR, "dl-"));
    } catch {
        return await mkdtemp(join(tmpdir(), "dl-"));
    }
}

/** Единственный файл в каталоге — то, что скачалось. */
async function onlyFile(dir: string): Promise<string> {
    const names = await readdir(dir);
    const files = names.filter((n) => !n.endsWith(".part") && !n.endsWith(".ytdl"));
    if (files.length === 0) throw new DownloadError("Файл не появился");
    return join(dir, files[0]);
}

/** Служебные файлы, которые yt-dlp кладёт рядом с медиа. */
const SIDECAR = /\.(info\.json|jpg|jpeg|png|webp|part|ytdl)$/i;

/** Собственно медиафайл среди служебных. */
async function mediaFile(dir: string): Promise<string> {
    const names = await readdir(dir);
    const media = names.filter((n) => !SIDECAR.test(n));
    if (media.length === 0) throw new DownloadError("Файл не появился");
    return join(dir, media[0]);
}

/** Обложка, которую выгрузил yt-dlp. */
async function sidecarThumb(dir: string): Promise<string | undefined> {
    const names = await readdir(dir);
    const thumb = names.find((n) => /\.(jpg|jpeg|png|webp)$/i.test(n));
    return thumb ? join(dir, thumb) : undefined;
}

// ─── e621 ────────────────────────────────────────────────────────────────────

async function downloadE621(shortOrFull: string): Promise<Downloaded> {
    const url = await resolveE621(shortOrFull);
    const id = url.match(E621_POST)![1];

    const res = await fetch(`https://e621.net/posts/${id}.json`, {
        headers: { "User-Agent": E621_USER_AGENT },
    });
    if (!res.ok) {
        throw new DownloadError(`e621 ответил HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const fileUrl: string | undefined = data?.post?.file?.url;
    const size: number | undefined = data?.post?.file?.size;

    if (!fileUrl) {
        // Бывает у постов под глобальной блокировкой: пост существует,
        // но файл через API не отдаётся.
        throw new DownloadError("e621 не отдал ссылку на файл");
    }
    if (size && size > MAX_UPLOAD_BYTES) {
        throw new DownloadError(`Файл ${Math.round(size / 1024 / 1024)} МБ — больше лимита`);
    }

    const dir = await makeWorkDir();
    const ext = fileUrl.split(".").pop() || "bin";
    const path = join(dir, `e621_${id}.${ext}`);

    const fileRes = await fetch(fileUrl, { headers: { "User-Agent": E621_USER_AGENT } });
    if (!fileRes.ok || !fileRes.body) {
        await rm(dir, { recursive: true, force: true });
        throw new DownloadError(`Не удалось скачать файл: HTTP ${fileRes.status}`);
    }

    await pipeline(Readable.fromWeb(fileRes.body as any), createWriteStream(path));
    const { size: actual } = await stat(path);

    if (actual > MAX_UPLOAD_BYTES) {
        await rm(dir, { recursive: true, force: true });
        throw new DownloadError("Файл больше лимита Telegram");
    }

    return { path, dir, size: actual, nsfw: true };
}

// ─── yt-dlp ──────────────────────────────────────────────────────────────────

async function downloadViaYtdlp(url: string): Promise<Downloaded> {
    const dir = await makeWorkDir();

    /** Потолок в мегабайтах — в таком виде его понимает yt-dlp. */
    const cap = Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024);

    /**
     * Подбор формата.
     *
     * Не перекодируем принципиально: у сервера i7 шестого поколения без
     * видеокарты, и сжатие ролика под лимит заняло бы минуты. Вместо этого
     * просим yt-dlp выбрать вариант, который в лимит уже влезает, а если такого
     * нет — честно отваливаемся с понятной ошибкой.
     */
    const args = [
        url,
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "--restrict-filenames",
        "--max-filesize", String(MAX_UPLOAD_BYTES),

        // Из того, что влезает в лимит, берём самое крупное — то есть лучшее
        // доступное качество. Качество не режем: ограничение здесь только одно,
        // и оно чужое — потолок Telegram на загрузку файла ботом.
        "-S", `filesize:${cap}M`,

        /**
         * Отбор формата.
         *
         * ⚠️ Здесь НЕ должно быть фильтра по `height`. Ролики из TikTok и
         * Shorts вертикальные: у формата 576x1024 высота — это 1024, длинная
         * сторона. Условие `height<=720` отбраковывало вообще все нормальные
         * варианты, отбор сваливался на запасной «просто лучшее», и вместо
         * доступных 26 МБ выбирались 59 — то есть больше лимита Telegram.
         *
         * Ограничение по размеру — единственное, и оно чужое: 50 МБ это
         * потолок Bot API на загрузку файла ботом. Внутри него берём лучшее.
         * Первыми идут готовые склеенные
         * файлы: они качаются одним куском и не требуют прогона через ffmpeg.
         * Последняя ветка — без ограничений, на случай когда размер заранее
         * неизвестен (так бывает у YouTube); там страхует --max-filesize.
         */
        "-f", [
            `b[filesize<${cap}M]`,
            `b[filesize_approx<${cap}M]`,
            `bv*[filesize<${cap}M]+ba`,
            `bv*+ba`,
            `b`,
        ].join("/"),
        // Склейка видео и звука — ремукс в mp4, без пережатия
        "--merge-output-format", "mp4",

        // Метаданные и обложка — ради нормального превью в Telegram.
        // Без них приходит чёрный квадрат с длительностью 00:00.
        "--write-info-json",
        "--write-thumbnail",
        "--convert-thumbnails", "jpg",

        // faststart переносит заголовок mp4 в начало файла. Без него плеер
        // (и Telegram) не может прочитать длительность и размеры, не скачав
        // файл целиком — это и есть причина пустой превьюшки.
        // Только перекладывание байтов, не перекодирование.
        "--postprocessor-args", "ffmpeg:-movflags +faststart",

        "-o", join(dir, "%(title).80s.%(ext)s"),
    ];

    const { code, stderr } = await runYtdlp(args, DOWNLOAD_TIMEOUT_MS);

    if (code !== 0) {
        // Фото-пост TikTok: экстрактор понимает только /video/, а короткая
        // ссылка разворачивается в /photo/ и падает с Unsupported URL.
        // Развёрнутый адрес удобно лежит прямо в тексте ошибки.
        const photoUrl = stderr.match(/Unsupported URL: (https:\/\/[^\s]*tiktok\.com[^\s]*\/photo\/[^\s]+)/)?.[1];
        if (photoUrl) {
            await rm(dir, { recursive: true, force: true });
            return downloadTiktokPhoto(photoUrl);
        }

        await rm(dir, { recursive: true, force: true });
        throw new DownloadError(explainYtdlpError(stderr));
    }

    const path = await mediaFile(dir).catch(async (e) => {
        await rm(dir, { recursive: true, force: true });

        // yt-dlp прерывает скачивание по --max-filesize, но выходит с кодом 0:
        // обложку и метаданные он к этому моменту уже записал. Без этой
        // проверки пользователь получал бессмысленное «Файл не появился»
        // вместо понятного «видео слишком большое».
        if (/larger than max-filesize/i.test(stderr)) {
            throw new DownloadError("Видео слишком большое для Telegram (лимит 50 МБ)");
        }
        throw e;
    });

    const { size } = await stat(path);
    if (size > MAX_UPLOAD_BYTES) {
        await rm(dir, { recursive: true, force: true });
        throw new DownloadError("Файл больше лимита Telegram");
    }

    const meta = await readInfoJson(dir);
    const thumbPath = await sidecarThumb(dir);

    return { path, dir, size, nsfw: false, thumbPath, ...meta };
}

/** Длительность и размеры кадра из info.json, который выгрузил yt-dlp. */
async function readInfoJson(
    dir: string
): Promise<{ duration?: number; width?: number; height?: number }> {
    try {
        const names = await readdir(dir);
        const name = names.find((n) => n.endsWith(".info.json"));
        if (!name) return {};

        const raw = await readFile(join(dir, name), "utf8");
        const j = JSON.parse(raw);

        return {
            duration: typeof j.duration === "number" ? Math.round(j.duration) : undefined,
            width: typeof j.width === "number" ? j.width : undefined,
            height: typeof j.height === "number" ? j.height : undefined,
        };
    } catch {
        // Без метаданных превью будет хуже, но отправка не сорвётся
        return {};
    }
}

/**
 * Фото-пост TikTok.
 *
 * Устроено неудобно: экстрактор yt-dlp сопоставляется только с адресами
 * `/video/`, а фото-посты живут по `/photo/` — оттуда `Unsupported URL`.
 * Подмена `photo` на `video` заставляет экстрактор отработать, но он считает
 * такой пост музыкальным треком и отдаёт mp3 — фоновую музыку вместо картинок.
 *
 * Сами изображения он выставляет только миниатюрами. Поэтому качаем обложку.
 *
 * ⚠️ Ограничение: у слайдшоу из нескольких картинок достаётся только первая.
 * Полный набор лежит в `image_post_info` внутреннего API TikTok, которое
 * yt-dlp не разбирает; ходить туда самим — значит подписаться на постоянную
 * починку, TikTok такие обращения активно ломает.
 */
async function downloadTiktokPhoto(photoUrl: string): Promise<Downloaded> {
    const asVideo = photoUrl.replace("/photo/", "/video/");
    const dir = await makeWorkDir();

    const { code, stderr } = await runYtdlp(
        [
            asVideo,
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "--skip-download",
            "--write-thumbnail",
            "--convert-thumbnails", "jpg",
            "-o", join(dir, "tiktok_photo.%(ext)s"),
        ],
        DOWNLOAD_TIMEOUT_MS
    );

    if (code !== 0) {
        await rm(dir, { recursive: true, force: true });
        throw new DownloadError(explainYtdlpError(stderr));
    }

    const path = await onlyFile(dir).catch(async (e) => {
        await rm(dir, { recursive: true, force: true });
        throw e;
    });

    const { size } = await stat(path);
    console.log("[download] Фото-пост TikTok: забрана обложка");
    return { path, dir, size, nsfw: false };
}

/**
 * Превращает простыню от yt-dlp в одну человеческую фразу.
 * Целиком stderr в чат слать нельзя — там бывают десятки килобайт.
 */
function explainYtdlpError(stderr: string): string {
    const s = stderr.toLowerCase();

    if (s.includes("file is larger than max-filesize")) return "Видео слишком большое для Telegram";
    // Раньше здесь было s.includes("bot") — слишком широко: слово встречается
    // в адресах и в посторонних сообщениях, и любая ошибка превращалась
    // в «подтвердите, что вы не бот».
    if (s.includes("sign in to confirm") || s.includes("confirm you're not a bot")) {
        return "Источник требует подтверждения, что мы не бот";
    }
    if (s.includes("private video") || s.includes("login required")) return "Видео приватное";
    if (s.includes("video unavailable") || s.includes("not available")) return "Видео недоступно";
    if (s.includes("unsupported url")) return "Не умею качать с этого сайта";
    if (s.includes("age") && s.includes("restricted")) return "Возрастное ограничение на источнике";
    if (s.includes("http error 404")) return "Страница не найдена";

    // Площадка поменяла выдачу, и экстрактор её не понял. Пользователю ссылка
    // на трекер yt-dlp не нужна — ему нужно знать, что дело не в нём.
    if (s.includes("unexpected response") || s.includes("unable to extract")) {
        return "Площадка поменяла выдачу, скачать не вышло. Обычно чинится само в течение дня";
    }

    const line = stderr.split("\n").find((l) => l.includes("ERROR"))?.trim();
    return line ? line.slice(0, 200) : "Не удалось скачать";
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

export async function download(url: string): Promise<Downloaded> {
    // Проверяем здесь, а не доверяем очереди. Задачу ставит бот и он тоже
    // фильтрует, но запрос из домашней сети делает именно этот процесс —
    // значит и решать, куда ходить, должен он. См. urlcheck.ts.
    const verdict = checkUrl(url);
    if (!verdict.ok) {
        throw new DownloadError(verdict.reason);
    }

    return isE621(verdict.url) ? downloadE621(verdict.url) : downloadViaYtdlp(verdict.url);
}

export async function cleanup(d: Downloaded): Promise<void> {
    await rm(d.dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Уборка мусора в рабочей папке при старте.
 *
 * Каталоги задач удаляются после отправки, но если контейнер убили на середине
 * (перезапуск, обновление, падение), они остаются. Плюс сам yt-dlp собран
 * PyInstaller'ом и распаковывается в `_MEI*` — эти каталоги он чистит за собой
 * не всегда. По одному это мелочь, за год на диске сервера — нет.
 *
 * Возраст важен: параллельно может работать вторая задача, и её каталог сносить
 * нельзя. Час — заведомо больше самой долгой загрузки (у неё таймаут 5 минут).
 */
export async function sweepWorkDir(): Promise<number> {
    const HOUR = 60 * 60 * 1000;
    let removed = 0;

    let names: string[];
    try {
        names = await readdir(WORK_DIR);
    } catch {
        return 0;
    }

    for (const name of names) {
        if (!name.startsWith("dl-") && !name.startsWith("_MEI")) continue;

        const path = join(WORK_DIR, name);
        try {
            const info = await stat(path);
            if (Date.now() - info.mtimeMs < HOUR) continue;
            await rm(path, { recursive: true, force: true });
            removed++;
        } catch {
            // Каталог мог исчезнуть сам — не повод падать
        }
    }

    return removed;
}
