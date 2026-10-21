import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';
import * as crypto from 'crypto';
import { assertNotBanned, checkGlobalRateLimit } from './guards';

if (!admin.apps.length) {
	admin.initializeApp();
}

const db = admin.firestore();

/**
 * Для чего запрошен код. Текст в Telegram говорит человеку, на что он отдаёт
 * код, поэтому код, запрошенный для одного действия, другое не принимает.
 */
type CodePurpose = 'login' | 'disable_2fa';

function normalizePurpose(raw: unknown): CodePurpose {
	return raw === 'disable_2fa' ? 'disable_2fa' : 'login';
}

async function sendTelegram(chatId: unknown, text: string): Promise<void> {
	const botToken = process.env.TELEGRAM_BOT_TOKEN;
	if (!botToken) return;
	try {
		await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
		});
	} catch (e) {
		console.error('Failed to send 2FA notification', e);
	}
}

/**
 * Проверяет код из 2fa_codes/{uid} и гасит его. Неверный код снимает одну
 * из трёх попыток. Всё в транзакции: раньше чтение и списание попытки шли
 * отдельно, и параллельные запросы могли проверить больше трёх кодов.
 */
async function consumeCode(uid: string, providedCode: unknown, purpose: CodePurpose): Promise<void> {
	if (!providedCode || typeof providedCode !== 'string') {
		throw new HttpsError('invalid-argument', 'Код должен быть строкой');
	}

	const codeRef = db.collection('2fa_codes').doc(uid);
	const outcome = await db.runTransaction(async (t) => {
		const snap = await t.get(codeRef);
		if (!snap.exists) return 'missing';
		const data = snap.data()!;
		if ((data.purpose ?? 'login') !== purpose) return 'wrong_purpose';
		if (data.expiresAt.toMillis() < Date.now()) {
			t.delete(codeRef);
			return 'expired';
		}
		if (data.attempts <= 0) {
			t.delete(codeRef);
			return 'exhausted';
		}
		if (data.code !== providedCode) {
			t.update(codeRef, { attempts: admin.firestore.FieldValue.increment(-1) });
			return 'wrong';
		}
		t.delete(codeRef);
		return 'ok';
	});

	switch (outcome) {
		case 'ok':
			return;
		case 'missing':
			throw new HttpsError('not-found', 'Код не найден или истек срок действия');
		case 'wrong_purpose':
			throw new HttpsError('failed-precondition', 'Этот код запрошен для другого действия. Запросите новый.');
		case 'expired':
			throw new HttpsError('deadline-exceeded', 'Код устарел');
		case 'exhausted':
			throw new HttpsError('resource-exhausted', 'Исчерпан лимит попыток. Запросите новый код.');
		default:
			throw new HttpsError('invalid-argument', 'Неверный код');
	}
}

/**
 * Включает или выключает 2FA (переключатель). Выключение — только с кодом из
 * Telegram, запрошенным через send2FACode({ purpose: 'disable_2fa' }):
 * toggle2FA({ code }). 2FA нужна как раз на случай, когда пароль утёк, а до
 * 21.10.2026 её снимали одним паролем — вход на сайте (сессия Firebase есть
 * ещё до ввода кода) и вызов этой функции из консоли.
 */
export const toggle2FA = onCall(
	{
		secrets: ['TELEGRAM_BOT_TOKEN']
	},
	async (request) => {
		if (request.app == undefined) {
			throw new HttpsError('failed-precondition', 'App Check required.');
		}
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated.');
		}

		const uid = request.auth.uid;
		await assertNotBanned(request);
		await checkGlobalRateLimit(uid, 'toggle2FA', 10, 60 * 60 * 1000);

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

		if (!newState) {
			await consumeCode(uid, request.data?.code, 'disable_2fa');
		}

		await userRef.update({ is2FAEnabled: newState });

		await sendTelegram(
			userData.telegram_id,
			newState
				? `🛡 <b>Двухфакторная аутентификация включена</b>\n\nТеперь коды для входа в ваш аккаунт будут приходить сюда.`
				: `🔓 <b>Двухфакторная аутентификация отключена</b>\n\nЕсли это были не вы — смените пароль и включите 2FA снова.`
		);

		return { success: true, is2FAEnabled: newState };
	}
);

export const send2FACode = onCall(
	{
		secrets: ['TELEGRAM_BOT_TOKEN']
	},
	async (request) => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated.');
		}

		const uid = request.auth.uid;
		const purpose = normalizePurpose(request.data?.purpose);
		const userRef = db.collection('users').doc(uid);
		const userSnap = await userRef.get();

		if (!userSnap.exists) {
			throw new HttpsError('not-found', 'User not found.');
		}

		const userData = userSnap.data();
		if (!userData?.telegram_id) {
			throw new HttpsError('failed-precondition', 'Нужно привязать Telegram');
		}
		if (purpose === 'disable_2fa' && !userData.is2FAEnabled) {
			throw new HttpsError('failed-precondition', '2FA уже выключена');
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
			purpose,
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

		const message =
			purpose === 'disable_2fa'
				? `Запрос на отключение двухфакторной аутентификации ProtoMap.
IP: <b>${locationStr}</b>

Код для отключения 2FA: <tg-spoiler><b>${code}</b></tg-spoiler>

❗️ Не давайте код никому, даже если его требуют от имени администрации!
Если отключать 2FA собирались не Вы — не вводите код и смените пароль: его знает кто-то ещё.`
				: `Попытка входа в аккаунт ProtoMap.
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

export const verify2FACode = onCall( async (request) => {
	if (!request.auth) {
		throw new HttpsError('unauthenticated', 'User must be authenticated.');
	}

	const uid = request.auth.uid;
	await consumeCode(uid, request.data?.code, 'login');
	await db.collection('2fa_cleared').doc(uid).set({
		clearedAt: admin.firestore.Timestamp.now()
	});
	return { success: true };
});
