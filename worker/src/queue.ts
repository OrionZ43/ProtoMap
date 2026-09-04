/**
 * Очередь задач в Firestore.
 *
 * Задачи создаёт бот (Cloud Function), забирает воркер. Firestore выбран,
 * а не HTTP-эндпоинт, потому что воркер стоит за домашним NAT: входящих
 * подключений к нему нет, он сам ходит наружу.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

import {
    SERVICE_ACCOUNT_PATH,
    QUEUE_COLLECTION,
    HEARTBEAT_DOC,
    STALE_JOB_MS,
} from "./config.js";

const app = initializeApp({
    credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"))),
});

const db = getFirestore(app);

/** Идентификатор запуска — попадает в задачу, чтобы видеть, кто её взял. */
export const WORKER_ID = `${process.env.HOSTNAME || "worker"}-${randomUUID().slice(0, 8)}`;

export type Job = {
    id: string;
    url: string;
    chatId: number;
    messageId?: number;
    spoiler: boolean;
    requestedBy?: number;
    /** Когда задачу поставили — для замера задержки доставки. */
    createdAtMs?: number;
};

/**
 * Забирает одну задачу транзакцией.
 *
 * Транзакция здесь не перестраховка: воркеров может оказаться два (например,
 * старый контейнер не успел остановиться при обновлении), и без неё оба возьмут
 * одну задачу и отправят файл дважды.
 */
export async function claimJob(): Promise<Job | null> {
    const snap = await db
        .collection(QUEUE_COLLECTION)
        .where("status", "==", "pending")
        .orderBy("createdAt")
        .limit(5)
        .get();

    for (const doc of snap.docs) {
        const claimed = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref);
            if (fresh.data()?.status !== "pending") return null;

            tx.update(doc.ref, {
                status: "processing",
                workerId: WORKER_ID,
                claimedAt: FieldValue.serverTimestamp(),
            });

            const d = fresh.data()!;
            return {
                id: doc.id,
                url: String(d.url),
                chatId: Number(d.chatId),
                messageId: d.messageId ? Number(d.messageId) : undefined,
                spoiler: d.spoiler === true,
                requestedBy: d.requestedBy ? Number(d.requestedBy) : undefined,
                createdAtMs: d.createdAt?.toMillis?.() ?? undefined,
            } satisfies Job;
        });

        if (claimed) return claimed;
    }

    return null;
}

/**
 * Подписка на появление задач.
 *
 * Firestore умеет присылать изменения сам, и это убирает главную задержку:
 * при опросе раз в несколько секунд пользователь ждёт впустую ещё до того,
 * как начнётся скачивание. Здесь реакция мгновенная.
 *
 * Опрос при этом не выбрасывается, а становится редким подстраховочным:
 * подписка может отвалиться по сети и не восстановиться, и тогда очередь
 * встанет молча.
 */
export function watchPending(onChange: () => void): () => void {
    return db
        .collection(QUEUE_COLLECTION)
        .where("status", "==", "pending")
        .orderBy("createdAt")
        .limit(5)
        .onSnapshot(
            (snap) => { if (!snap.empty) onChange(); },
            (err) => console.error("[queue] Подписка отвалилась:", err.message)
        );
}

export async function finishJob(id: string, error?: string): Promise<void> {
    await db.collection(QUEUE_COLLECTION).doc(id).update({
        status: error ? "failed" : "done",
        finishedAt: FieldValue.serverTimestamp(),
        error: error ?? FieldValue.delete(),
    });
}

/**
 * Возвращает в очередь задачи, зависшие в processing.
 *
 * Без этого одна упавшая загрузка (или убитый на обновлении контейнер) держит
 * задачу навсегда, а пользователь ждёт ответа, которого не будет.
 */
export async function requeueStale(): Promise<number> {
    const cutoff = Timestamp.fromMillis(Date.now() - STALE_JOB_MS);

    const snap = await db
        .collection(QUEUE_COLLECTION)
        .where("status", "==", "processing")
        .where("claimedAt", "<", cutoff)
        .limit(20)
        .get();

    if (snap.empty) return 0;

    const batch = db.batch();
    for (const doc of snap.docs) {
        batch.update(doc.ref, {
            status: "pending",
            workerId: FieldValue.delete(),
            claimedAt: FieldValue.delete(),
            requeuedAt: FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    return snap.size;
}

/**
 * Возвращает задачу в очередь, не дожидаясь таймаута зависших.
 *
 * Нужно при остановке контейнера: без этого взятая задача висит в `processing`
 * до срабатывания `requeueStale`, то есть десять минут. А перезапуски будут
 * регулярными — автообновления CoreOS и еженедельный рестарт ради свежего
 * yt-dlp. Пользователь всё это время просто ждёт молча.
 */
export async function releaseJob(id: string): Promise<void> {
    await db.collection(QUEUE_COLLECTION).doc(id).update({
        status: "pending",
        workerId: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        releasedAt: FieldValue.serverTimestamp(),
    });
}

export async function pendingCount(): Promise<number> {
    const snap = await db
        .collection(QUEUE_COLLECTION)
        .where("status", "==", "pending")
        .count()
        .get();
    return snap.data().count;
}

/**
 * Пульс.
 *
 * Главная проблема такой качалки — тихая смерть: контейнер упал, ссылки
 * перестали качаться, и заметят это через неделю. Пульс читает команда
 * /dlstatus в боте, и по протухшей отметке видно, что воркер лежит.
 */
export async function heartbeat(fields: {
    ytdlpVersion: string;
    pending: number;
    lastError?: string | null;
}): Promise<void> {
    const [collection, doc] = HEARTBEAT_DOC.split("/");
    await db.collection(collection).doc(doc).set(
        {
            workerId: WORKER_ID,
            updatedAt: FieldValue.serverTimestamp(),
            ...fields,
        },
        { merge: true }
    );
}
