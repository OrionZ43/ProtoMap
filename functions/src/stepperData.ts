/**
 * Удаление данных о шагах при отзыве согласия на шагомер.
 *
 * Отдельным модулем, а не в stepper.ts: stepper.ts обращается к базе прямо
 * при загрузке модуля, а сюда ходит consents.ts — завязывать порядок загрузки
 * модулей друг на друга незачем. База здесь берётся лениво, как в consents.ts.
 */

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const db = () => admin.firestore();

const BATCH_LIMIT = 400;

export type StepErasure = {
    claims: number;
    idempotency: number;
    leaderboard: boolean;
    lockedUntil: string | null;
};

/**
 * Удаляет всё, что сервер хранит о шагах человека: суточные счётчики, шаги по
 * дням и итог за всё время (`stepper/{uid}`), журнал начислений
 * (`claim_history`), запись в рейтинге и ключи идемпотентности с результатами
 * начислений.
 *
 * Статья 10 Закона № 99-З: после отзыва согласия обработка прекращается, а
 * данные удаляются в 15-дневный срок. Удаляем сразу. Уже начисленные
 * ProtoCoins остаются: отзыв обратной силы не имеет.
 *
 * До конца текущих суток (UTC) остаётся одно — отметка `claimsLockedUntil`,
 * если сегодня уже было начисление. Сколько шагов за день уже оплачено, сервер
 * помнит только в счётчиках, которые здесь удаляются. Без отметки можно
 * отозвать согласие, сразу дать его снова и получить ProtoCoins за те же шаги
 * ещё раз. В отметке нет ни одного числа шагов — только время, до которого
 * начисление закрыто; после него stepperClaim её снимает.
 */
export async function eraseStepData(uid: string): Promise<StepErasure> {
    const stepperRef = db().collection("stepper").doc(uid);
    const sd = (await stepperRef.get()).data();
    const now = Date.now();

    const resetMs = sd?.dailyResetAt?.toMillis?.() ?? 0;
    const claimedToday = resetMs > now && (sd?.dailyClaimsCount ?? 0) > 0;
    const prevLockMs = sd?.claimsLockedUntil?.toMillis?.() ?? 0;
    const lockMs = Math.max(claimedToday ? resetMs : 0, prevLockMs > now ? prevLockMs : 0);

    const claims = (await stepperRef.collection("claim_history").count().get()).data().count;
    await db().recursiveDelete(stepperRef);

    const boardRef = db().collection("stepper_leaderboard").doc(uid);
    const leaderboard = (await boardRef.get()).exists;
    if (leaderboard) await boardRef.delete();

    const idem = await db().collection("stepper_idempotency").where("uid", "==", uid).get();
    for (let i = 0; i < idem.docs.length; i += BATCH_LIMIT) {
        const batch = db().batch();
        idem.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }

    if (lockMs > 0) {
        await stepperRef.set({ claimsLockedUntil: Timestamp.fromMillis(lockMs) });
    }

    return {
        claims,
        idempotency: idem.size,
        leaderboard,
        lockedUntil: lockMs > 0 ? new Date(lockMs).toISOString() : null,
    };
}
