import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';
import * as crypto from 'crypto';

if (!admin.apps.length) {
	admin.initializeApp();
}

const db = admin.firestore();

export const toggle2FA = onCall(
	{
		region: 'us-central1',
		secrets: ['TELEGRAM_BOT_TOKEN']
	},
	async (request) => {
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
		const newState = !currentState;
		await userRef.update({ is2FAEnabled: newState });

		if (newState) {
			const botToken = process.env.TELEGRAM_BOT_TOKEN;
			if (botToken) {
				const message = `🛡 <b>Двухфакторная аутентификация включена</b>\n\nТеперь коды для входа в ваш аккаунт будут приходить сюда.`;
				try {
					await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							chat_id: userData.telegram_id,
							text: message,
							parse_mode: 'HTML'
						})
					});
				} catch (e) {
					console.error('Failed to send 2FA toggle notification', e);
				}
			}
		}

		return { success: true, is2FAEnabled: newState };
	}
);

export const send2FACode = onCall(
	{
		region: 'us-central1',
		secrets: ['TELEGRAM_BOT_TOKEN']
	},
	async (request) => {
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

		const codeRef = db.collection('2fa_codes').doc(uid);
		const codeSnap = await codeRef.get();

		if (codeSnap.exists) {
			const lastSentAt = codeSnap.data()?.lastSentAt;
			if (lastSentAt && Date.now() - lastSentAt.toMillis() < 60000) {
				throw new HttpsError('resource-exhausted', 'Подождите минуту');
			}
		}

		const code = crypto.randomInt(10000, 100000).toString();
		const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

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

		const rawReq = request.rawRequest;
		const ip =
			rawReq?.headers['x-forwarded-for']?.toString().split(',')[0] ||
			rawReq?.headers['fastly-client-ip']?.toString() ||
			'Неизвестный IP';
		const country =
			rawReq?.headers['x-vercel-ip-country']?.toString() ||
			rawReq?.headers['cf-ipcountry']?.toString() ||
			'';
		const city =
			rawReq?.headers['x-vercel-ip-city']?.toString() ||
			rawReq?.headers['cf-ipcity']?.toString() ||
			'';

		let locationStr = ip;
		if (city || country) {
			const geo = [city, country].filter(Boolean).join(', ');
			locationStr += ` (${geo})`;
		}

		const message = `Попытка входа в аккаунт ProtoMap.
IP: <b>${locationStr}</b>

Код для входа: <tg-spoiler><b>${code}</b></tg-spoiler>

❗️ Не давайте код никому, даже если его требуют от имени администрации!
Этот код используется для входа в Ваш аккаунт. Он не может быть использован для чего-либо ещё.

Если Вы не запрашивали код для входа, проигнорируйте это сообщение.`;

		try {
			const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chat_id: userData.telegram_id,
					text: message,
					parse_mode: 'HTML'
				})
			});

			if (!response.ok) {
				console.error('Failed to send 2FA code to Telegram', await response.text());
				throw new HttpsError('internal', 'Failed to send message via Telegram');
			}
		} catch (e) {
			console.error('Telegram API error', e);
			throw new HttpsError('internal', 'Failed to communicate with Telegram API');
		}

		return { success: true };
	}
);

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

	if (codeData?.expiresAt.toMillis() < Date.now()) {
		await codeRef.delete();
		throw new HttpsError('deadline-exceeded', 'Код устарел');
	}

	if (codeData?.attempts <= 0) {
		await codeRef.delete();
		throw new HttpsError('resource-exhausted', 'Исчерпан лимит попыток. Запросите новый код.');
	}

	if (codeData?.code === providedCode) {
		await codeRef.delete();
		await db.collection('2fa_cleared').doc(uid).set({
			clearedAt: admin.firestore.Timestamp.now()
		});
		return { success: true };
	} else {
		await codeRef.update({ attempts: admin.firestore.FieldValue.increment(-1) });
		throw new HttpsError('invalid-argument', 'Неверный код');
	}
});
