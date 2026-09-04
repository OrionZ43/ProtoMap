/**
 * Воркер скачивания.
 *
 * Крутится на сервере Дениса, потому что YouTube и TikTok жёстко режут запросы
 * с дата-центровых IP — а IP Google Cloud среди них самые заблокированные.
 * С обычного провайдерского канала те же ссылки качаются без вопросов.
 *
 * Цикл простой: забрать задачу из Firestore → скачать → отправить в Telegram
 * напрямую → отметить выполненной. Входящих подключений не требует: воркер
 * сам ходит наружу, поэтому живёт за домашним NAT без проброса портов.
 */

import { mkdir } from "node:fs/promises";

import { WORK_DIR, POLL_INTERVAL_MS, HEARTBEAT_INTERVAL_MS, CONCURRENCY } from "./config.js";
import { refreshYtdlp, ytdlpVersion } from "./ytdlp.js";
import { download, cleanup, sweepWorkDir, DownloadError } from "./download.js";
import { sendFile, sendMessage } from "./telegram.js";
import { captionFor } from "./captions.js";
import { shrinkForPhoto, isResizableImage, prepareThumb, PHOTO_MAX_BYTES } from "./image.js";
import {
    claimJob, finishJob, releaseJob, requeueStale, watchPending,
    pendingCount, heartbeat, WORKER_ID, type Job,
} from "./queue.js";

let lastError: string | null = null;
let stopping = false;

/** Задачи, взятые прямо сейчас. Нужны, чтобы вернуть их в очередь при остановке. */
const inFlight = new Set<string>();

/** Секунды с отметки, одной цифрой после запятой. */
const since = (t: number) => ((Date.now() - t) / 1000).toFixed(1);

async function handle(job: Job): Promise<void> {
    const started = Date.now();

    // Сколько задача пролежала в очереди до того, как её взяли. Отделяет
    // задержку доставки (вебхук, Firestore) от нашей собственной работы.
    const queuedFor = job.createdAtMs ? ((started - job.createdAtMs) / 1000).toFixed(1) : "?";
    console.log(`[job ${job.id}] ${job.url} (в очереди ${queuedFor} с)`);

    let file;
    const tDownload = Date.now();
    try {
        file = await download(job.url);
    } catch (e) {
        const msg = e instanceof DownloadError ? e.message : "Внутренняя ошибка";
        if (!(e instanceof DownloadError)) {
            console.error(`[job ${job.id}] Неожиданная ошибка:`, e);
            lastError = e instanceof Error ? e.message : String(e);
        }
        await sendMessage(job.chatId, `Не получилось: ${msg}`, job.messageId);
        await finishJob(job.id, msg);
        return;
    }

    const downloadSec = since(tDownload);
    console.log(`[job ${job.id}] Скачано ${Math.round(file.size / 1024 / 1024)} МБ за ${downloadSec} с`);

    // Картинка крупнее 10 МБ не уйдёт как фото — Telegram откажет. Уменьшаем,
    // чтобы она осталась картинкой в ленте, а не превратилась в файл на
    // скачивание: файлом смысла в боте почти нет, проще открыть ссылку.
    // Не получилось ужать — отправим как есть, sendFile сам свалится в документ.
    let toSend = { path: file.path, size: file.size };
    if (isResizableImage(file.path) && file.size > PHOTO_MAX_BYTES) {
        const shrunk = await shrinkForPhoto(file.path, file.dir, file.size);
        if (shrunk) toSend = shrunk;
        else console.warn(`[job ${job.id}] Ужать не вышло, уйдёт документом`);
    }

    // Обложка от yt-dlp обычно крупнее того, что принимает Telegram,
    // поэтому приводим её к 320 пикселям и JPEG.
    const thumbPath = file.thumbPath
        ? await prepareThumb(file.thumbPath, file.dir).catch(() => undefined)
        : undefined;

    const tUpload = Date.now();
    const sent = await sendFile({
        chatId: job.chatId,
        replyTo: job.messageId,
        path: toSend.path,
        size: toSend.size,
        spoiler: job.spoiler,
        caption: captionFor(file.nsfw),
        duration: file.duration,
        width: file.width,
        height: file.height,
        thumbPath,
    });

    await cleanup(file);

    if (!sent.ok) {
        console.error(`[job ${job.id}] Отправка не удалась: ${sent.error}`);
        lastError = sent.error;
        await sendMessage(job.chatId, `Скачал, но отправить не смог: ${sent.error}`, job.messageId);
        await finishJob(job.id, sent.error);
        return;
    }

    await finishJob(job.id);
    console.log(
        `[job ${job.id}] Готово: скачивание ${downloadSec} с, отправка ${since(tUpload)} с, ` +
        `всего ${since(started)} с`
    );
}

/**
 * Ошибки опроса очереди логируются коротко и без повторов.
 *
 * Цикл крутится раз в несколько секунд, и при постоянной проблеме (например,
 * Firestore ещё строит индекс) полный стек grpc печатался бы бесконечно —
 * это десятки строк каждые четыре секунды, и в них тонет всё остальное.
 * Печатаем одну строку и повторяем не чаще раза в минуту.
 */
let lastPollErrorText = "";
let lastPollErrorAt = 0;

function reportPollError(e: unknown): void {
    const raw = e instanceof Error ? e.message : String(e);
    // Первая строка сообщения — суть; дальше у grpc идут ссылки и стек.
    const text = raw.split("\n")[0].slice(0, 200);

    const now = Date.now();
    if (text === lastPollErrorText && now - lastPollErrorAt < 60_000) return;

    lastPollErrorText = text;
    lastPollErrorAt = now;
    lastError = text;
    console.error(`[worker] Опрос очереди: ${text}`);
}

async function tick(): Promise<void> {
    if (stopping || inFlight.size >= CONCURRENCY) return;

    const job = await claimJob();
    if (!job) return;

    inFlight.add(job.id);
    handle(job)
        .catch((e) => {
            console.error(`[job ${job.id}] Провалилась целиком:`, e);
            lastError = e instanceof Error ? e.message : String(e);
            return finishJob(job.id, "Внутренняя ошибка").catch(() => {});
        })
        .finally(() => { inFlight.delete(job.id); });
}

async function main(): Promise<void> {
    console.log(`[worker] Запуск, id=${WORKER_ID}`);

    await mkdir(WORK_DIR, { recursive: true }).catch(() => {});

    const swept = await sweepWorkDir().catch(() => 0);
    if (swept) console.log(`[worker] Убрано каталогов от прошлых запусков: ${swept}`);

    // Версия из образа — она есть сразу и с curl-cffi. Обновление до свежей
    // пойдёт фоном ниже.
    let version = await ytdlpVersion().catch(() => "неизвестна");
    console.log(`[worker] yt-dlp ${version}, параллельно задач: ${CONCURRENCY}`);

    // Пульс сразу, чтобы /dlstatus не показывал «лежит» первую минуту
    await heartbeat({ ytdlpVersion: version, pending: await pendingCount().catch(() => -1) })
        .catch(reportPollError);

    setInterval(() => {
        void (async () => {
            try {
                const requeued = await requeueStale();
                if (requeued) console.warn(`[worker] Возвращено в очередь зависших задач: ${requeued}`);

                await heartbeat({
                    ytdlpVersion: version,
                    pending: await pendingCount(),
                    lastError,
                });
            } catch (e) {
                // Та же причёска, что и у опроса: тут крутится минутный цикл,
                // и при затяжной проблеме полный стек grpc забьёт весь лог.
                reportPollError(e);
            }
        })();
    }, HEARTBEAT_INTERVAL_MS);

    /**
     * Обновление yt-dlp — фоном, НЕ блокируя приём задач.
     *
     * Раньше воркер ждал его окончания перед стартом, и это было мёртвое окно
     * в несколько минут при каждом перезапуске: `curl_cffi` компилируется из
     * исходников. Ссылки в это время просто копились в очереди без единого
     * признака жизни. Версия из образа рабочая и с curl-cffi, так что ждать
     * нечего — обновление лишь освежает.
     */
    void refreshYtdlp()
        .then(async () => { version = await ytdlpVersion().catch(() => version); })
        .catch(() => {});

    // Мгновенная реакция на новую задачу
    watchPending(() => { void tick().catch(reportPollError); });

    // Редкий опрос как подстраховка: подписка может отвалиться по сети и не
    // восстановиться, и тогда очередь встанет молча.
    setInterval(() => {
        void tick().catch(reportPollError);
    }, POLL_INTERVAL_MS);

    // И один прогон сразу — вдруг в очереди уже что-то лежит с прошлого раза
    void tick().catch(reportPollError);
}

// Аккуратная остановка: docker stop шлёт SIGTERM. Без обработчика контейнер
// умирает мгновенно, и взятая задача зависает в processing до срабатывания
// requeueStale — то есть на десять минут.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
        console.log(`[worker] ${sig}, задач в работе: ${inFlight.size}`);
        stopping = true;

        const done = () => process.exit(0);

        const wait = setInterval(() => {
            if (inFlight.size === 0) { clearInterval(wait); done(); }
        }, 300);

        // Если доработать не успеваем — возвращаем задачи в очередь, чтобы их
        // подхватили сразу после перезапуска, а не через десять минут.
        setTimeout(() => {
            clearInterval(wait);
            const ids = [...inFlight];
            if (ids.length === 0) return done();

            console.warn(`[worker] Не успеваю, возвращаю в очередь: ${ids.length}`);
            Promise.allSettled(ids.map(releaseJob)).then(done, done);
        }, 20_000).unref();
    });
}

main().catch((e) => {
    console.error("[worker] Не удалось запуститься:", e);
    process.exit(1);
});
