/**
 * Проверка ссылки перед скачиванием.
 *
 * Дублирует список источников из бота намеренно. Бот — это то, что ставит
 * задачу, а воркер — то, что реально делает запрос из домашней сети Дениса.
 * Проверять должен тот, кто исполняет: если в очередь когда-нибудь попадёт
 * мусор (ошибка в коде, кривая миграция, компрометация функции), воркер обязан
 * отказаться сам, а не доверять источнику задачи.
 *
 * Главное, от чего защищаемся, — SSRF. Ссылка приходит из чата, а запрос
 * уходит из домашней сети: без проверки достаточно прислать
 * `http://192.168.1.1/...`, чтобы бот сходил на роутер Дениса и принёс ответ
 * в Telegram.
 */

import { isIP } from "node:net";

const ALLOWED_HOSTS = [
    /(^|\.)youtube\.com$/,
    /(^|\.)youtu\.be$/,
    /(^|\.)tiktok\.com$/,
    /(^|\.)twitter\.com$/,
    /(^|\.)x\.com$/,
    /(^|\.)instagram\.com$/,
    /(^|\.)reddit\.com$/,
    /(^|\.)twitch\.tv$/,
    /(^|\.)e621\.net$/,
    /(^|\.)e926\.net$/,
    /(^|\.)rule34\.xxx$/,
];

/** Диапазоны, куда ходить нельзя ни при каких обстоятельствах. */
function isPrivateAddress(host: string): boolean {
    const v = isIP(host);
    if (v === 0) return false;

    if (v === 6) {
        const h = host.toLowerCase();
        return (
            h === "::1" ||          // loopback
            h.startsWith("fc") ||   // unique local
            h.startsWith("fd") ||
            h.startsWith("fe80")    // link-local
        );
    }

    const [a, b] = host.split(".").map(Number);
    return (
        a === 10 ||                          // 10.0.0.0/8
        a === 127 ||                         // loopback
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) ||          // 192.168.0.0/16
        (a === 169 && b === 254) ||          // link-local, сюда же метаданные облаков
        a === 0
    );
}

export type UrlVerdict = { ok: true; url: string } | { ok: false; reason: string };

export function checkUrl(raw: string): UrlVerdict {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return { ok: false, reason: "Не похоже на ссылку" };
    }

    // Только http(s). Иначе остаются file://, ftp://, а у yt-dlp есть и свои
    // схемы — всё это возможность прочитать что-нибудь локальное.
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, reason: `Схема ${u.protocol} не поддерживается` };
    }

    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (isPrivateAddress(host)) {
        return { ok: false, reason: "Внутренние адреса не качаю" };
    }
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
        return { ok: false, reason: "Внутренние адреса не качаю" };
    }
    if (isIP(host) !== 0) {
        // Даже публичный IP-литерал: белый список — по именам, а адрес в обход
        // имени означает попытку его обойти.
        return { ok: false, reason: "Ссылки по IP не качаю" };
    }
    if (!ALLOWED_HOSTS.some((re) => re.test(host))) {
        return { ok: false, reason: `Источник ${host} не в списке разрешённых` };
    }

    return { ok: true, url: u.toString() };
}
