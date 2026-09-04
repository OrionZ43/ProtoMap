/**
 * Запуск yt-dlp и поддержание его в свежем виде.
 *
 * ⚠️ Ставим yt-dlp пакетом Python, а НЕ одним бинарником с GitHub.
 * Это не вкусовщина: тот бинарник собран PyInstaller'ом и при каждом запуске
 * распаковывает себя во временный каталог. Замерено в этом контейнере —
 * **4.9 секунды на запуск**, каждый раз. При скачивании короткого ролика,
 * которое целиком занимало десять секунд, половина уходила ровно на это.
 * Пакет стартует за доли секунды.
 *
 * Свежесть важна: YouTube регулярно меняет отдачу, и yt-dlp ломается —
 * релизы выходят чуть ли не еженедельно. Версия из образа через месяц
 * перестанет качать. Поэтому при старте пробуем поставить свежую в том,
 * а версия из образа остаётся запасной.
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

import { YTDLP_DIR, WORK_DIR, DOWNLOAD_TIMEOUT_MS } from "./config.js";

/** Куда ставится обновлённый пакет. Том, переживающий пересоздание контейнера. */
const PKG_DIR = YTDLP_DIR;

/** Ставим ли свежую версию из тома или работаем на версии из образа. */
let useVolume = false;

export type RunResult = { code: number; stdout: string; stderr: string };

/**
 * Обновляет yt-dlp в томе.
 *
 * Неудача не фатальна: без сети или при недоступном PyPI работаем на версии
 * из образа — хуже, чем свежая, но лучше, чем никак.
 */
export async function refreshYtdlp(): Promise<void> {
    try {
        await mkdir(PKG_DIR, { recursive: true });

        /**
         * `--pre` — ночные сборки, и это осознанно.
         *
         * Площадки ломают экстракторы постоянно: TikTok менял выдачу прямо во
         * время разработки, и стабильный релиз отвечал
         * «Unexpected response from webpage request». В ночных правки
         * появляются в тот же день, в стабильных — через недели.
         * Для чат-бота сломанный экстрактор хуже, чем чуть менее обкатанная
         * версия, тем более что версия из образа остаётся запасной.
         */
        const { code, stderr } = await run(
            "python3",
            [
                "-m", "pip", "install",
                "--upgrade", "--pre", "--no-cache-dir",
                // Только готовые колёса: сборка curl_cffi из исходников
                // занимает минуты, а выигрыш от неё нулевой.
                "--prefer-binary",
                "--target", PKG_DIR,
                // curl-cffi — не опция: без него TikTok отвечает мусором,
                // потому что проверяет TLS-отпечаток. См. комментарий
                // в Dockerfile.
                "yt-dlp[default,curl-cffi]",
            ],
            180_000
        );

        if (code === 0) {
            useVolume = true;
            console.log(`[ytdlp] Обновлён, версия ${await ytdlpVersion()}`);
        } else {
            console.warn(
                `[ytdlp] Обновление не удалось, работаем на версии из образа: ${stderr.split("\n")[0]}`
            );
        }
    } catch (e) {
        console.warn("[ytdlp] Обновление не удалось, работаем на версии из образа:", e);
    }
}

export async function ytdlpVersion(): Promise<string> {
    const { stdout } = await runYtdlp(["--version"], 20_000);
    return stdout.trim();
}

/** Запуск yt-dlp с нужным окружением. */
export function runYtdlp(args: string[], timeoutMs = DOWNLOAD_TIMEOUT_MS): Promise<RunResult> {
    return run("python3", ["-m", "yt_dlp", ...args], timeoutMs, useVolume ? PKG_DIR : undefined);
}

/**
 * Запуск процесса с жёстким таймаутом.
 *
 * Таймаут обязателен: yt-dlp умеет вставать намертво на медленном источнике,
 * а зависший процесс держит слот очереди до перезапуска контейнера.
 */
export function run(
    cmd: string,
    args: string[],
    timeoutMs = DOWNLOAD_TIMEOUT_MS,
    pythonPath?: string
): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        /**
         * Окружение подчищено намеренно.
         *
         * yt-dlp — большая программа, разбирающая недоверенный ввод из интернета;
         * это ровно тот класс кода, который ломают. Наследовать ей process.env
         * значит отдать при удачном эксплойте и токен бота, и путь к ключу
         * Firebase. Ей нужны только PATH, HOME и TMPDIR.
         */
        const env: NodeJS.ProcessEnv = {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            HOME: WORK_DIR,
            TMPDIR: WORK_DIR,
            LC_ALL: "C.UTF-8",
        };
        if (pythonPath) env.PYTHONPATH = pythonPath;

        const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGKILL");
            reject(new Error(`Таймаут ${Math.round(timeoutMs / 1000)} с: ${cmd}`));
        }, timeoutMs);

        child.stdout.on("data", (d) => { stdout += d.toString(); });
        // stderr держим ограниченным: yt-dlp на ошибке может насыпать мегабайты
        child.stderr.on("data", (d) => {
            if (stderr.length < 64_000) stderr += d.toString();
        });

        child.on("error", (e) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(e);
        });

        child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ code: code ?? -1, stdout, stderr });
        });
    });
}
