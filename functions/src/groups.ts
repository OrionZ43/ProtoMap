/**
 * Приглашения в группы: createGroupInvite и joinGroupByInvite.
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
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as crypto from "crypto";
import {assertNotBanned, checkGlobalRateLimit, type BanCheckable} from "./guards";

const db = () => admin.firestore();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Без похожих символов (O и 0, I и 1): код диктуют и переписывают руками. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

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
    if (e instanceof HttpsError) throw new HttpsError(e.code, e.message, {reason: "banned"});
    throw e;
  }
}

/**
 * Код приглашения в группу. Только владелец или админ группы. Если у группы
 * уже есть неистёкший код — возвращается он.
 */
export const createGroupInvite = onCall(async (request) => {
  if (request.app == undefined) throw new HttpsError("failed-precondition", "App Check required.");
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  await assertNotBannedWithReason(request);
  await checkGlobalRateLimit(uid, "group_invite", 20, 60 * 60 * 1000);

  const groupId = request.data?.groupId;
  if (typeof groupId !== "string" || !groupId) {
    throw new HttpsError("invalid-argument", "groupId required.");
  }

  const groupRef = db().collection("groups").doc(groupId);
  const [group, member] = await Promise.all([
    groupRef.get(),
    groupRef.collection("members").doc(uid).get(),
  ]);
  if (!group.exists) throw new HttpsError("not-found", "Группа не найдена.", {reason: "not_found"});
  if (group.get("ownerUid") !== uid && member.get("role") !== "admin") {
    throw new HttpsError("permission-denied", "Приглашать могут только владелец и админы группы.",
      {reason: "not_allowed"});
  }

  const current = group.get("inviteCode");
  const currentExpires = group.get("inviteExpiresAt") as Timestamp | undefined;
  if (typeof current === "string" && currentExpires && currentExpires.toMillis() > Date.now()) {
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
      if ((e as {code?: number}).code === 6) continue; // ALREADY_EXISTS: код занят
      throw e;
    }
    await groupRef.update({inviteCode: code, inviteExpiresAt: expiresAt, inviteCreatedBy: uid});
    return {code, expiresAt: expiresAt.toMillis()};
  }
  throw new HttpsError("resource-exhausted", "Не удалось подобрать код, попробуйте ещё раз.");
});

/**
 * Вступление по коду приглашения (без учёта регистра). Сервер проверяет срок
 * и бан, добавляет в memberUids и создаёт карточку участника с ролью member.
 */
export const joinGroupByInvite = onCall(async (request) => {
  if (request.app == undefined) throw new HttpsError("failed-precondition", "App Check required.");
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  await assertNotBannedWithReason(request);
  // Кодов 32^6 — около миллиарда; при 20 попытках в час подбор невозможен
  await checkGlobalRateLimit(uid, "group_join", 20, 60 * 60 * 1000);

  const code = String(request.data?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new HttpsError("not-found", "Приглашение не найдено.", {reason: "not_found"});
  }

  const inviteRef = db().collection("group_invites").doc(code);
  const userRef = db().collection("users").doc(uid);
  const groupId = await db().runTransaction(async (t) => {
    const invite = await t.get(inviteRef);
    if (!invite.exists) throw new HttpsError("not-found", "Приглашение не найдено.", {reason: "not_found"});
    const expires = invite.get("expiresAt") as Timestamp | undefined;
    if (!expires || expires.toMillis() <= Date.now()) {
      throw new HttpsError("failed-precondition", "Срок приглашения истёк.", {reason: "expired"});
    }

    const gid = String(invite.get("groupId"));
    const groupRef = db().collection("groups").doc(gid);
    const [group, user] = await Promise.all([t.get(groupRef), t.get(userRef)]);
    if (!group.exists) throw new HttpsError("not-found", "Группа не найдена.", {reason: "not_found"});
    const members: unknown = group.get("memberUids");
    if (Array.isArray(members) && members.includes(uid)) {
      throw new HttpsError("already-exists", "Вы уже в этой группе.", {reason: "already_member", groupId: gid});
    }

    t.update(groupRef, {memberUids: FieldValue.arrayUnion(uid), memberCount: FieldValue.increment(1)});
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
