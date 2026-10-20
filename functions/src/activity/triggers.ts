/**
 * Триггеры журнала действий: всё, что меняется в базе, — в `activity_log`.
 *
 * Все — «с контекстом авторизации»: событие несёт authType/authId того, кто
 * записал документ. Для баланса это главное: изменение от нашего сервера
 * объясняется пометкой econ_op, а прямая запись (приложение, консоль, скрипт)
 * помечается и уходит Ориону в Telegram (notify.ts).
 *
 * Для контента прямая запись — норма: комментарии, посты и метки пишет
 * клиент сам, правила проверяют автора.
 *
 * Регион — регион базы, как у остальных триггеров (см. channelComments.ts).
 */

import {onDocumentWrittenWithAuthContext} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {
  FIRESTORE_REGION, authorOf, describeUserChange, snippet, writeActivity,
} from "./log";

const db = () => admin.firestore();

/**
 * Ник по uid — для документов, где его нет или где его пишет клиент.
 * @param {unknown} uid uid пользователя
 * @return {Promise<string | null>} ник или null
 */
async function usernameOf(uid: unknown): Promise<string | null> {
  if (typeof uid !== "string" || !uid) return null;
  const snap = await db().collection("users").doc(uid).get();
  return snap.exists ? String(snap.get("username") ?? "") || null : null;
}

/**
 * Текст сообщения или пометка вложения.
 * @param {FirebaseFirestore.DocumentData} d данные сообщения
 * @return {string | null} фрагмент
 */
function contentText(d: FirebaseFirestore.DocumentData): string | null {
  switch (d.type) {
  case "IMAGE": return "[фото]";
  case "VOICE": return "[голосовое]";
  case "STICKER": return "[стикер]";
  default: return snippet(d.text) ?? (d.image ? "[фото]" : d.voiceMessage ? "[голосовое]" : null);
  }
}

/** Баланс, вещи, бан, роль, профиль, создание и удаление аккаунта. */
export const activityOnUserWrite = onDocumentWrittenWithAuthContext(
  {document: "users/{uid}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const entry = describeUserChange(
      event.params.uid, before, after, authorOf(event.authType, event.authId));
    if (entry) await writeActivity(entry, event.id);
  }
);

/** Список админов: любое изменение — сразу Ориону. */
export const activityOnAdminWrite = onDocumentWrittenWithAuthContext(
  {document: "admins/{adminId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const uid = event.params.adminId;
    await writeActivity({
      group: "admin",
      kind: !before ? "admins_added" : !after ? "admins_removed" : "admins_changed",
      uid: null,
      target: uid,
      targetName: await usernameOf(uid.trim()),
      text: snippet((after ?? before)?.role),
      author: authorOf(event.authType, event.authId),
      alert: true,
    }, event.id);
  }
);

/** Комментарии в профилях. Лайки (обновления) не пишутся. */
export const activityOnProfileComment = onDocumentWrittenWithAuthContext(
  {document: "users/{profileUid}/comments/{commentId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    if (before && after) return;
    const doc = (after ?? before)!;
    const profileUid = event.params.profileUid;
    await writeActivity({
      group: "content",
      kind: after ? "profile_comment" : "profile_comment_deleted",
      uid: String(doc.author_uid ?? "") || null,
      username: await usernameOf(doc.author_uid),
      target: profileUid,
      targetName: await usernameOf(profileUid),
      text: snippet(doc.text),
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/** Общий чат: только новые сообщения. */
export const activityOnChatMessage = onDocumentWrittenWithAuthContext(
  {document: "global_chat/{messageId}", region: FIRESTORE_REGION},
  async (event) => {
    if (event.data?.before?.exists || !event.data?.after?.exists) return;
    const d = event.data.after.data()!;
    await writeActivity({
      group: "content",
      kind: "chat",
      uid: String(d.author_uid ?? "") || null,
      username: await usernameOf(d.author_uid),
      text: contentText(d),
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/** Каналы: создание и удаление. Счётчики и превью — не действия. */
export const activityOnChannelWrite = onDocumentWrittenWithAuthContext(
  {document: "channels/{channelId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    if (before && after) return;
    const doc = (after ?? before)!;
    await writeActivity({
      group: "content",
      kind: after ? "channel_created" : "channel_deleted",
      uid: String(doc.ownerUid ?? "") || null,
      username: await usernameOf(doc.ownerUid),
      text: snippet(doc.name),
      ref: event.params.channelId,
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/** Посты каналов: публикация и удаление (в том числе мягкое — is_deleted). */
export const activityOnChannelPost = onDocumentWrittenWithAuthContext(
  {document: "channels/{channelId}/posts/{postId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const created = !before && after && after.is_deleted !== true;
    const deleted = (before && !after && before.is_deleted !== true) ||
      (before && after && before.is_deleted !== true && after.is_deleted === true);
    if (!created && !deleted) return;
    const doc = (after ?? before)!;
    const channel = await db().collection("channels").doc(event.params.channelId).get();
    await writeActivity({
      group: "content",
      kind: created ? "channel_post" : "channel_post_deleted",
      uid: String(doc.author_uid ?? "") || null,
      username: await usernameOf(doc.author_uid),
      text: contentText(doc),
      ref: String(channel.get("name") ?? "") || event.params.channelId,
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/**
 * Комментарии под постами каналов. Те же пути занимают сообщения обычных
 * групп — их не пишем: это закрытая переписка.
 */
export const activityOnChannelComment = onDocumentWrittenWithAuthContext(
  {document: "groups/{groupId}/topics/{topicId}/messages/{messageId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const created = !before && after && after.is_deleted !== true;
    const deleted = before && after && before.is_deleted !== true && after.is_deleted === true;
    if (!created && !deleted) return;

    const group = await db().collection("groups").doc(event.params.groupId).get();
    const channelId = group.get("linkedChannelId");
    if (group.get("isTechnical") !== true || typeof channelId !== "string" || !channelId) return;
    const channel = await db().collection("channels").doc(channelId).get();

    const doc = after!;
    await writeActivity({
      group: "content",
      kind: created ? "channel_comment" : "channel_comment_deleted",
      uid: String(doc.author_uid ?? "") || null,
      username: await usernameOf(doc.author_uid),
      text: contentText(doc),
      ref: String(channel.get("name") ?? "") || channelId,
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/** Жалобы. Сами жалобы уже уходят в чат админов (reportContent). */
export const activityOnReport = onDocumentWrittenWithAuthContext(
  {document: "reports/{reportId}", region: FIRESTORE_REGION},
  async (event) => {
    if (event.data?.before?.exists || !event.data?.after?.exists) return;
    const d = event.data.after.data()!;
    await writeActivity({
      group: "moderation",
      kind: "report",
      uid: String(d.reporterUid ?? "") || null,
      username: await usernameOf(d.reporterUid),
      target: String(d.profileOwnerUid ?? "") || null,
      targetName: await usernameOf(d.profileOwnerUid),
      text: snippet(`${d.type ?? ""}: ${d.reason ?? ""}`),
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/** Метки на карте — только город, без координат. */
export const activityOnLocation = onDocumentWrittenWithAuthContext(
  {document: "locations/{locationId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const doc = (after ?? before)!;
    if (before && after && before.city === after.city &&
        before.latitude === after.latitude && before.longitude === after.longitude) {
      return;
    }
    await writeActivity({
      group: "map",
      kind: !before ? "location_added" : !after ? "location_removed" : "location_moved",
      uid: String(doc.user_id ?? "") || null,
      username: await usernameOf(doc.user_id),
      text: snippet(doc.city),
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);

/** Витрина: любое изменение товара — сразу Ориону (цена решает экономику). */
export const activityOnShopItem = onDocumentWrittenWithAuthContext(
  {document: "shop_items/{itemId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const price = (d?: FirebaseFirestore.DocumentData) => (d ? d.price ?? "—" : "—");
    await writeActivity({
      group: "admin",
      kind: !before ? "shop_added" : !after ? "shop_removed" : "shop_changed",
      uid: null,
      text: snippet(before && after ? `цена ${price(before)} → ${price(after)}` : `цена ${price(after ?? before)}`),
      ref: event.params.itemId,
      author: authorOf(event.authType, event.authId),
      alert: true,
    }, event.id);
  }
);

/** Новости. */
export const activityOnNews = onDocumentWrittenWithAuthContext(
  {document: "news/{newsId}", region: FIRESTORE_REGION},
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const doc = (after ?? before)!;
    await writeActivity({
      group: "admin",
      kind: !before ? "news_added" : !after ? "news_removed" : "news_changed",
      uid: null,
      text: snippet(doc.title ?? doc.title_ru ?? doc.text),
      ref: event.params.newsId,
      author: authorOf(event.authType, event.authId),
    }, event.id);
  }
);
