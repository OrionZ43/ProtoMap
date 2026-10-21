/**
 * Группы на сервере: приглашения (createGroupInvite, joinGroupByInvite) и
 * уборка после удаления группы (onGroupDeleted).
 *
 * Вступить в приватную группу клиент сам не может: правила разрешают создать
 * свою карточку участника только владельцу и в публичной группе, а коллекция
 * group_invites клиентам закрыта целиком. Поэтому код создаёт и проверяет
 * сервер, и он же добавляет участника. Формат — тот, что задумывало старое
 * приложение (его приглашения есть в базе): group_invites/{КОД} =
 * { groupId, createdBy, createdAt, expiresAt }, на группе — копия inviteCode,
 * inviteExpiresAt, inviteCreatedBy.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentDeleted} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as crypto from "crypto";
import {
  assertNotBanned,
  checkGlobalRateLimit,
  type BanCheckable,
} from "./guards";
import {FIRESTORE_REGION} from "./activity/log";

const db = () => admin.firestore();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Без похожих символов (O и 0, I и 1): код диктуют и переписывают руками. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const ALREADY_EXISTS = 6;

/**
 * Новый код приглашения.
 * @return {string} 6 символов верхнего регистра
 */
function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * assertNotBanned с причиной в details — приложения показывают свой текст.
 * @param {BanCheckable} request запрос onCall
 * @return {Promise<void>}
 */
async function assertNotBannedWithReason(request: BanCheckable): Promise<void> {
  try {
    await assertNotBanned(request);
  } catch (e) {
    if (e instanceof HttpsError) {
      throw new HttpsError(e.code, e.message, {reason: "banned"});
    }
    throw e;
  }
}

/**
 * Код приглашения в группу. Только владелец или админ группы. Если у группы
 * уже есть неистёкший код — возвращается он.
 */
export const createGroupInvite = onCall(async (request) => {
  if (request.app == undefined) {
    throw new HttpsError("failed-precondition", "App Check required.");
  }
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  await assertNotBannedWithReason(request);
  await checkGlobalRateLimit(uid, "group_invite", 20, HOUR_MS);

  const groupId = request.data?.groupId;
  if (typeof groupId !== "string" || !groupId) {
    throw new HttpsError("invalid-argument", "groupId required.");
  }

  const groupRef = db().collection("groups").doc(groupId);
  const [group, member] = await Promise.all([
    groupRef.get(),
    groupRef.collection("members").doc(uid).get(),
  ]);
  if (!group.exists) {
    throw new HttpsError("not-found", "Группа не найдена.",
      {reason: "not_found"});
  }
  if (group.get("ownerUid") !== uid && member.get("role") !== "admin") {
    throw new HttpsError("permission-denied",
      "Приглашать могут только владелец и админы группы.",
      {reason: "not_allowed"});
  }

  const current = group.get("inviteCode");
  const currentExpires = group.get("inviteExpiresAt") as Timestamp | undefined;
  if (typeof current === "string" && currentExpires &&
      currentExpires.toMillis() > Date.now()) {
    const invite = await db().collection("group_invites").doc(current).get();
    if (invite.exists && invite.get("groupId") === groupId) {
      return {code: current, expiresAt: currentExpires.toMillis()};
    }
  }

  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      await db().collection("group_invites").doc(code).create({
        groupId,
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      });
    } catch (e) {
      // Код уже занят другой группой — пробуем следующий
      if ((e as {code?: number}).code === ALREADY_EXISTS) continue;
      throw e;
    }
    await groupRef.update({
      inviteCode: code,
      inviteExpiresAt: expiresAt,
      inviteCreatedBy: uid,
    });
    // Прежний код этой группы истёк — удаляем, чтобы не копились
    if (typeof current === "string" && current !== code) {
      const old = db().collection("group_invites").doc(current);
      if ((await old.get()).get("groupId") === groupId) await old.delete();
    }
    return {code, expiresAt: expiresAt.toMillis()};
  }
  throw new HttpsError("resource-exhausted",
    "Не удалось подобрать код, попробуйте ещё раз.");
});

/**
 * Вступление по коду приглашения (без учёта регистра). Сервер проверяет срок
 * и бан, добавляет в memberUids и создаёт карточку участника с ролью member.
 */
export const joinGroupByInvite = onCall(async (request) => {
  if (request.app == undefined) {
    throw new HttpsError("failed-precondition", "App Check required.");
  }
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  await assertNotBannedWithReason(request);
  // Кодов 32^6 — около миллиарда; при 20 попытках в час подбор невозможен
  await checkGlobalRateLimit(uid, "group_join", 20, HOUR_MS);

  const notFound = () => new HttpsError("not-found",
    "Приглашение не найдено.", {reason: "not_found"});
  const code = String(request.data?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw notFound();

  const inviteRef = db().collection("group_invites").doc(code);
  const userRef = db().collection("users").doc(uid);
  const groupId = await db().runTransaction(async (t) => {
    const invite = await t.get(inviteRef);
    if (!invite.exists) throw notFound();
    const expires = invite.get("expiresAt") as Timestamp | undefined;
    if (!expires || expires.toMillis() <= Date.now()) {
      throw new HttpsError("failed-precondition", "Срок приглашения истёк.",
        {reason: "expired"});
    }

    const gid = String(invite.get("groupId"));
    const groupRef = db().collection("groups").doc(gid);
    const [group, user] = await Promise.all([t.get(groupRef), t.get(userRef)]);
    if (!group.exists) {
      throw new HttpsError("not-found", "Группа не найдена.",
        {reason: "not_found"});
    }
    const members: unknown = group.get("memberUids");
    if (Array.isArray(members) && members.includes(uid)) {
      throw new HttpsError("already-exists", "Вы уже в этой группе.",
        {reason: "already_member", groupId: gid});
    }

    t.update(groupRef, {
      memberUids: FieldValue.arrayUnion(uid),
      memberCount: FieldValue.increment(1),
    });
    // Поля карточки — как у старого приложения
    t.set(groupRef.collection("members").doc(uid), {
      uid,
      username: user.get("username") ?? "",
      avatarUrl: user.get("avatar_url") || null,
      role: "member",
      joinedAt: FieldValue.serverTimestamp(),
    });
    return gid;
  });

  return {groupId};
});

/**
 * Удаление группы — дочищаем всё, что от неё осталось: темы, сообщения и
 * карточки участников, если клиент не удалил их сам, файлы в Storage и коды
 * приглашений. Файлы клиент удалить уже не может: правила Storage ищут
 * владельца в документе группы, а его больше нет.
 */
export const onGroupDeleted = onDocumentDeleted(
  {document: "groups/{groupId}", region: FIRESTORE_REGION, timeoutSeconds: 300},
  async (event) => {
    const {groupId} = event.params;
    await db().recursiveDelete(db().collection("groups").doc(groupId));
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({prefix: `group_media/${groupId}/`});
    await bucket.deleteFiles({prefix: `group_avatars/${groupId}/`});
    const invites = await db().collection("group_invites")
      .where("groupId", "==", groupId).get();
    await Promise.all(invites.docs.map((d) => d.ref.delete()));
    console.log(`[Groups] Группа ${groupId} удалена, ` +
      `кодов приглашений убрано: ${invites.size}`);
  }
);
