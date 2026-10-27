/**
 * Долгая память бота о людях: короткое ДОСЬЕ ФАКТАМИ (кто он, интересы, как
 * относится к боту), которое модель сама заполняет после разговоров. Тон ответа
 * идёт от того, как человек общался, — с добрыми теплее, с грубыми холоднее.
 *
 * Только «Гарем» (возможность ask). Хранится по Telegram id: telegram_rep/{id}.
 * Здесь НЕ храним переписку и имя — id достаточно, а поля заполняет модель.
 *
 * Два решения после жалоб Ориона на «цепляние» (25.10.2026):
 *   1. ФАКТЫ-ПОЛЯ, а не свободная проза. У прозы модель упихивала туда бегущие
 *      приколы и читала их обратно как сценарий (вечный «безвиз»). Узкие поля —
 *      меньше места для гэгов (полумера: гэг всё ещё может влезть в «интересы»).
 *   2. НЕДЕЛЬНЫЙ СБРОС. Досье живёт неделю от первого заполнения (метка since) и
 *      обнуляется. Сброс ленивый: обычные обновления since НЕ двигают, иначе
 *      активный человек продлевал бы досье бесконечно.
 *
 * Старые прозаические досье (поле note, без since) этим кодом не читаются —
 * since отсутствует, getRepNote вернёт пусто, и на следующем разговоре поверх
 * ляжет новая структура.
 */

import { db } from "../core/bot";

/** Длина каждого поля: короткий факт, не сочинение. */
const MAX_FIELD = 300;

/** Досье живёт неделю от старта, потом сбрасывается. */
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Структурное досье: только факты о человеке, без шуток бота. */
export interface RepFields {
    who?: string;        // кто это: имя/роль/чем занят
    interests?: string;  // интересы, темы
    attitude?: string;   // как относится к боту
}

function clip(s: unknown): string {
    return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD) : "";
}

/**
 * Досье короткой строкой для запроса, или пусто, если бот человека не знает или
 * неделя истекла (ленивый сброс по since).
 */
export async function getRepNote(userId: number): Promise<string> {
    try {
        const data = (await db.collection("telegram_rep").doc(String(userId)).get()).data();
        if (!data) return "";
        const since = typeof data.since === "number" ? data.since : 0;
        if (!since || Date.now() - since >= WEEK_MS) return ""; // неделя вышла — чистый лист
        const parts: string[] = [];
        if (data.who) parts.push(`кто: ${data.who}`);
        if (data.interests) parts.push(`интересы: ${data.interests}`);
        if (data.attitude) parts.push(`как относится к тебе: ${data.attitude}`);
        return parts.join("; ");
    } catch (e) {
        console.error("[REP] Не удалось прочитать досье:", e);
        return "";
    }
}

/**
 * Обновляет досье структурными полями (модель возвращает их целиком каждый раз).
 * Метка since ставится при первом заполнении и при сбросе (прошлая неделя истекла),
 * на обычных обновлениях не двигается — поэтому досье живёт ровно неделю от старта.
 * Пустое (все поля пустые) не пишем — старое важнее ничего.
 */
export async function setRepNote(userId: number, fields: RepFields): Promise<void> {
    const who = clip(fields.who);
    const interests = clip(fields.interests);
    const attitude = clip(fields.attitude);
    if (!who && !interests && !attitude) return;
    try {
        const ref = db.collection("telegram_rep").doc(String(userId));
        await db.runTransaction(async (t) => {
            const prevSince = (await t.get(ref)).data()?.since;
            const fresh = typeof prevSince !== "number" || Date.now() - prevSince >= WEEK_MS;
            t.set(ref, {
                who, interests, attitude,
                since: fresh ? Date.now() : prevSince,
                updatedAt: Date.now(),
            }, { merge: true });
        });
    } catch (e) {
        console.error("[REP] Не удалось записать досье:", e);
    }
}
