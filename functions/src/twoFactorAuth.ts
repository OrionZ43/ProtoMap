import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

// Используем дефолтный экземпляр admin из index.ts, если он инициализирован
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

export const toggle2FA = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User not found.');
    }

    const userData = userSnap.data();
    if (!userData?.telegram_id) {
        throw new HttpsError('failed-precondition', 'Нужно привязать Telegram');
    }

    const currentState = userData.is2FAEnabled || false;
    await userRef.update({ is2FAEnabled: !currentState });

    return { success: true, is2FAEnabled: !currentState };
});

export const send2FACode = onCall({
    region: 'us-central1',
    secrets: ["TELEGRAM_BOT_TOKEN"]
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User not found.');
    }

    const userData = userSnap.data();
    if (!userData?.telegram_id) {
        throw new HttpsError('failed-precondition', 'Нужно привязать Telegram');
    }

    // Check rate limit
    const codeRef = db.collection('2fa_codes').doc(uid);
    const codeSnap = await codeRef.get();

    if (codeSnap.exists) {
        const lastSentAt = codeSnap.data()?.lastSentAt;
        if (lastSentAt && (Date.now() - lastSentAt.toMillis() < 60000)) {
            throw new HttpsError('resource-exhausted', 'Подождите минуту');
        }
    }

    // Generate 5-digit code
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

    await codeRef.set({
        code: code,
        attempts: 3,
        lastSentAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
         throw new HttpsError('internal', 'Telegram bot token is missing.');
    }

    const message = `Ваш код для входа: ${code}`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: userData.telegram_id,
                text: message
            })
        });

        if (!response.ok) {
            console.error("Failed to send 2FA code to Telegram", await response.text());
            throw new HttpsError('internal', 'Failed to send message via Telegram');
        }
    } catch (e) {
        console.error("Telegram API error", e);
        throw new HttpsError('internal', 'Failed to communicate with Telegram API');
    }

    return { success: true };
});

export const verify2FACode = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const providedCode = request.data.code;

    if (!providedCode || typeof providedCode !== 'string') {
         throw new HttpsError('invalid-argument', 'Код должен быть строкой');
    }

    const codeRef = db.collection('2fa_codes').doc(uid);
    const codeSnap = await codeRef.get();

    if (!codeSnap.exists) {
        throw new HttpsError('not-found', 'Код не найден или истек срок действия');
    }

    const codeData = codeSnap.data();

    // Check expiration
    if (codeData?.expiresAt.toMillis() < Date.now()) {
         await codeRef.delete();
         throw new HttpsError('deadline-exceeded', 'Код устарел');
    }

    if (codeData?.attempts <= 0) {
        await codeRef.delete();
        throw new HttpsError('resource-exhausted', 'Исчерпан лимит попыток. Запросите новый код.');
    }

    if (codeData?.code === providedCode) {
        // Success
        await codeRef.delete();
        return { success: true };
    } else {
        // Decrement attempts
        await codeRef.update({ attempts: admin.firestore.FieldValue.increment(-1) });
        throw new HttpsError('invalid-argument', 'Неверный код');
    }
});
