/**
 * Комментарии к постам каналов.
 *
 * Схема (её создаёт Android-клиент):
 *   channels/{channelId}            linkedGroupId, commentsEnabled
 *     posts/{postId}                commentsCount  ← считает этот модуль
 *   groups/{groupId}                isTechnical = true, linkedChannelId
 *     topics/{postId}               один топик на пост, id топика = id поста
 *       messages/{messageId}        сами комментарии, удаление мягкое
 *                                   (is_deleted = true)
 *
 * Группа считается группой комментариев канала, только если ссылки совпадают
 * в обе стороны: group.linkedChannelId == channelId И
 * channel.linkedGroupId == groupId. Одной ссылке верить нельзя: правила
 * Firestore дают владельцу канала или группы записать в неё любой id, а
 * функции пишут через Admin SDK в обход правил. Без встречной проверки любой
 * мог бы создать канал со ссылкой на чужую группу и заводить в ней топики
 * или «техническую» группу с чужим linkedChannelId и крутить счётчики чужого
 * канала. Поэтому встречную проверку делает каждая функция модуля.
 *
 * ⚠️ Затрагивает мобильное приложение: схему задаёт Android-клиент, а
 * commentsCount теперь считает сервер.
 *
 * Регион. Все функции проекта по умолчанию уходят в europe-west1
 * (options.ts), но триггеры Firestore должны жить в регионе самой базы —
 * europe-central2: так требует документация Firestore для региональных баз,
 * и это убирает межрегиональный сетевой хоп на каждое событие. Поэтому регион
 * здесь задан явно у каждой функции. Это триггеры, а не onCall: клиенты их
 * не вызывают, так что регион, прибитый в Android-приложении, не важен.
 */

import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {DocumentData, FieldValue} from "firebase-admin/firestore";

const db = () => admin.firestore();

/** Регион базы Firestore. См. комментарий в шапке модуля. */
const FIRESTORE_REGION = "europe-central2";

/** Код gRPC ALREADY_EXISTS — его возвращает create() для занятого id. */
const ALREADY_EXISTS = 6;

/** Код gRPC NOT_FOUND — его возвращает update() для удалённого документа. */
const NOT_FOUND = 5;

/**
 * recursiveDelete большой группы может не уложиться в минуту по умолчанию,
 * и тогда обсуждение останется удалённым наполовину.
 */
const DELETE_TIMEOUT_SECONDS = 300;

/**
 * Возвращает id канала, если группа — подлинная группа комментариев
 * этого канала (ссылки совпадают в обе стороны), иначе null.
 * @param {string} groupId id группы
 * @return {Promise<string | null>} id канала или null
 */
async function resolveLinkedChannel(groupId: string): Promise<string | null> {
  const group = await db().collection("groups").doc(groupId).get();
  const channelId = group.get("linkedChannelId");
  if (group.get("isTechnical") !== true || typeof channelId !== "string" ||
      !channelId) {
    return null;
  }

  const channel = await db().collection("channels").doc(channelId).get();
  if (!channel.exists || channel.get("linkedGroupId") !== groupId) return null;
  return channelId;
}

/**
 * Текст превью последнего комментария для топика.
 * @param {DocumentData} msg данные сообщения
 * @return {string} превью
 */
function previewOf(msg: DocumentData): string {
  switch (msg.type) {
  case "IMAGE": return "📷 Фото";
  case "VOICE": return "🎤 Голосовое";
  case "STICKER": return "✨ Стикер";
  default: return String(msg.text ?? "").slice(0, 120);
  }
}

/**
 * Пересчёт счётчика комментариев при любом изменении комментария.
 *
 * Считаем заново, а не делаем increment, по трём причинам:
 *  - удаление в клиенте мягкое (is_deleted = true) — это update, а не delete,
 *    и триггер на удаление документа его не видит;
 *  - Firestore-триггеры могут сработать повторно для одного события, и
 *    increment дал бы лишний ±1, а пересчёт идемпотентен;
 *  - если счётчик когда-то разошёлся, он чинится сам на следующем событии.
 *
 * Живые комментарии — все, кроме помеченных is_deleted = true: сообщение без
 * этого поля считается живым и здесь, и в проверке wasAlive/isAlive.
 * count() тарифицируется как одно чтение на каждые 1000 документов.
 */
export const onChannelCommentWritten = onDocumentWritten(
  {
    document: "groups/{groupId}/topics/{topicId}/messages/{messageId}",
    region: FIRESTORE_REGION,
  },
  async (event) => {
    const {groupId, topicId} = event.params;

    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const wasAlive = !!before && before.is_deleted !== true;
    const isAlive = !!after && after.is_deleted !== true;
    // Правка текста или реакция — число живых комментариев не изменилось
    if (wasAlive === isAlive) return;

    const channelId = await resolveLinkedChannel(groupId);
    if (!channelId) return;

    const topicRef = db().collection("groups").doc(groupId)
      .collection("topics").doc(topicId);
    const postRef = db().collection("channels").doc(channelId)
      .collection("posts").doc(topicId);
    const messages = topicRef.collection("messages");
    const [all, deleted, topic, post] = await Promise.all([
      messages.count().get(),
      messages.where("is_deleted", "==", true).count().get(),
      topicRef.get(),
      postRef.get(),
    ]);
    // Топика уже нет: пост удалили, и recursiveDelete стирает комментарии —
    // этот триггер срабатывает на каждый из них. Обсуждение не воскрешаем.
    if (!topic.exists) return;
    const count = all.data().count - deleted.data().count;

    const topicUpdate: {[field: string]: string | number | FieldValue} = {
      messageCount: count,
    };
    if (!wasAlive && isAlive && after) {
      topicUpdate.lastMessageText = previewOf(after);
      topicUpdate.lastMessageTimestamp = FieldValue.serverTimestamp();
    }

    // update, а не set: если пост или топик удалят, пока мы считаем, запись
    // просто не пройдёт, а не воскресит их документом из одного поля
    const batch = db().batch();
    if (post.exists) batch.update(postRef, {commentsCount: count});
    batch.update(topicRef, topicUpdate);
    try {
      await batch.commit();
    } catch (e) {
      if ((e as {code?: number}).code === NOT_FOUND) return;
      throw e;
    }
    console.log(`[ChannelComments] post ${channelId}/${topicId}: ` +
      `commentsCount = ${count}`);
  }
);

/**
 * Топик обсуждения создаётся сразу при публикации поста, если у канала
 * включены комментарии. Без этого топик создаёт первый комментатор, и для
 * этого правилам приходится пускать чужих людей создавать топики.
 *
 * commentsCount здесь не пишем: клиент считает отсутствие поля нулём, а
 * медиапост Android-клиент записывает через set() целиком — лишнее поле
 * от сервера там только мешало бы.
 */
export const onChannelPostCreated = onDocumentCreated(
  {document: "channels/{channelId}/posts/{postId}", region: FIRESTORE_REGION},
  async (event) => {
    const {channelId, postId} = event.params;
    const channel = await db().collection("channels").doc(channelId).get();
    const groupId = channel.get("linkedGroupId");
    if (typeof groupId !== "string" || !groupId) return;
    if (channel.get("commentsEnabled") === false) return;

    // Топики в группе правила разрешают только её владельцу и админам, а мы
    // пишем в обход правил. Без встречной проверки владелец канала указал бы
    // в linkedGroupId чужую группу и заводил бы в ней топики своими постами.
    if (await resolveLinkedChannel(groupId) !== channelId) return;

    const post = event.data?.data() ?? {};
    const title = String(post.text || "Пост").slice(0, 50);

    try {
      await db().collection("groups").doc(groupId)
        .collection("topics").doc(postId)
        .create({
          topicId: postId,
          groupId,
          name: title,
          description: "",
          isLocked: false,
          createdBy: channel.get("ownerUid") ?? "",
          createdAt: FieldValue.serverTimestamp(),
          messageCount: 0,
        });
    } catch (e) {
      // Повторный запуск триггера или топик уже создал клиент — это норма
      if ((e as {code?: number}).code !== ALREADY_EXISTS) throw e;
    }
  }
);

/**
 * Удаление поста — удаляем его обсуждение: топик, все комментарии и медиа.
 */
export const onChannelPostDeleted = onDocumentDeleted(
  {
    document: "channels/{channelId}/posts/{postId}",
    region: FIRESTORE_REGION,
    timeoutSeconds: DELETE_TIMEOUT_SECONDS,
  },
  async (event) => {
    const {channelId, postId} = event.params;
    const channel = await db().collection("channels").doc(channelId).get();
    const groupId = channel.get("linkedGroupId");
    if (typeof groupId !== "string" || !groupId) return;

    // Убеждаемся, что группа действительно этого канала, — иначе подложная
    // ссылка в канале позволила бы стирать топики в чужой группе
    if (await resolveLinkedChannel(groupId) !== channelId) return;

    const topicRef = db().collection("groups").doc(groupId)
      .collection("topics").doc(postId);
    await db().recursiveDelete(topicRef);
    await admin.storage().bucket()
      .deleteFiles({prefix: `group_media/${groupId}/${postId}/`});
    console.log(`[ChannelComments] Обсуждение поста ${channelId}/${postId} ` +
      "удалено");
  }
);

/**
 * Удаление канала — удаляем его группу комментариев целиком.
 *
 * Документа канала уже нет, поэтому встречную ссылку channel.linkedGroupId
 * проверить нельзя. Сверяем по данным удалённого канала и самой группы:
 * удаляем, только если группа техническая и указывает на этот же канал.
 */
export const onChannelDeleted = onDocumentDeleted(
  {
    document: "channels/{channelId}",
    region: FIRESTORE_REGION,
    timeoutSeconds: DELETE_TIMEOUT_SECONDS,
  },
  async (event) => {
    const {channelId} = event.params;
    const groupId = event.data?.get("linkedGroupId");
    if (typeof groupId !== "string" || !groupId) return;

    const groupRef = db().collection("groups").doc(groupId);
    const group = await groupRef.get();
    if (!group.exists || group.get("isTechnical") !== true ||
        group.get("linkedChannelId") !== channelId) {
      return;
    }

    await db().recursiveDelete(groupRef);
    await admin.storage().bucket()
      .deleteFiles({prefix: `group_media/${groupId}/`});
    console.log(`[ChannelComments] Группа комментариев ${groupId} канала ` +
      `${channelId} удалена`);
  }
);
