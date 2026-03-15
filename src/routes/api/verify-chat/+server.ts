// src/routes/api/verify-chat/+server.ts

import { json }              from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { firestoreAdmin }    from '$lib/server/firebase.admin';
import {
    PRIVATE_TURNSTILE_SECRET_KEY,
    PRIVATE_TG_VERIFY_HMAC_SECRET,
    TELEGRAM_BOT_TOKEN,
} from '$env/static/private';
import * as crypto from 'crypto';

// ID чата @proto_map — тот же что в telegramBot.ts
const PROTO_MAP_CHAT_ID = -1002885386686;

/** Снимаем ограничения через Bot API — даём полные права участника */
async function unlockChatMember(tgId: number): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/restrictChatMember`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            chat_id:     PROTO_MAP_CHAT_ID,
            user_id:     tgId,
            permissions: {
                can_send_messages:          true,
                can_send_audios:            true,
                can_send_documents:         true,
                can_send_photos:            true,
                can_send_videos:            true,
                can_send_other_messages:    true,
                can_add_web_page_previews:  true,
                can_invite_users:           true,
            },
        }),
    });
}

/** Удаляем приветственное сообщение бота — оно больше не нужно */
async function deleteBotMessage(tgId: number): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
        // Ищем messageId который бот сохранил при отправке приглашения
        const pendingRef = firestoreAdmin
            .collection('telegram_chat_pending_msg')
            .doc(String(tgId));
        const snap = await pendingRef.get();
        if (!snap.exists) return;

        const { messageId } = snap.data()!;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ chat_id: PROTO_MAP_CHAT_ID, message_id: messageId }),
        });
        await pendingRef.delete();
    } catch (e) {
        // Не критично если не удалилось
    }
}


/** Отправляем приветственное сообщение после верификации */
async function sendWelcomeMessage(tgId: number, snapshot: FirebaseFirestore.QuerySnapshot | null): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
        // Берём имя из Firestore если аккаунт привязан
        let displayName = `[tg://user?id=${tgId}](tg://user?id=${tgId})`;
        if (snapshot && !snapshot.empty) {
            const userData = snapshot.docs[0].data();
            const name = userData.telegram_username || userData.username;
            if (name) displayName = `[${name}](tg://user?id=${tgId})`;
        }
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                chat_id:    PROTO_MAP_CHAT_ID,
                text:       `✅ ${displayName} прошёл верификацию Cloudflare и теперь полноправный участник сети ProtoMap. Добро пожаловать! 🦾`,
                parse_mode: 'Markdown',
            }),
        });
    } catch (e) {
        // не критично
    }
}

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

    // ── 2. HMAC-подпись ───────────────────────────────────────────
    const expectedSig = crypto
        .createHmac('sha256', PRIVATE_TG_VERIFY_HMAC_SECRET)
        .update(tgId)
        .digest('hex');

    // timingSafeEqual требует одинаковую длину буферов
    const sigBuf      = Buffer.from(sig.padEnd(expectedSig.length, ' '));
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return json({ success: false, error: 'Invalid signature.' }, { status: 403 });
    }

    // ── 3. Cloudflare Turnstile ───────────────────────────────────
    const cfRes  = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
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

    // ── 4. Firestore + разблокировка ─────────────────────────────
    try {
        const snapshot = await firestoreAdmin
            .collection('users')
            .where('telegram_id', '==', tgIdNum)
            .limit(1)
            .get();

        if (snapshot.empty) {
            // Аккаунт ещё не привязан — сохраняем pending,
            // флаг перенесётся при /link
            await firestoreAdmin
                .collection('telegram_chat_pending')
                .doc(String(tgIdNum))
                .set({ verifiedAt: new Date(), tgId: tgIdNum });
            console.log(`[VERIFY-CHAT] No linked account for tgId=${tgIdNum}, saved to pending.`);
        } else {
            await snapshot.docs[0].ref.update({
                telegram_chat_verified:    true,
                telegram_chat_verified_at: new Date(),
            });
            console.log(`[VERIFY-CHAT] Verified uid=${snapshot.docs[0].id} tgId=${tgIdNum}`);
        }

        // ✅ Снимаем ограничения в чате — человек может писать
        await unlockChatMember(tgIdNum);

        // Удаляем сообщение с кнопкой и шлём приветствие
        await deleteBotMessage(tgIdNum);
        await sendWelcomeMessage(tgIdNum, snapshot.empty ? null : snapshot);

        return json({ success: true });

    } catch (e) {
        console.error('[VERIFY-CHAT] Firestore error:', e);
        return json({ success: false, error: 'Server error.' }, { status: 500 });
    }
};