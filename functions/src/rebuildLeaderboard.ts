// ===================================================================
// ВРЕМЕННАЯ ФУНКЦИЯ — после использования удалить из index.ts
// Вызвать один раз: firebase functions:call rebuildLeaderboard
// ===================================================================

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const rebuildLeaderboard = onCall(async (request) => {
    // Только для администраторов
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const adminDoc = await db.collection("admins").doc(request.auth.uid).get();
    if (!adminDoc.exists) throw new HttpsError("permission-denied", "Admin only.");

    const monthKey = request.data?.monthKey ?? (() => {
        const now = new Date();
        return `${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    })();

    console.log(`[REBUILD] Building leaderboard for monthKey=${monthKey}`);

    // Читаем все referral-документы с нужным monthKey
    const snap = await db.collection("referrals")
        .where("monthKey", "==", monthKey)
        .orderBy("monthlyCount", "desc")
        .limit(11)
        .get();

    console.log(`[REBUILD] Found ${snap.size} referral docs`);
    snap.docs.forEach(d => console.log(`[REBUILD]`, d.id, JSON.stringify(d.data())));

    if (snap.empty) {
        return { success: false, message: "No referral docs found for this month." };
    }

    const uids = snap.docs.map(d => d.id);

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

    console.log(`[REBUILD] Leaderboard:`, JSON.stringify(leaderboard));

    await db.collection("referral_campaign").doc(monthKey).set({
        leaderboard,
        updatedAt: FieldValue.serverTimestamp(),
        status:    "active",
    }, { merge: true });

    return { success: true, monthKey, entries: leaderboard.length, leaderboard };
});