/**
 * Пуш-уведомления о комментариях.
 *
 *  - profile_comment        — кто-то оставил комментарий в вашем профиле;
 *  - profile_comment_reply  — кто-то ответил на ваш комментарий в профиле
 *                             (вашем или чужом);
 *  - channel_comment_reply  — кто-то ответил на ваш комментарий под постом
 *                             канала.
 *
 * Сообщения только data (без блока notification). Так уведомление всегда
 * строит Android-клиент (MyFirebaseMessagingService): он локализует текст,
 * соблюдает пользовательские настройки уведомлений и вешает на него
 * PendingIntent, который одним тапом открывает нужный экран. С блоком
 * notification в фоне его рисовала бы система, а тап просто запускал бы
 * приложение без перехода и без учёта настроек.
 *
 * title/body в data — фолбэк для старых версий клиента: они берут текст
 * оттуда и показывают его как есть.
 *
 * Отправка уведомления никогда не роняет вызвавшую операцию: комментарий
 * важнее пуша, поэтому все ошибки здесь логируются и глотаются.
 */

import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {getMessaging} from "firebase-admin/messaging";
import {isBlockedBy} from "./blocklist";

const db = () => admin.firestore();

/** Регион базы Firestore — триггеры живут там же (см. channelComments.ts). */
const FIRESTORE_REGION = "europe-central2";

const PREVIEW_LENGTH = 120;

/** Коды ошибок FCM, после которых токен больше не годится. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Превью текста комментария для уведомления.
 * @param {unknown} text текст
 * @return {string} обрезанный текст
 */
function preview(text: unknown): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > PREVIEW_LENGTH ? s.slice(0, PREVIEW_LENGTH - 1) + "…" : s;
}

/**
 * Превью сообщения в обсуждении канала с учётом медиа.
 * @param {FirebaseFirestore.DocumentData} msg данные сообщения
 * @return {string} превью
 */
function messagePreview(msg: FirebaseFirestore.DocumentData): string {
  switch (msg.type) {
  case "IMAGE": return "📷 Фото";
  case "VOICE": return "🎤 Голосовое";
  case "STICKER": return "✨ Стикер";
  default: return preview(msg.text);
  }
}

/** Чем закончилась отправка пуша. */
export type PushStatus =
  "sent" | "no_token" | "skipped" | "token_cleaned" | "failed";

/**
 * Отправляет data-пуш пользователю. Токен берётся из
 * users/{uid}/private/data — его читает только владелец. Запасной — поле
 * users/{uid}.fcmToken: его пишет старое приложение, а сам документ
 * пользователя читает кто угодно. Мёртвый токен стирается, и пуш уходит на
 * следующий.
 *
 * channelId в data — id канала ProtoMap (channel_comment_reply). До
 * 21.10.2026 сюда же поверх писался id канала уведомлений Android, и тап по
 * пушу не открывал пост. Канал уведомлений приложения выбирают сами.
 *
 * fromUid — кто вызвал пуш: от того, кого получатель внёс в чёрный список,
 * пуши не приходят никакие.
 * @param {string} uid получатель
 * @param {Record<string, string>} data полезная нагрузка
 * @param {string} fromUid кто вызвал пуш
 * @return {Promise<PushStatus>} итог отправки
 */
export async function sendPushToUser(
  uid: string,
  data: Record<string, string>,
  fromUid?: string,
): Promise<PushStatus> {
  try {
    const userRef = db().collection("users").doc(uid);
    const user = await userRef.get();
    if (!user.exists || user.get("isBanned") === true) return "skipped";
    if (fromUid && await isBlockedBy(uid, fromUid)) return "skipped";

    const privateRef = userRef.collection("private").doc("data");
    const candidates: [FirebaseFirestore.DocumentReference, unknown][] = [
      [privateRef, (await privateRef.get()).get("fcmToken")],
      [userRef, user.get("fcmToken")],
    ];

    let cleaned = false;
    for (const [tokenRef, token] of candidates) {
      if (typeof token !== "string" || !token) continue;
      try {
        await getMessaging().send({
          token,
          data,
          android: {priority: "high", ttl: 24 * 60 * 60 * 1000},
        });
        return "sent";
      } catch (e) {
        const code = (e as {code?: string}).code ?? "";
        if (!DEAD_TOKEN_CODES.has(code)) throw e;
        await tokenRef.update({fcmToken: null}).catch(() => undefined);
        cleaned = true;
      }
    }
    return cleaned ? "token_cleaned" : "no_token";
  } catch (e) {
    console.error(`[Notifications] push to ${uid} failed:`, e);
    return "failed";
  }
}

export interface ProfileCommentEvent {
  profileUid: string;
  commentId: string;
  authorUid: string;
  authorName: string;
  text: string;
  /** Корневой комментарий ветки (как его хранит клиент). */
  parentId?: string | null;
  /**
   * Комментарий, на который отвечали. В ветке всего один уровень вложенности,
   * и ответ на ответ клиент сохраняет с parentId корня — без этого поля пуш
   * ушёл бы автору корня, а не тому, кому отвечали.
   */
  replyToCommentId?: string | null;
}

/**
 * Пуши о новом комментарии в профиле: владельцу профиля и автору
 * комментария, на который ответили. Один человек получает не больше одного
 * пуша; себе пуши не шлём.
 * @param {ProfileCommentEvent} ev событие
 * @return {Promise<void>}
 */
export async function notifyProfileComment(
  ev: ProfileCommentEvent,
): Promise<void> {
  try {
    const comments = db().collection("users").doc(ev.profileUid)
      .collection("comments");

    let repliedAuthor: string | null = null;
    const targetId = ev.replyToCommentId || ev.parentId;
    if (targetId) {
      const target = await comments.doc(String(targetId)).get();
      const uid = target.get("author_uid");
      if (typeof uid === "string" && uid) repliedAuthor = uid;
    }

    const base = {
      profileUid: ev.profileUid,
      commentId: ev.commentId,
      actorUid: ev.authorUid,
      actorName: ev.authorName,
      text: preview(ev.text),
    };
    const sends: Promise<PushStatus>[] = [];

    if (repliedAuthor && repliedAuthor !== ev.authorUid) {
      sends.push(sendPushToUser(repliedAuthor, {
        ...base,
        type: "profile_comment_reply",
        title: `${ev.authorName} ответил(а) на ваш комментарий`,
        body: base.text,
      }, ev.authorUid));
    }

    // Владелец профиля, если он не автор и уже не получил пуш об ответе
    if (ev.profileUid !== ev.authorUid && ev.profileUid !== repliedAuthor) {
      sends.push(sendPushToUser(ev.profileUid, {
        ...base,
        type: "profile_comment",
        title: `${ev.authorName} оставил(а) комментарий в профиле`,
        body: base.text,
      }, ev.authorUid));
    }

    await Promise.all(sends);
  } catch (e) {
    console.error("[Notifications] notifyProfileComment failed:", e);
  }
}

/**
 * Ответ на комментарий под постом канала → пуш автору исходного комментария.
 *
 * Только для групп комментариев каналов: ссылки группа ↔ канал проверяются
 * в обе стороны, как в channelComments.ts. reply_to_id пишет клиент, поэтому
 * адресата берём из самого исходного сообщения, а не из полей ответа.
 */
export const onChannelCommentReplyCreated = onDocumentCreated(
  {
    document: "groups/{groupId}/topics/{topicId}/messages/{messageId}",
    region: FIRESTORE_REGION,
  },
  async (event) => {
    const msg = event.data?.data();
    if (!msg || msg.is_deleted === true) return;
    const replyToId = msg.reply_to_id;
    const authorUid = msg.author_uid;
    if (typeof replyToId !== "string" || !replyToId) return;
    if (typeof authorUid !== "string" || !authorUid) return;

    const {groupId, topicId, messageId} = event.params;

    const group = await db().collection("groups").doc(groupId).get();
    const channelId = group.get("linkedChannelId");
    if (group.get("isTechnical") !== true || typeof channelId !== "string" ||
        !channelId) {
      return;
    }
    const channel = await db().collection("channels").doc(channelId).get();
    if (!channel.exists || channel.get("linkedGroupId") !== groupId) return;

    const original = await db().collection("groups").doc(groupId)
      .collection("topics").doc(topicId)
      .collection("messages").doc(replyToId).get();
    const recipient = original.get("author_uid");
    if (!original.exists || original.get("is_deleted") === true) return;
    if (typeof recipient !== "string" || !recipient ||
        recipient === authorUid) {
      return;
    }

    // Имя — из профиля автора: author_username пишет клиент, а правила
    // проверяют только author_uid, так что в пуш можно было подставить чужое имя.
    const author = await db().collection("users").doc(authorUid).get();
    const actorName = String(author.get("username") || "Кто-то");
    const text = messagePreview(msg);
    const channelName = String(channel.get("name") || "");

    await sendPushToUser(recipient, {
      type: "channel_comment_reply",
      channelId,
      postId: topicId,
      groupId,
      commentId: messageId,
      actorUid: authorUid,
      actorName,
      channelName,
      text,
      title: `${actorName} ответил(а) на ваш комментарий`,
      body: text,
    }, authorUid);
  }
);
