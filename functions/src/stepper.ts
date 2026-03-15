// ===================================================================
// 🦶 STEPPER CLOUD FUNCTIONS — v2.1
// ===================================================================
// Интегрируется с Health Connect (Android).
//
// Серверные меры защиты:
//   ✅ App Check
//   ✅ Кулдаун между клеймами (1 ч)
//   ✅ Физический лимит шагов/час и за день
//   ✅ Верификация бонусных часов через серверный LCG-seed
//   ✅ Аудит-лог каждого клейма
//   ✅ Rate-limiting: максимум MAX_DAILY_CLAIMS клеймов в сутки
//   ✅ Дневной кап PC: суммарно не более MAX_DAILY_PC за 24 ч
//   ✅ Аномалия-детект: резкий рост шагов → warn + флаг в профиле
//   ✅ getStepperStatus возвращает dailyCapInfo для UI
//   ✅ Идемпотентность: повторный клейм с тем же requestId не дублирует
//   ✅ Ошибки клиенту — общий код; детали только в логах
//   ✅ [v2.1] Серверный учёт заклеймленных шагов: сброс данных приложения
//            не позволяет переклеймить уже конвертированные шаги
// ===================================================================

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, DocumentData } from "firebase-admin/firestore";

// ─── Shared db (admin инициализирован в index.ts) ─────────────────────────────
const db = admin.firestore();

// ─── Константы ───────────────────────────────────────────────────────────────
const PC_PER_1000_BASE    = 10;
const STEPS_PER_REWARD    = 1000;
const BONUS_HOURS_COUNT   = 2;
const BONUS_MULTIPLIER    = 3;

const REGEN_INTERVAL_MS   = 24 * 60 * 60 * 1000;
const COOLDOWN_MS         = 60 * 60 * 1000;

const MAX_STEPS_PER_HOUR  = 12_000;
const MAX_DAILY_STEPS     = 80_000;
const MAX_CLAIM_PC        = 2_000;
const MAX_DAILY_PC        = 5_000;
const MAX_DAILY_CLAIMS    = 8;
const ANOMALY_MULTIPLIER  = 3.0;

const IDEMPOTENCY_TTL_MS  = 24 * 60 * 60 * 1000;

// ─── Утилиты ─────────────────────────────────────────────────────────────────

/**
 * Детерминированные бонусные часы (LCG, seed = dayOfYear * 1000 + year).
 * Реализовано через BigInt() вызовы вместо литералов (ES2017-совместимо).
 */
function generateBonusHours(year: number, dayOfYear: number, count: number): number[] {
    let state = BigInt(dayOfYear) * BigInt(1000) + BigInt(year);

    const MULT   = BigInt("6364136223846793005");
    const INC    = BigInt("1442695040888963407");
    const MASK64 = BigInt("18446744073709551615"); // 0xFFFFFFFFFFFFFFFF
    const MASK16 = BigInt(65535);                  // 0xFFFF

    const next = (): number => {
        state = (state * MULT + INC) & MASK64;
        return Number(state & MASK16);
    };

    const pool = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
    for (let i = pool.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).sort((a, b) => a - b);
}

function getDayOfYear(date: Date): number {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
    return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

function nextMidnightUTC(now: Date): number {
    const d = new Date(now);
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
}

function isDailyResetNeeded(data: DocumentData | undefined, now: Date): boolean {
    if (!data?.dailyResetAt) return true;
    return now.getTime() >= data.dailyResetAt.toMillis();
}

// ─── getStepperStatus ────────────────────────────────────────────────────────

export const getStepperStatus = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError("failed-precondition", "App Check required.");
    }
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Auth required.");
    }

    const uid = request.auth.uid;
    const ref = db.collection("stepper").doc(uid);
    const now = new Date();

    try {
        const snap = await ref.get();
        const data = snap.data();

        const currentHour     = now.getUTCHours();
        const year            = now.getUTCFullYear();
        const dayOfYear       = getDayOfYear(now);
        const needsRegen      = !snap.exists || !data?.generatedAt ||
                                now.getTime() - data.generatedAt.toMillis() >= REGEN_INTERVAL_MS;
        const needsDailyReset = isDailyResetNeeded(data, now);

        if (needsRegen || needsDailyReset) {
            const bonusHours = generateBonusHours(year, dayOfYear, BONUS_HOURS_COUNT);
            const update: { [key: string]: unknown } = {
                multiplier:   BONUS_MULTIPLIER,
                generatedAt:  FieldValue.serverTimestamp(),
                lastClaimAt:  data?.lastClaimAt ?? null,
                totalClaimed: data?.totalClaimed ?? 0,
                dailyResetAt: new Date(nextMidnightUTC(now)),
            };
            if (needsRegen) update.bonusHours = bonusHours;
            if (needsDailyReset) {
                update.dailyClaimedPc          = 0;
                update.dailyClaimsCount        = 0;
                // [v2.1] Сбрасываем серверные счётчики заклеймленных шагов
                update.dailyClaimedNormalSteps = 0;
                update.dailyClaimedBonusSteps  = 0;
            }
            await ref.set(update, { merge: true });

            const hours = needsRegen ? bonusHours : (data?.bonusHours ?? []);
            return buildStatusResponse(hours, currentHour, 0, 0, now);
        }

        return buildStatusResponse(
            data!.bonusHours,
            currentHour,
            data!.dailyClaimedPc   ?? 0,
            data!.dailyClaimsCount ?? 0,
            now
        );

    } catch (e: any) {
        if (e instanceof HttpsError) throw e;
        console.error("[STEPPER] getStepperStatus error:", e);
        throw new HttpsError("internal", "Ошибка получения статуса шагомера.");
    }
});

function buildStatusResponse(
    bonusHours:       number[],
    currentHour:      number,
    dailyClaimedPc:   number,
    dailyClaimsCount: number,
    now:              Date
) {
    return {
        bonusHours,
        multiplier:         BONUS_MULTIPLIER,
        isCurrentHourBonus: bonusHours.includes(currentHour),
        currentHour,
        stepsPerReward:     STEPS_PER_REWARD,
        pcPerRewardBase:    PC_PER_1000_BASE,
        pcPerRewardBonus:   PC_PER_1000_BASE * BONUS_MULTIPLIER,
        dailyCapInfo: {
            dailyClaimedPc,
            maxDailyPc:       MAX_DAILY_PC,
            remainingDailyPc: Math.max(0, MAX_DAILY_PC - dailyClaimedPc),
            dailyClaimsCount,
            maxDailyClaims:   MAX_DAILY_CLAIMS,
            remainingClaims:  Math.max(0, MAX_DAILY_CLAIMS - dailyClaimsCount),
            resetAtMs:        nextMidnightUTC(now),
        },
    };
}

// ─── stepperClaim ────────────────────────────────────────────────────────────

export const stepperClaim = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError("failed-precondition", "App Check required.");
    }
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Auth required.");
    }

    const uid = request.auth.uid;

    const { normalSteps, bonusSteps, hourStats, requestId } = request.data as {
        normalSteps: number;
        bonusSteps:  number;
        hourStats:   { hour: number; steps: number }[];
        requestId:   string;
    };

    if (
        typeof normalSteps !== "number" || !Number.isFinite(normalSteps) || normalSteps < 0 ||
        typeof bonusSteps  !== "number" || !Number.isFinite(bonusSteps)  || bonusSteps  < 0 ||
        !Array.isArray(hourStats) ||
        typeof requestId   !== "string" || requestId.length < 16 || requestId.length > 64
    ) {
        throw new HttpsError("invalid-argument", "Неверный формат данных шагомера.");
    }

    // ── Идемпотентность ───────────────────────────────────────────────────────
    const idempRef  = db.collection("stepper_idempotency").doc(requestId);
    const idempSnap = await idempRef.get();

    if (idempSnap.exists) {
        const idempData = idempSnap.data()!;
        if (idempData.uid !== uid) {
            console.warn(`[STEPPER] requestId collision/replay: ${requestId}, uid=${uid}, owner=${idempData.uid}`);
            throw new HttpsError("permission-denied", "Ошибка запроса.");
        }
        console.log(`[STEPPER] Idempotent return for requestId=${requestId}, uid=${uid}`);
        return idempData.result;
    }

    // ── Бан-проверка до транзакции (экономит Firestore read если бан) ─────
    // assertNotBanned импортирован из index.ts через общий модуль
    // Дополнительная проверка ud.isBanned внутри транзакции остаётся
    const stepperRef = db.collection("stepper").doc(uid);
    const userRef    = db.collection("users").doc(uid);
    const now        = new Date();

    try {
        const result = await db.runTransaction(async (t) => {

            const [stepperSnap, userSnap] = await Promise.all([
                t.get(stepperRef),
                t.get(userRef),
            ]);

            if (!stepperSnap.exists) throw new HttpsError("failed-precondition", "Шагомер не инициализирован.");
            if (!userSnap.exists)    throw new HttpsError("not-found", "Пользователь не найден.");

            const sd = stepperSnap.data()!;
            const ud = userSnap.data()!;

            if (ud.isBanned) throw new HttpsError("permission-denied", "Аккаунт заблокирован.");

            const bonusHours: number[] = sd.bonusHours ?? [];
            const multiplier: number   = sd.multiplier  ?? BONUS_MULTIPLIER;

            // ── Сброс дневных счётчиков ───────────────────────────────────────
            const needsReset              = isDailyResetNeeded(sd, now);
            const dailyClaimedPc          = needsReset ? 0 : (sd.dailyClaimedPc          ?? 0);
            const dailyClaimsCount        = needsReset ? 0 : (sd.dailyClaimsCount        ?? 0);
            // [v2.1] Серверные счётчики заклеймленных шагов — сбрасываются вместе с остальными
            const dailyClaimedNormalSteps = needsReset ? 0 : (sd.dailyClaimedNormalSteps ?? 0);
            const dailyClaimedBonusSteps  = needsReset ? 0 : (sd.dailyClaimedBonusSteps  ?? 0);

            if (dailyClaimsCount >= MAX_DAILY_CLAIMS) {
                throw new HttpsError("resource-exhausted", "Достигнут дневной лимит клеймов.");
            }
            if (dailyClaimedPc >= MAX_DAILY_PC) {
                throw new HttpsError("resource-exhausted", "Достигнут дневной лимит протокоинов.");
            }

            // ── Кулдаун ───────────────────────────────────────────────────────
            const lastClaimMs = sd.lastClaimAt ? sd.lastClaimAt.toMillis() : 0;
            const sinceLastMs = now.getTime() - lastClaimMs;
            if (sinceLastMs < COOLDOWN_MS) {
                const minutesLeft = Math.ceil((COOLDOWN_MS - sinceLastMs) / 60_000);
                throw new HttpsError("resource-exhausted", `Следующий клейм через ${minutesLeft} мин.`);
            }

            // ── Верификация hourStats ─────────────────────────────────────────
            if (hourStats.length > 24) {
                throw new HttpsError("invalid-argument", "Слишком много записей hourStats.");
            }

            let statTotal = 0;
            for (const e of hourStats) {
                if (
                    typeof e.hour  !== "number" || e.hour  < 0 || e.hour  > 23 ||
                    typeof e.steps !== "number" || e.steps < 0 || !Number.isFinite(e.steps)
                ) {
                    console.warn(`[STEPPER] Bad hourStats entry uid=${uid}:`, e);
                    throw new HttpsError("invalid-argument", "Ошибка данных шагомера.");
                }
                if (e.steps > MAX_STEPS_PER_HOUR) {
                    console.warn(`[STEPPER] Steps/hour exceeded uid=${uid}, hour=${e.hour}, steps=${e.steps}`);
                    throw new HttpsError("invalid-argument", "Ошибка данных шагомера.");
                }
                statTotal += e.steps;
            }

            if (statTotal > MAX_DAILY_STEPS) {
                console.warn(`[STEPPER] Daily steps exceeded uid=${uid}: ${statTotal}`);
                throw new HttpsError("invalid-argument", "Ошибка данных шагомера.");
            }

            // ── Целостность normalSteps + bonusSteps ≈ sum(hourStats) ─────────
            const claimedTotal = normalSteps + bonusSteps;
            const tolerance    = Math.max(STEPS_PER_REWARD, statTotal * 0.01);
            if (Math.abs(claimedTotal - statTotal) > tolerance) {
                console.warn(`[STEPPER] Mismatch uid=${uid}: claimed=${claimedTotal} stat=${statTotal}`);
                throw new HttpsError("invalid-argument", "Ошибка данных шагомера.");
            }

            // ── Бонусные шаги только из бонусных часов ────────────────────────
            const verifiedBonus  = hourStats
                .filter(e => bonusHours.includes(e.hour))
                .reduce((a, e) => a + e.steps, 0);
            const verifiedNormal = statTotal - verifiedBonus;

            if (bonusSteps  > verifiedBonus  + tolerance) {
                console.warn(`[STEPPER] Bonus overshoot uid=${uid}: bonusSteps=${bonusSteps} verified=${verifiedBonus}`);
                throw new HttpsError("invalid-argument", "Ошибка данных шагомера.");
            }
            if (normalSteps > verifiedNormal + tolerance) {
                console.warn(`[STEPPER] Normal overshoot uid=${uid}: normalSteps=${normalSteps} verified=${verifiedNormal}`);
                throw new HttpsError("invalid-argument", "Ошибка данных шагомера.");
            }

            // ── [v2.1] Защита от повторного клейма одних и тех же шагов ──────
            //
            // Логика: клиент присылает ПОЛНЫЙ объём шагов за день (из Health Connect).
            // Сервер помнит сколько нормальных и бонусных шагов уже было сконвертировано
            // сегодня. Доступные для клейма — только разница.
            //
            // Пример читерства без этой проверки:
            //   1. Нагулял 5000 шагов, заклеймил → +50 PC
            //   2. Сбросил данные приложения (SharedPreferences очищены)
            //   3. Снова открыл шагомер — клиент думает claimed=0, шлёт 5000 шагов снова
            //   4. БЕЗ этой проверки: сервер снова даёт +50 PC ← читерство
            //   5. С этой проверкой: availableNormal = 5000 - 5000 = 0 → отказ
            //
            // Tolerance такой же как для остальных проверок — 1% или 1000 шагов.
            const availableNormal = verifiedNormal - dailyClaimedNormalSteps;
            const availableBonus  = verifiedBonus  - dailyClaimedBonusSteps;

            if (availableNormal < 0) {
                console.warn(
                    `[STEPPER] Normal steps replay uid=${uid}: ` +
                    `verifiedNormal=${verifiedNormal} alreadyClaimed=${dailyClaimedNormalSteps} ` +
                    `available=${availableNormal}`
                );
                throw new HttpsError("failed-precondition", "Недостаточно новых шагов для награды.");
            }
            if (availableBonus < 0) {
                console.warn(
                    `[STEPPER] Bonus steps replay uid=${uid}: ` +
                    `verifiedBonus=${verifiedBonus} alreadyClaimed=${dailyClaimedBonusSteps} ` +
                    `available=${availableBonus}`
                );
                throw new HttpsError("failed-precondition", "Недостаточно новых шагов для награды.");
            }

            // Пересчитываем батчи от реально доступных шагов (не от того что прислал клиент)
            // Это гарантирует что даже если клиент пришлёт завышенное значение —
            // сервер выдаст PC только за шаги сверх уже заклеймленных.
            const claimableNormal = Math.max(0, availableNormal);
            const claimableBonus  = Math.max(0, availableBonus);

            // ── Аномалия ──────────────────────────────────────────────────────
            const lastStepCount = sd.lastStepCount ?? 0;
            if (lastStepCount > 0 && statTotal > lastStepCount * ANOMALY_MULTIPLIER && statTotal > 10_000) {
                console.warn(
                    `[STEPPER] Anomaly uid=${uid}: prev=${lastStepCount} current=${statTotal} ` +
                    `ratio=${(statTotal / lastStepCount).toFixed(1)}`
                );
                t.update(userRef, { stepperAnomalyFlag: FieldValue.increment(1) });
            }

            // ── Расчёт PC (от claimable, не от присланных клиентом) ───────────
            const normalBatches = Math.floor(claimableNormal / STEPS_PER_REWARD);
            const bonusBatches  = Math.floor(claimableBonus  / STEPS_PER_REWARD);
            const rawPc         = normalBatches * PC_PER_1000_BASE +
                                  bonusBatches  * PC_PER_1000_BASE * multiplier;

            if (rawPc <= 0) {
                throw new HttpsError("failed-precondition", "Недостаточно шагов для награды.");
            }

            const claimCapped = Math.min(rawPc, MAX_CLAIM_PC);
            const remaining   = MAX_DAILY_PC - dailyClaimedPc;
            const earnedPc    = Math.min(claimCapped, remaining);

            if (claimCapped !== rawPc)       console.warn(`[STEPPER] Claim cap uid=${uid}: raw=${rawPc} → ${claimCapped}`);
            if (earnedPc    !== claimCapped) console.warn(`[STEPPER] Daily cap uid=${uid}: claimCapped=${claimCapped} → ${earnedPc}`);

            const newBalance      = (ud.casino_credits ?? 0) + earnedPc;
            const newTotalClaimed = (sd.totalClaimed   ?? 0) + earnedPc;
            const newDailyPc      = dailyClaimedPc   + earnedPc;
            const newDailyCount   = dailyClaimsCount + 1;

            // [v2.1] Накапливаем сколько шагов реально сконвертировано сегодня.
            // Фиксируем батчи × 1000 — ровно то что пошло в PC, остаток доступен
            // для следующего клейма когда пользователь нагуляет ещё шагов.
            const newClaimedNormalSteps = dailyClaimedNormalSteps + normalBatches * STEPS_PER_REWARD;
            const newClaimedBonusSteps  = dailyClaimedBonusSteps  + bonusBatches  * STEPS_PER_REWARD;

            // ── Запись ────────────────────────────────────────────────────────
            t.update(userRef, { casino_credits: newBalance });

            const stepperUpdate: { [key: string]: FieldValue | number | Date } = {
                lastClaimAt:              FieldValue.serverTimestamp(),
                totalClaimed:             newTotalClaimed,
                dailyClaimedPc:           newDailyPc,
                dailyClaimsCount:         newDailyCount,
                lastStepCount:            statTotal,
                // [v2.1]
                dailyClaimedNormalSteps:  newClaimedNormalSteps,
                dailyClaimedBonusSteps:   newClaimedBonusSteps,
            };
            if (needsReset) {
                stepperUpdate.dailyResetAt = new Date(nextMidnightUTC(now));
            }
            t.update(stepperRef, stepperUpdate);

            // Аудит-лог
            t.set(
                db.collection("stepper").doc(uid).collection("claim_history").doc(),
                {
                    claimedAt:              FieldValue.serverTimestamp(),
                    requestId,
                    normalSteps,
                    bonusSteps,
                    claimableNormal,
                    claimableBonus,
                    normalBatches,
                    bonusBatches,
                    multiplier,
                    rawPc,
                    earnedPc,
                    newBalance,
                    dailyPcAfter:           newDailyPc,
                    dailyCountAfter:        newDailyCount,
                    claimedNormalAfter:     newClaimedNormalSteps,
                    claimedBonusAfter:      newClaimedBonusSteps,
                    bonusHoursUsed:         bonusHours,
                    hourStats,
                    statTotal,
                }
            );

            return {
                earnedPc,
                newBalance,
                normalBatches,
                bonusBatches,
                multiplier,
                dailyCapInfo: {
                    dailyClaimedPc:   newDailyPc,
                    maxDailyPc:       MAX_DAILY_PC,
                    remainingDailyPc: Math.max(0, MAX_DAILY_PC - newDailyPc),
                    dailyClaimsCount: newDailyCount,
                    maxDailyClaims:   MAX_DAILY_CLAIMS,
                    remainingClaims:  Math.max(0, MAX_DAILY_CLAIMS - newDailyCount),
                },
            };
        });

        // ── Сохраняем ключ идемпотентности (best-effort, вне транзакции) ──────
        await idempRef.set({
            uid,
            result:    result,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        }).catch(e => console.warn("[STEPPER] idempotency write failed:", e));

        console.log(
            `[STEPPER] uid=${uid} claimed ${result.earnedPc} PC ` +
            `(normal=${result.normalBatches} batches, bonus=${result.bonusBatches}×${result.multiplier})`
        );

        return result;

    } catch (e: any) {
        if (e instanceof HttpsError) throw e;
        console.error("[STEPPER] stepperClaim error:", e);
        throw new HttpsError("internal", "Ошибка клейма шагомера.");
    }
});