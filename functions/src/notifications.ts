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
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {getMessaging} from "firebase-admin/messaging";
import {isBlockedBy} from "./blocklist";
import {assertNotBanned, assertEmailVerified} from "./guards";

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
export function preview(text: unknown): string {
  let s = String(text ?? "");
  s = s.replace(/\|\|([^|\n]+?)\|\|/g, "░░░"); // спойлер → ░ (не светим)
  s = s.replace(/\[([^\]\n]+?)\]\([^)\s]+?\)/g, "$1"); // ссылка → её текст
  s = s.replace(/[*~`]/g, ""); // маркеры жирного/курсива/зачёркнутого/кода
  s = s.replace(/\s+/g, " ").trim();
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

/**
 * Пишет документ в ленту users/{recipient}/notifications (Admin SDK, в обход
 * правила `allow create: if false`). Не себе и не от того, кого получатель
 * внёс в чёрный список. Лента получает всё — пользовательские настройки пушей
 * её не фильтруют. expireAt = +60 дней под TTL-политику (её заводят на поле
 * отдельно, в индексах/консоли). Запись никогда не роняет вызвавшую операцию.
 * @param {string} recipientUid получатель
 * @param {string} actorUid инициатор (actor)
 * @param {string} type тип уведомления
 * @param {string} text готовое превью (уже через preview())
 * @param {Record<string, string>} target адресация для перехода по тапу
 * @return {Promise<void>}
 */
export async function writeNotification(
  recipientUid: string,
  actorUid: string,
  type: string,
  text: string,
  target: Record<string, string>,
): Promise<void> {
  try {
    if (!recipientUid || recipientUid === actorUid) return;
    if (await isBlockedBy(recipientUid, actorUid)) return;
    const actor = await db().collection("users").doc(actorUid).get();
    const expireAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    );
    await db().collection("users").doc(recipientUid)
      .collection("notifications").add({
        type,
        actor: {
          uid: actorUid,
          username: String(actor.get("username") || ""),
          avatarUrl: String(actor.get("avatar_url") || ""),
        },
        text,
        target,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt,
      });
  } catch (e) {
    console.error("[Notifications] writeNotification failed:", e);
  }
}

/**
 * Пуш НОВОМУ приложению: токен берём только из users/{uid}/private/data
 * (поле fcmToken), без фолбэка на верхний users.fcmToken старого приложения.
 * Для новых видов (channel_comment, group_reply), которые старое приложение
 * не понимает, — чтобы они на него не уходили. Мёртвый токен стирается.
 * @param {string} uid получатель
 * @param {Record<string, string>} data полезная нагрузка
 * @param {string} fromUid кто вызвал (для чёрного списка)
 * @return {Promise<PushStatus>} итог
 */
export async function sendPushToNewApp(
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
    const token = (await privateRef.get()).get("fcmToken");
    if (typeof token !== "string" || !token) return "no_token";
    try {
      await getMessaging().send({
        token, data,
        android: {priority: "high", ttl: 24 * 60 * 60 * 1000},
      });
      return "sent";
    } catch (e) {
      const code = (e as {code?: string}).code ?? "";
      if (!DEAD_TOKEN_CODES.has(code)) throw e;
      await privateRef.update({fcmToken: null}).catch(() => undefined);
      return "token_cleaned";
    }
  } catch (e) {
    console.error(`[Notifications] newApp push to ${uid} failed:`, e);
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
    const sends: Promise<unknown>[] = [];

    if (repliedAuthor && repliedAuthor !== ev.authorUid) {
      sends.push(sendPushToUser(repliedAuthor, {
        ...base,
        type: "profile_comment_reply",
        title: `${ev.authorName} ответил(а) на ваш комментарий`,
        body: base.text,
      }, ev.authorUid));
      sends.push(writeNotification(
        repliedAuthor, ev.authorUid, "profile_comment_reply", base.text,
        {
          profileUid: ev.profileUid,
          commentId: ev.commentId,
          rootId: String(ev.parentId || ""),
        },
      ));
    }

    // Владелец профиля, если он не автор и уже не получил пуш об ответе
    if (ev.profileUid !== ev.authorUid && ev.profileUid !== repliedAuthor) {
      sends.push(sendPushToUser(ev.profileUid, {
        ...base,
        type: "profile_comment",
        title: `${ev.authorName} оставил(а) комментарий в профиле`,
        body: base.text,
      }, ev.authorUid));
      sends.push(writeNotification(
        ev.profileUid, ev.authorUid, "profile_comment", base.text,
        {profileUid: ev.profileUid, commentId: ev.commentId},
      ));
    }

    await Promise.all(sends);
  } catch (e) {
    console.error("[Notifications] notifyProfileComment failed:", e);
  }
}

/**
 * Уведомления о сообщениях в топиках групп (один триггер на все случаи):
 *  - техническая группа канала + ответ → автору исходного (channel_comment_reply);
 *  - техническая группа + коммент верхнего уровня → владельцу канала (channel_comment);
 *  - обычная группа + ответ → автору исходного (group_reply).
 * Ссылки группа ↔ канал сверяются в обе стороны. Адресата ответа берём из
 * самого исходного сообщения (reply_to_id пишет клиент). Новые виды
 * (channel_comment, group_reply) шлём только новому приложению.
 */
export const onChannelCommentReplyCreated = onDocumentCreated(
  {
    document: "groups/{groupId}/topics/{topicId}/messages/{messageId}",
    region: FIRESTORE_REGION,
  },
  async (event) => {
    try {
      const msg = event.data?.data();
      if (!msg || msg.is_deleted === true) return;
      const authorUid = msg.author_uid;
      if (typeof authorUid !== "string" || !authorUid) return;
      const replyToId =
        typeof msg.reply_to_id === "string" ? msg.reply_to_id : "";
      const {groupId, topicId, messageId} = event.params;

      // Техническая группа комментариев канала? Ссылки — в обе стороны.
      const group = await db().collection("groups").doc(groupId).get();
      const linkedChannelId = group.get("linkedChannelId");
      let channelSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (group.get("isTechnical") === true &&
          typeof linkedChannelId === "string" && linkedChannelId) {
        const ch = await db().collection("channels").doc(linkedChannelId).get();
        if (ch.exists && ch.get("linkedGroupId") === groupId) channelSnap = ch;
      }

      // Имя — из профиля автора (клиентскому author_username не верим).
      const author = await db().collection("users").doc(authorUid).get();
      const actorName = String(author.get("username") || "Кто-то");
      const text = messagePreview(msg);

      // Автор сообщения, на которое отвечают (null, если не ответ / удалено / своё).
      const replyRecipient = async (): Promise<string | null> => {
        if (!replyToId) return null;
        const orig = await db().collection("groups").doc(groupId)
          .collection("topics").doc(topicId)
          .collection("messages").doc(replyToId).get();
        if (!orig.exists || orig.get("is_deleted") === true) return null;
        const r = orig.get("author_uid");
        return (typeof r === "string" && r && r !== authorUid) ? r : null;
      };

      if (channelSnap) {
        const channelId = channelSnap.id;
        const channelName = String(channelSnap.get("name") || "");
        if (replyToId) {
          const recipient = await replyRecipient();
          if (!recipient) return;
          await sendPushToUser(recipient, {
            type: "channel_comment_reply", channelId, postId: topicId, groupId,
            commentId: messageId, actorUid: authorUid, actorName, channelName,
            text, title: `${actorName} ответил(а) на ваш комментарий`,
            body: text,
          }, authorUid);
          await writeNotification(recipient, authorUid, "channel_comment_reply",
            text, {channelId, groupId, postId: topicId, messageId});
        } else {
          const owner = channelSnap.get("ownerUid");
          if (typeof owner !== "string" || !owner || owner === authorUid) return;
          await sendPushToNewApp(owner, {
            type: "channel_comment", channelId, postId: topicId, groupId,
            commentId: messageId, actorUid: authorUid, actorName, channelName,
            text, title: `${actorName} прокомментировал(а) ваш пост`,
            body: text,
          }, authorUid);
          await writeNotification(owner, authorUid, "channel_comment", text,
            {channelId, groupId, postId: topicId});
        }
      } else if (replyToId) {
        const recipient = await replyRecipient();
        if (!recipient) return;
        await sendPushToNewApp(recipient, {
          type: "group_reply", groupId, topicId, commentId: messageId,
          actorUid: authorUid, actorName, text,
          title: `${actorName} ответил(а) в теме`, body: text,
        }, authorUid);
        await writeNotification(recipient, authorUid, "group_reply", text,
          {groupId, topicId, messageId});
      }
    } catch (e) {
      console.error("[Notifications] comment/reply notify failed:", e);
    }
  }
);

/**
 * Новый пост канала → пуш подписчикам по FCM-теме `channel_{channelId}`.
 * Без записи документа каждому подписчику (фан-аут на больших каналах дорог):
 * пост персистентно живёт в самом канале, лента уведомлений его не хранит.
 * Приложение подписывается на тему своих каналов.
 */
export const onChannelPostNotify = onDocumentCreated(
  {document: "channels/{channelId}/posts/{postId}", region: FIRESTORE_REGION},
  async (event) => {
    try {
      const {channelId, postId} = event.params;
      const post = event.data?.data();
      if (!post) return;
      const channel = await db().collection("channels").doc(channelId).get();
      if (!channel.exists) return;
      const groupId = channel.get("linkedGroupId");
      const body = (post.media_url && !post.text) ? "📷 Фото" : preview(post.text);
      await getMessaging().send({
        topic: `channel_${channelId}`,
        data: {
          type: "channel_post",
          channelId,
          postId,
          groupId: typeof groupId === "string" ? groupId : "",
          title: String(channel.get("name") || "Канал"),
          body,
        },
        android: {priority: "high", ttl: 24 * 60 * 60 * 1000},
      });
    } catch (e) {
      console.error("[Notifications] onChannelPostNotify failed:", e);
    }
  }
);

/**
 * Объявление администратора: пишет документ в announcements и шлёт пуш по
 * FCM-темам announcements_ru / announcements_en (null-язык → в обе).
 * Только для админов; полный гвард-ладдер onCall.
 */
export const sendAnnouncement = onCall(async (request) => {
  if (request.app == undefined) {
    throw new HttpsError("failed-precondition", "App Check required.");
  }
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  await assertNotBanned(request);
  assertEmailVerified(request.auth);
  const adminDoc = await db().collection("admins").doc(uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError("permission-denied", "Только для администраторов.");
  }

  const title = String(request.data?.title ?? "").trim();
  const text = String(request.data?.text ?? "").trim();
  const langRaw = request.data?.lang;
  if (!title || !text) {
    throw new HttpsError("invalid-argument", "Заголовок и текст обязательны.");
  }
  if (title.length > 120 || text.length > 2000) {
    throw new HttpsError("invalid-argument", "Слишком длинный текст.");
  }
  const lang = (langRaw === "ru" || langRaw === "en") ? langRaw : null;

  const ref = await db().collection("announcements").add({
    title,
    text,
    lang,
    authorUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const data = {
    type: "announcement",
    announcementId: ref.id,
    title,
    body: preview(text),
  };
  const topics = lang ?
    [`announcements_${lang}`] :
    ["announcements_ru", "announcements_en"];
  await Promise.all(topics.map((topic) =>
    getMessaging().send({topic, data, android: {priority: "high"}})
      .catch((e) => console.error(`[Announce] тема ${topic}:`, e)),
  ));

  return {id: ref.id};
});
