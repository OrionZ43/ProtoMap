/**
 * Чёрный список: users/{кто}/blocked/{кого} (решение Ориона 21.10.2026,
 * «как в Telegram»). Кого заблокировали, тот не пишет в личку и не
 * комментирует профиль заблокировавшего, а пуши от него не приходят. Запись
 * ведёт сам владелец — правила в firestore.rules; сервер её только читает.
 */

import * as admin from "firebase-admin";

/** Отказ прямой, без «пользователь ограничил сообщения» — решение Ориона. */
export const BLOCKED_MESSAGE = "Вы в чёрном списке у этого пользователя.";

/**
 * Заблокировал ли owner человека other.
 * @param {string} owner чей список смотрим
 * @param {string} other кого ищем в нём
 * @return {Promise<boolean>} есть ли other в списке owner
 */
export async function isBlockedBy(owner: string, other: string): Promise<boolean> {
  if (!owner || !other || owner === other) return false;
  const entry = await admin.firestore()
    .collection("users").doc(owner)
    .collection("blocked").doc(other)
    .get();
  return entry.exists;
}
