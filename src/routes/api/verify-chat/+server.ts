// src/routes/api/verify-chat/+server.ts
// Верифицирует Cloudflare Turnstile токен + HMAC подпись,
// затем записывает telegram_chat_verified = true в Firestore

import { json }         from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { firestoreAdmin }      from '$lib/server/firebase.admin';
import {
    PRIVATE_TURNSTILE_SECRET_KEY,
    PRIVATE_TG_VERIFY_HMAC_SECRET,
} from '$env/static/private';
import * as crypto from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
    let body: { tgId?: string; sig?: string; token?: string };
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Bad request.' }, { status: 400 });
    }

    const { tgId, sig, token } = body;

    // ── 1. Базовая валидация ──────────────────────────────────────
    if (!tgId || !sig || !token) {
        return json({ success: false, error: 'Missing parameters.' }, { status: 400 });
    }

    const tgIdNum = parseInt(tgId, 10);
    if (!Number.isFinite(tgIdNum) || tgIdNum <= 0) {
        return json({ success: false, error: 'Invalid tgId.' }, { status: 400 });
    }

    // ── 2. Проверяем HMAC-подпись (генерируется ботом) ───────────
    // Бот подписывает: HMAC-SHA256(tgId, PRIVATE_TG_VERIFY_HMAC_SECRET)
    // Это гарантирует что ссылку сгенерировал наш бот, а не кто-то другой
    const expectedSig = crypto
        .createHmac('sha256', PRIVATE_TG_VERIFY_HMAC_SECRET)
        .update(tgId)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
        return json({ success: false, error: 'Invalid signature.' }, { status: 403 });
    }

    // ── 3. Верифицируем токен Cloudflare Turnstile ─────────────────
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            secret:   PRIVATE_TURNSTILE_SECRET_KEY,
            response: token,
        }),
    });

    const cfData = await cfRes.json() as { success: boolean; 'error-codes'?: string[] };

    if (!cfData.success) {
        console.warn('[VERIFY-CHAT] Turnstile failed:', cfData['error-codes']);
        return json({ success: false, error: 'Cloudflare check failed. Try again.' }, { status: 400 });
    }

    // ── 4. Находим пользователя в Firestore по telegram_id ────────
    try {
        const snapshot = await firestoreAdmin
            .collection('users')
            .where('telegram_id', '==', tgIdNum)
            .limit(1)
            .get();

        if (snapshot.empty) {
            // Пользователь не привязал аккаунт — сохраняем отдельно,
            // запишем в профиль когда он привяжется через /link
            await firestoreAdmin
                .collection('telegram_chat_pending')
                .doc(String(tgIdNum))
                .set({
                    verifiedAt: firestoreAdmin.FieldValue?.serverTimestamp?.() ?? new Date(),
                    tgId:       tgIdNum,
                });
            console.log(`[VERIFY-CHAT] No linked account for tgId=${tgIdNum}, saved to pending.`);
        } else {
            await snapshot.docs[0].ref.update({
                telegram_chat_verified:    true,
                telegram_chat_verified_at: new Date(),
            });
            console.log(`[VERIFY-CHAT] Verified uid=${snapshot.docs[0].id} tgId=${tgIdNum}`);
        }

        return json({ success: true });

    } catch (e) {
        console.error('[VERIFY-CHAT] Firestore error:', e);
        return json({ success: false, error: 'Server error.' }, { status: 500 });
    }
};