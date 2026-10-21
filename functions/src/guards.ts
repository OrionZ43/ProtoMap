/**
 * Общая «лесенка» проверок для onCall-функций — что закрывает каждая
 * ступенька, расписано в .claude/rules/economy.md.
 *
 * Живёт отдельно от index.ts, чтобы её могли звать модули, которые index.ts
 * сам реэкспортирует (stepper, twoFactorAuth): импорт из index.ts замкнул бы
 * их в цикл. Пока проверки лежали в index.ts, в stepper.ts стоял комментарий
 * «assertNotBanned импортирован», а вызова не было.
 */

import {HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

// ⚠️ Тип НЕ `any` намеренно. Раньше он был `any`, и в пяти местах сюда по
// ошибке передавали `uid` вместо `request`. На строке `request.auth?.token` и
// `request.auth?.uid` дают undefined — то есть обе проверки молча
// пропускались, и гард превращался в пустышку. Компилятор этого не видел
// именно из-за `any`. Структурный тип ниже делает такую передачу ошибкой сборки.
export type BanCheckable = {
  auth?: {uid?: string; token?: Record<string, unknown>};
};

/**
 * Бан по claim в токене и по документу пользователя. Claim не знает о бане,
 * выданном после выпуска токена, а документ — об отозванном токене, поэтому
 * нужны оба.
 * @param {BanCheckable} request запрос onCall
 * @return {Promise<void>}
 */
export async function assertNotBanned(request: BanCheckable): Promise<void> {
  if (request.auth?.token?.banned === true) {
    console.warn(`Block by Token Claim: ${request.auth.uid}`);
    throw new HttpsError("permission-denied", "Account banned (Token).");
  }

  const uid = request.auth?.uid;
  if (uid) {
    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    if (userSnap.exists && userSnap.data()?.isBanned) {
      console.warn(`Block by DB Check: ${uid}`);
      throw new HttpsError("permission-denied", "Account banned (DB).");
    }
  }
}

/**
 * Подтверждённая почта — одноразовые аккаунты не фармят.
 * @param {{token: {email_verified?: boolean}}} auth request.auth
 */
export function assertEmailVerified(
  auth: {token: {email_verified?: boolean}},
): void {
  if (!auth.token.email_verified) {
    throw new HttpsError(
      "permission-denied",
      "Требуется подтверждение почты (Email Verification)."
    );
  }
}

/**
 * Не больше limit действий action за окно windowMs: транзакция по
 * rate_limits/{uid}. Единственное, что стоит между выплатой и скриптом в цикле.
 * @param {string} uid пользователь
 * @param {string} action имя счётчика
 * @param {number} limit сколько действий разрешено в окне
 * @param {number} windowMs окно, мс
 * @return {Promise<void>}
 */
export async function checkGlobalRateLimit(
  uid: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now();
  const limitsRef = admin.firestore().collection("rate_limits").doc(uid);

  await admin.firestore().runTransaction(async (t) => {
    const doc = await t.get(limitsRef);
    const data = doc.data() || {};
    const actions: number[] = data[action] || [];

    // Удаляем записи старше окна
    const recentActions = actions.filter((timestamp) => now - timestamp < windowMs);

    if (recentActions.length >= limit) {
      const waitTime = Math.ceil((recentActions[0] + windowMs - now) / 60000);
      throw new HttpsError(
        "resource-exhausted",
        `Слишком много попыток. Попробуйте через ${waitTime} мин.`
      );
    }

    recentActions.push(now);
    t.set(limitsRef, {
      [action]: recentActions,
      lastUpdate: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}
