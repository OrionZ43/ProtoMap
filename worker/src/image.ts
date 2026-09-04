/**
 * Подгонка картинки под ограничения Telegram.
 *
 * У `sendPhoto` два лимита, о которых узнаёшь только по ошибке:
 *   - размер файла не больше 10 МБ (у видео и документов — 50);
 *   - сумма сторон не больше 10000 пикселей.
 *
 * Отправлять крупную картинку документом можно, но тогда она не показывается
 * превьюшкой, и смысла в боте почти не остаётся — проще открыть ссылку.
 * Поэтому уменьшаем: для картинки это доли секунды, в отличие от видео,
 * которое пришлось бы перекодировать минутами.
 */

import { stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";

import { run } from "./ytdlp.js";

/** Лимит `sendPhoto`. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Ступени уменьшения: длинная сторона и качество JPEG. */
const STEPS: { side: number; q: number }[] = [
    { side: 2560, q: 3 },
    { side: 1920, q: 4 },
    { side: 1280, q: 6 },
];

const RESIZABLE = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function isResizableImage(path: string): boolean {
    return RESIZABLE.has(extname(path).toLowerCase());
}

/**
 * Уменьшает картинку, пока она не влезет в лимит.
 *
 * Возвращает путь к новому файлу либо `null`, если ужать не вышло — тогда
 * вызывающий сам решает, что делать (у нас — отправить документом).
 */
export async function shrinkForPhoto(
    path: string,
    dir: string,
    size: number
): Promise<{ path: string; size: number } | null> {
    if (size <= PHOTO_MAX_BYTES) return { path, size };
    if (!isResizableImage(path)) return null;

    for (const [i, step] of STEPS.entries()) {
        const out = join(dir, `shrink${i}_${basename(path, extname(path))}.jpg`);

        // scale с -2 сохраняет пропорции и делает сторону чётной; условие
        // min(...) не даёт увеличить картинку, если она и так меньше.
        const { code } = await run(
            "ffmpeg",
            [
                "-y", "-loglevel", "error",
                "-i", path,
                "-vf", `scale='min(${step.side},iw)':-2`,
                "-q:v", String(step.q),
                out,
            ],
            60_000
        ).catch(() => ({ code: -1, stdout: "", stderr: "" }));

        if (code !== 0) continue;

        const { size: newSize } = await stat(out).catch(() => ({ size: Infinity }));
        if (newSize <= PHOTO_MAX_BYTES) {
            console.log(
                `[image] Ужато ${Math.round(size / 1024 / 1024)} → ${Math.round(newSize / 1024 / 1024)} МБ ` +
                `(сторона ${step.side})`
            );
            return { path: out, size: newSize };
        }
    }

    return null;
}

/**
 * Готовит обложку под требования Telegram к `thumbnail`.
 *
 * Требования жёсткие и в документации спрятаны: JPEG, не больше 200 КБ,
 * сторона не больше 320 пикселей. Обложка от yt-dlp обычно крупнее и часто
 * в webp — в таком виде Telegram её молча игнорирует, и превью остаётся пустым.
 */
export async function prepareThumb(
    src: string,
    dir: string
): Promise<string | undefined> {
    const out = join(dir, "tgthumb.jpg");

    const { code } = await run(
        "ffmpeg",
        [
            "-y", "-loglevel", "error",
            "-i", src,
            "-vf", "scale='min(320,iw)':-2",
            "-q:v", "5",
            out,
        ],
        30_000
    ).catch(() => ({ code: -1, stdout: "", stderr: "" }));

    if (code !== 0) return undefined;

    const { size } = await stat(out).catch(() => ({ size: Infinity }));
    if (size > 200 * 1024) return undefined;

    return out;
}
