/**
 * Реестр возможностей по чатам.
 *
 * Раньше каждый обработчик сам сверялся с chat id — а чаще не сверялся вовсе,
 * поэтому триггеры и капча срабатывали во всех чатах разом. Теперь это одна
 * таблица: добавляя обработчик, достаточно обернуть его в `hasFeature`,
 * а не заводить очередной массив идентификаторов.
 */

import {
    PROTOMAP_CHAT_ID,
    GAREM_CHAT_ID,
    CHANNEL_ID,
    COMMENTS_CHAT_ID,
} from "./bot";

// `transcribe` — только личный чат, и это про приватность, а не про квоту.
//   Расшифровка идёт через Gemini, а бесплатный тариф прямо оговаривает, что
//   Google использует данные для улучшения продуктов и что «human reviewers may
//   read, annotate, and process your API input and output». То есть голосовое
//   может послушать живой человек. В своём чате Орион об этом знает и может
//   предупредить участников; в ProtoMap люди такого не ожидают.
//   Расширять — только вместе с уведомлением участников. Когда расшифровка
//   переедет на локальный whisper, ограничение можно будет снять.
//
// `triggers` и `captcha` — выключены в личном чате по прямой просьбе Ориона:
//   там свои люди, автомут за слово «подкрутка» и капча на входе не нужны.

export type Feature =
    | 'triggers' | 'captcha' | 'transcribe' | 'games' | 'moderation'
    /** Комментарий-приглашение под каждым постом канала. */
    | 'channel_promo'
    /** Подсказка вступившим, что это чат комментариев, а не чат сообщества. */
    | 'comments_greeting'
    /** Скачивание медиа по ссылкам из обычных источников. */
    | 'download'
    /** Плюс источники со взрослым контентом — только там, где это уместно. */
    | 'download_nsfw';

const CHAT_FEATURES: Record<number, Feature[]> = {
    [PROTOMAP_CHAT_ID]: ['triggers', 'captcha', 'games', 'moderation', 'download'],
    [GAREM_CHAT_ID]:    ['transcribe', 'games', 'moderation', 'download', 'download_nsfw'],

    // В канале бот ничего не делает сам — он нужен там только чтобы иметь право
    // читать. Вся работа с постами происходит в обсуждении: Telegram пересылает
    // туда каждый пост, и ответ на эту пересылку становится комментарием.
    [CHANNEL_ID]:       [],
    [COMMENTS_CHAT_ID]: ['channel_promo', 'comments_greeting'],
};

export function hasFeature(chatId: number | undefined, feature: Feature): boolean {
    if (chatId === undefined) return false;
    return (CHAT_FEATURES[chatId] ?? []).includes(feature);
}
