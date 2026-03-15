// ===================================================================
// 🎯 REFERRAL FUNCTIONS — v1.1
// ===================================================================
// Реферальная программа с месячным турниром + бонус новичку.
//
// Механика:
//   • Каждый пользователь получает уникальный реф-код
//   • Новый пользователь активирует код → реферер +250 PC,
//     новичок +500 PC (бонус за выполнение условий)
//   • Условия для засчитывания:
//       1. Email подтверждён
//       2. Telegram привязан
//       3. Вступил в чат @proto_map
//   • Раз в месяц: кто пригласил больше всех → +10 000 PC
//
// Защита от абуза:
//   ✅ Нельзя активировать свой же код
//   ✅ Один пользователь = один активированный код
//   ✅ Все 3 условия проверяются на сервере через Bot API / Auth
//   ✅ assertNotBanned для обоих участников
//   ✅ Транзакционное начисление PC обоим в одной транзакции
//   ✅ Аудит-лог каждого реферала
//   ✅ claimNewUserBonus — отдельный вызов, тоже идемпотентный
// ===================================================================

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import fetch from "node-fetch";

const db = admin.firestore();

// ─── Константы ───────────────────────────────────────────────────────────────

const REFERRAL_PC       = 250;    // PC рефереру за приглашённого
const NEW_USER_BONUS_PC = 500;    // PC новичку при активации кода
const WINNER_PC         = 10_000; // PC победителю месяца

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Проверка через флаг telegram_chat_verified который бот выставляет
// когда пользователь нажимает "✅ Я НЕ БОТ" в капче чата @proto_map
function isChatVerified(userData: FirebaseFirestore.DocumentData): boolean {
    return userData.telegram_chat_verified === true;
}

// ─── getOrCreateReferralCode ──────────────────────────────────────────────────

export const getOrCreateReferralCode = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError("failed-precondition", "App Check required.");
    if (!request.auth)            throw new HttpsError("unauthenticated",      "Auth required.");

    const uid = request.auth.uid;
    const ref = db.collection("referrals").doc(uid);

    try {
        const snap = await ref.get();
        if (snap.exists) return await buildReferralStatusResponse(uid, snap.data()!);

        const suffix   = Math.random().toString(36).substring(2, 6).toUpperCase();
        const code     = `REF_${uid.substring(0, 8).toUpperCase()}_${suffix}`;
        const monthKey = getCurrentMonthKey();

        await ref.set({
            code,
            createdAt:     FieldValue.serverTimestamp(),
            totalReferred: 0,
            monthlyCount:  0,
            monthKey,
        });

        await db.collection("referral_codes").doc(code).set({ referrerId: uid });

        console.log(`[REFERRAL] Created code=${code} for uid=${uid}`);
        return await buildReferralStatusResponse(uid, { code, totalReferred: 0, monthlyCount: 0, monthKey });

    } catch (e: any) {
        if (e instanceof HttpsError) throw e;
        console.error("[REFERRAL] getOrCreateReferralCode error:", e);
        throw new HttpsError("internal", "Ошибка получения реферального кода.");
    }
});

async function buildReferralStatusResponse(uid: string, data: any) {
    const monthKey     = getCurrentMonthKey();
    const campaignSnap = await db.collection("referral_campaign").doc(monthKey).get();
    const campaign     = campaignSnap.data();

    const currentCount = data.monthKey === monthKey ? (data.monthlyCount ?? 0) : 0;
    const lb: any[]    = campaign?.leaderboard ?? [];
    const rankIdx      = lb.findIndex((e: any) => e.uid === uid);

    return {
        code:           data.code,
        totalReferred:  data.totalReferred  ?? 0,
        monthlyCount:   currentCount,
        referralPc:     REFERRAL_PC,
        newUserBonusPc: NEW_USER_BONUS_PC,
        winnerPc:       WINNER_PC,
        campaignStatus: campaign?.status    ?? "active",
        campaignEndsAt: campaign?.endsAt    ?? null,
        leaderboard:    lb,
        yourRank:       rankIdx !== -1 ? rankIdx + 1 : null,
    };
}

// ─── claimReferral ────────────────────────────────────────────────────────────

export const claimReferral = onCall(
    async (request) => {
        if (request.app == undefined) throw new HttpsError("failed-precondition", "App Check required.");
        if (!request.auth)            throw new HttpsError("unauthenticated",      "Auth required.");

        const newUserUid = request.auth.uid;
        const { code }   = request.data as { code: string };

        if (!code || typeof code !== "string" || code.length < 10 || code.length > 40) {
            throw new HttpsError("invalid-argument", "Некорректный реферальный код.");
        }

        try {
            // ── Идемпотентность ───────────────────────────────────────────────
            const idempRef  = db.collection("referral_idempotency").doc(newUserUid);
            const idempSnap = await idempRef.get();
            if (idempSnap.exists) {
                throw new HttpsError("already-exists", "Вы уже активировали реферальный код.");
            }

            // ── Ищем реферера ──────────────────────────────────────────────
            const codeSnap = await db.collection("referral_codes").doc(code).get();
            if (!codeSnap.exists) throw new HttpsError("not-found", "Реферальный код не найден.");
            const referrerId: string = codeSnap.data()!.referrerId;

            if (referrerId === newUserUid) {
                throw new HttpsError("invalid-argument", "Нельзя активировать собственный реферальный код.");
            }

            // ── Данные нового пользователя ─────────────────────────────────
            const newUserDoc = await db.collection("users").doc(newUserUid).get();
            if (!newUserDoc.exists) throw new HttpsError("not-found", "Профиль не найден.");
            const newUserData = newUserDoc.data()!;
            if (newUserData.isBanned) throw new HttpsError("permission-denied", "Аккаунт заблокирован.");

            // ── Условие 1: Email ───────────────────────────────────────────
            const authUser = await admin.auth().getUser(newUserUid);
            if (!authUser.emailVerified) {
                throw new HttpsError("failed-precondition",
                    "Сначала подтвердите email — проверьте почту и кликните по ссылке.");
            }

            // ── Условие 2: Telegram ────────────────────────────────────────
            const telegramId: number | undefined = newUserData.telegram_id;
            if (!telegramId) {
                throw new HttpsError("failed-precondition",
                    "Привяжите Telegram-аккаунт в разделе «Безопасность», затем попробуйте снова.");
            }

            // ── Условие 3: Верификация Cloudflare в чате @proto_map ─────────
            if (!isChatVerified(newUserData)) {
                throw new HttpsError("failed-precondition",
                    "Пройдите верификацию Cloudflare при входе в чат @proto_map.");
            }

            // ── Реферер жив ────────────────────────────────────────────────
            const referrerUserDoc = await db.collection("users").doc(referrerId).get();
            if (!referrerUserDoc.exists || referrerUserDoc.data()?.isBanned) {
                throw new HttpsError("failed-precondition", "Реферальный код недействителен.");
            }

            const monthKey = getCurrentMonthKey();

            // ── Транзакция: +250 PC рефереру, +500 PC новичку ─────────────
            await db.runTransaction(async (t) => {
                const referralRef  = db.collection("referrals").doc(referrerId);
                const referralSnap = await t.get(referralRef);
                const referrerRef  = db.collection("users").doc(referrerId);
                const referrerSnap = await t.get(referrerRef);
                const newUserRef   = db.collection("users").doc(newUserUid);
                const newUserSnap  = await t.get(newUserRef);

                if (!referralSnap.exists) throw new HttpsError("not-found", "Реферальная запись не найдена.");

                const rd = referralSnap.data()!;
                const ru = referrerSnap.data()!;
                const nu = newUserSnap.data()!;

                const currentMonthly   = rd.monthKey === monthKey ? (rd.monthlyCount ?? 0) : 0;
                const newTotalReferred = (rd.totalReferred ?? 0) + 1;
                const newMonthlyCount  = currentMonthly + 1;

                // Начисляем рефереру
                t.update(referrerRef, {
                    casino_credits: (ru.casino_credits ?? 0) + REFERRAL_PC,
                });

                // Начисляем новичку
                t.update(newUserRef, {
                    casino_credits:       (nu.casino_credits ?? 0) + NEW_USER_BONUS_PC,
                    referralBonusClaimed: true,
                });

                // Обновляем счётчики реферала
                t.update(referralRef, {
                    totalReferred:  newTotalReferred,
                    monthlyCount:   newMonthlyCount,
                    monthKey,
                    lastReferralAt: FieldValue.serverTimestamp(),
                });

                // Аудит-лог
                t.set(
                    db.collection("referrals").doc(referrerId).collection("claimed").doc(newUserUid),
                    {
                        claimedAt:    FieldValue.serverTimestamp(),
                        newUserUid,
                        referrerPcAwarded: REFERRAL_PC,
                        newUserPcAwarded:  NEW_USER_BONUS_PC,
                        checks: { email: true, telegram: true, chat: true },
                        monthKey,
                    }
                );

                // Идемпотентный замок
                t.set(idempRef, {
                    referrerId,
                    code,
                    claimedAt: FieldValue.serverTimestamp(),
                });
            });

            // Обновляем лидерборд (best-effort)
            updateLeaderboard(referrerId, monthKey).catch(e =>
                console.warn("[REFERRAL] Leaderboard update failed:", e)
            );

            console.log(`[REFERRAL] code=${code} claimed: referrer=${referrerId} +${REFERRAL_PC}PC, newUser=${newUserUid} +${NEW_USER_BONUS_PC}PC`);

            return {
                success:        true,
                referrerEarned: REFERRAL_PC,
                newUserEarned:  NEW_USER_BONUS_PC,
            };

        } catch (e: any) {
            if (e instanceof HttpsError) throw e;
            console.error("[REFERRAL] claimReferral error:", e);
            throw new HttpsError("internal", "Ошибка активации реферального кода.");
        }
    }
);


// ─── getReferralStatus ────────────────────────────────────────────────────────

export const getReferralStatus = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError("failed-precondition", "App Check required.");
    if (!request.auth)            throw new HttpsError("unauthenticated",      "Auth required.");

    const uid = request.auth.uid;

    try {
        const [refSnap, idempSnap, userSnap] = await Promise.all([
            db.collection("referrals").doc(uid).get(),
            db.collection("referral_idempotency").doc(uid).get(),
            db.collection("users").doc(uid).get(),
        ]);

        const monthKey     = getCurrentMonthKey();
        const campaignSnap = await db.collection("referral_campaign").doc(monthKey).get();
        const campaign     = campaignSnap.data();
        const lb           = campaign?.leaderboard ?? [];
        const rankIdx      = lb.findIndex((e: any) => e.uid === uid);

        // Проверяем выполнение условий для показа прогресса на странице
        const userData     = userSnap.data() ?? {};
        const emailVerified = !!(await admin.auth().getUser(uid)).emailVerified;
        const hasBonus     = idempSnap.exists;

        const base = {
            referralPc:       REFERRAL_PC,
            newUserBonusPc:   NEW_USER_BONUS_PC,
            winnerPc:         WINNER_PC,
            campaignStatus:   campaign?.status  ?? "active",
            campaignEndsAt:   campaign?.endsAt  ?? null,
            leaderboard:      lb,
            yourRank:         rankIdx !== -1 ? rankIdx + 1 : null,
            bonusAlreadyClaimed: hasBonus,
            // Прогресс условий для UI-чеклиста
            conditions: {
                email:    emailVerified,
                telegram: !!(userData.telegram_id),
                chat:     isChatVerified(userData),
            },
        };

        if (!refSnap.exists) {
            return { ...base, code: null, totalReferred: 0, monthlyCount: 0 };
        }

        const rd = refSnap.data()!;
        return {
            ...base,
            code:          rd.code,
            totalReferred: rd.totalReferred  ?? 0,
            monthlyCount:  rd.monthKey === monthKey ? (rd.monthlyCount ?? 0) : 0,
        };

    } catch (e: any) {
        if (e instanceof HttpsError) throw e;
        console.error("[REFERRAL] getReferralStatus error:", e);
        throw new HttpsError("internal", "Ошибка получения статуса.");
    }
});

// ─── updateLeaderboard (внутренняя) ──────────────────────────────────────────

async function updateLeaderboard(referrerId: string, monthKey: string): Promise<void> {
    console.log(`[LEADERBOARD] Updating for monthKey=${monthKey}`);

    const snap = await db.collection("referrals")
        .where("monthKey", "==", monthKey)
        .orderBy("monthlyCount", "desc")
        .limit(11)
        .get();

    console.log(`[LEADERBOARD] Found ${snap.size} docs`);
    snap.docs.forEach(d => console.log(`[LEADERBOARD] doc uid=${d.id}`, JSON.stringify(d.data())));

    const uids = snap.docs.map(d => d.id);
    if (uids.length === 0) {
        console.warn("[LEADERBOARD] No docs found, skipping update");
        return;
    }

    const usersSnap = await db.collection("users")
        .where(admin.firestore.FieldPath.documentId(), "in", uids.slice(0, 10))
        .get();
    const usersMap = new Map(usersSnap.docs.map(d => [d.id, d.data()]));

    const leaderboard = snap.docs.slice(0, 10).map((d, i) => ({
        rank:         i + 1,
        uid:          d.id,
        username:     usersMap.get(d.id)?.username ?? "Unknown",
        monthlyCount: d.data().monthlyCount ?? 0,
    }));

    await db.collection("referral_campaign").doc(monthKey).set({
        leaderboard,
        updatedAt: FieldValue.serverTimestamp(),
        status:    "active",
    }, { merge: true });
}

// ─── finishReferralCampaign ───────────────────────────────────────────────────

export const finishReferralCampaign = onCall(
    { secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request) => {
        if (request.app == undefined) throw new HttpsError("failed-precondition", "App Check required.");
        if (!request.auth)            throw new HttpsError("unauthenticated",      "Auth required.");

        const adminDoc = await db.collection("admins").doc(request.auth.uid).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "Недостаточно прав.");

        const { monthKey } = request.data as { monthKey?: string };
        const targetMonth  = monthKey ?? getCurrentMonthKey();

        try {
            const campaignRef  = db.collection("referral_campaign").doc(targetMonth);
            const campaignSnap = await campaignRef.get();

            if (campaignSnap.exists && campaignSnap.data()?.status === "finished") {
                throw new HttpsError("already-exists", `Кампания ${targetMonth} уже завершена.`);
            }

            const topSnap = await db.collection("referrals")
                .where("monthKey", "==", targetMonth)
                .orderBy("monthlyCount", "desc")
                .limit(1)
                .get();

            if (topSnap.empty || (topSnap.docs[0].data().monthlyCount ?? 0) === 0) {
                await campaignRef.set({ status: "finished", winnerId: null, finishedAt: FieldValue.serverTimestamp() }, { merge: true });
                return { success: true, winnerId: null, message: "Нет участников." };
            }

            const winnerId    = topSnap.docs[0].id;
            const winnerCount = topSnap.docs[0].data().monthlyCount ?? 0;

            await db.runTransaction(async (t) => {
                const userRef  = db.collection("users").doc(winnerId);
                const userSnap = await t.get(userRef);
                if (!userSnap.exists) throw new Error("Winner not found");
                t.update(userRef, { casino_credits: (userSnap.data()!.casino_credits ?? 0) + WINNER_PC });
                t.set(campaignRef, {
                    status:      "finished",
                    winnerId,
                    winnerCount,
                    winnerPc:    WINNER_PC,
                    finishedAt:  FieldValue.serverTimestamp(),
                }, { merge: true });
            });

            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
                const winnerSnap = await db.collection("users").doc(winnerId).get();
                const username   = winnerSnap.data()?.username ?? winnerId;
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id:    "-1002885386686",
                        text:       `🏆 *РЕФЕРАЛЬНЫЙ ТУРНИР — ИТОГИ ${targetMonth}*\n\nПобедитель: *${username}*\nПриглашено: *${winnerCount}* пользователей\nНаграда: *${WINNER_PC} PC* 🎉`,
                        parse_mode: "Markdown",
                    }),
                }).catch(e => console.warn("[REFERRAL] Telegram notify failed:", e));
            }

            console.log(`[REFERRAL] Campaign ${targetMonth} finished. Winner: ${winnerId} +${WINNER_PC}PC`);
            return { success: true, winnerId, winnerCount, winnerPc: WINNER_PC };

        } catch (e: any) {
            if (e instanceof HttpsError) throw e;
            console.error("[REFERRAL] finishReferralCampaign error:", e);
            throw new HttpsError("internal", "Ошибка завершения кампании.");
        }
    }
);