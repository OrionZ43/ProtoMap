/**
 * Долгая память бота о людях: короткое впечатление о каждом, которое он сам
 * пишет и обновляет после разговоров. Тон ответа идёт от того, как человек
 * общался с ботом, — с добрыми теплее, с грубыми холоднее.
 *
 * Только «Гарем» (возможность ask). Хранится по Telegram id: telegram_rep/{id}.
 * Чат маленький (~30 человек), документ крошечный. Впечатление уходит в Gemini
 * в составе запроса — как и остальная переписка этого чата; это личный чат
 * Ориона, он об этом знает.
 *
 * Здесь НЕ храним ничего, кроме текста впечатления и времени: ни переписки, ни
 * имени — id достаточно, а само впечатление пишет модель.
 */

import { db } from "../core/bot";

/** Досье длиннее этого режем: это биография на человека, но не бесконечная. */
const MAX_NOTE = 2000;

/** Текущее впечатление бота о человеке, или пустая строка, если он его не знает. */
export async function getRepNote(userId: number): Promise<string> {
    try {
        const snap = await db.collection("telegram_rep").doc(String(userId)).get();
        const note = snap.data()?.note;
        return typeof note === "string" ? note : "";
    } catch (e) {
        console.error("[REP] Не удалось прочитать впечатление:", e);
        return "";
    }
}

/** Сохраняет обновлённое впечатление. Пустое не пишем — старое важнее ничего. */
export async function setRepNote(userId: number, note: string): Promise<void> {
    const clean = note.trim().slice(0, MAX_NOTE);
    if (!clean) return;
    try {
        await db.collection("telegram_rep").doc(String(userId)).set(
            { note: clean, updatedAt: Date.now() },
            { merge: true }
        );
    } catch (e) {
        console.error("[REP] Не удалось записать впечатление:", e);
    }
}
