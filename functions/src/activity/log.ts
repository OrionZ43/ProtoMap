/**
 * Журнал действий — коллекция `activity_log`.
 *
 * Зачем. 19.10.2026 разработчик с правами админа вписал себе 23 055 PC прямо
 * в Firestore, и кто это сделал, по логам установить было нельзя: Firestore
 * автора записи не хранит, а функции пишут в журнал только игры. Теперь
 * каждое заметное действие оставляет запись: кто, что, когда, на сколько PC.
 *
 * Откуда берутся записи:
 *  - изменения документа пользователя (баланс, вещи, бан, профиль) ловит
 *    триггер с контекстом авторизации (triggers.ts). Он видит, кто писал:
 *    наш сервер или кто-то напрямую — приложение, консоль, скрипт. Поэтому
 *    мимо журнала не пройдёт ни одно изменение баланса, даже из функции,
 *    которую забыли подключить;
 *  - причину изменения баланса функция экономики кладёт пометкой
 *    `econ_op` в ту же запись документа (см. econOp ниже);
 *  - контент (комментарии, посты, чат, жалобы, метки) — триггеры на коллекции;
 *  - действия админки сайта — сам сайт (src/lib/server/activity.ts).
 *
 * Хранение — 180 дней (TTL по `expireAt`): Политика конфиденциальности
 * отводит журналам безопасности 6 месяцев. Клиентам коллекция закрыта
 * правилами, читает её только админка сайта через Admin SDK.
 *
 * Личные сообщения и закрытые группы в журнал не попадают.
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";

const db = () => admin.firestore();

export const ACTIVITY = "activity_log";

/** Регион базы Firestore — триггеры живут там же (см. channelComments.ts). */
export const FIRESTORE_REGION = "europe-central2";

/** Сколько хранится запись: 6 месяцев, как журналы безопасности в Политике. */
const RETENTION_DAYS = 180;

/** Изменение баланса, о котором стоит знать сразу, — от этой суммы. */
export const BIG_DELTA = 10_000;

/** Длина фрагмента текста (комментария, сообщения) в записи. */
const SNIPPET = 140;

export type Group =
  "economy" | "moderation" | "profile" | "content" | "account" | "admin" | "map";

/**
 * Кто сделал запись в базу.
 *  - server — наш код с сервисным аккаунтом: функции и сайт;
 *  - system — сама платформа (например, удаление по TTL);
 *  - direct — всё остальное: приложение или сайт от имени пользователя,
 *    консоль Firebase, скрипт с чужими учётными данными.
 */
export interface Author {
  type: "server" | "system" | "direct";
  /** authType из события Firestore как есть — для разбора спорных случаев. */
  authType: string;
  /** authId из события: uid, почта или сервисный аккаунт. */
  id: string | null;
}

export interface Entry {
  group: Group;
  kind: string;
  uid: string | null;
  username?: string | null;
  target?: string | null;
  targetName?: string | null;
  delta?: number | null;
  balance?: number | null;
  items?: {added: string[]; removed: string[]} | null;
  shards?: number | null;
  fields?: string[] | null;
  text?: string | null;
  ref?: string | null;
  author?: Author | null;
  flag?: "direct" | "unexplained" | "big" | null;
  alert?: boolean;
}

/**
 * Автор записи по контексту авторизации события Firestore.
 * @param {string | undefined} authType тип принципала из события
 * @param {string | undefined} authId идентификатор принципала из события
 * @return {Author} классификация автора
 */
export function authorOf(authType?: string, authId?: string): Author {
  const type = String(authType ?? "unknown");
  if (type === "service_account") return {type: "server", authType: type, id: authId ?? null};
  if (type === "system") return {type: "system", authType: type, id: authId ?? null};
  return {type: "direct", authType: type, id: authId ?? null};
}

/**
 * Пометка «откуда изменение баланса» для документа пользователя.
 *
 * Функция экономики пишет её в той же операции, что и баланс:
 * `t.update(userRef, {casino_credits: …, econ_op: econOp("slots", "1000")})`.
 * Триггер узнаёт свою пометку по новому `id`. Документ пользователя читают
 * все, поэтому в пометке только вид операции и короткая деталь, без того,
 * кто из админов что сделал, — это пишет сама админка отдельной записью.
 * @param {string} kind вид операции
 * @param {string | number} ref короткая деталь: ставка, предмет, множитель
 * @return {object} значение поля econ_op
 */
export function econOp(kind: string, ref?: string | number): {kind: string; ref: string | null; id: string} {
  return {kind, ref: ref === undefined ? null : String(ref), id: crypto.randomUUID()};
}

/**
 * Обрезка текста для записи журнала.
 * @param {unknown} text текст
 * @return {string | null} фрагмент или null
 */
export function snippet(text: unknown): string | null {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > SNIPPET ? s.slice(0, SNIPPET - 1) + "…" : s;
}

/** Код gRPC ALREADY_EXISTS — его возвращает create() для занятого id. */
const ALREADY_EXISTS = 6;

/**
 * Запись в журнал. Пустые поля не пишутся.
 *
 * Триггеры Firestore могут сработать повторно на одно событие, поэтому они
 * передают `id` события: повторная доставка упрётся в занятый id и дубля не
 * будет.
 * @param {Entry} entry запись
 * @param {string} id id документа (id события триггера)
 * @return {Promise<void>}
 */
export async function writeActivity(entry: Entry, id?: string): Promise<void> {
  const data: Record<string, unknown> = {
    at: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 86_400_000),
    alert: entry.alert === true,
  };
  for (const [k, v] of Object.entries(entry)) {
    if (v !== undefined && v !== null && k !== "alert") data[k] = v;
  }
  const col = db().collection(ACTIVITY);
  if (!id) {
    await col.add(data);
    return;
  }
  try {
    await col.doc(id).create(data);
  } catch (e) {
    if ((e as {code?: number}).code !== ALREADY_EXISTS) throw e;
  }
}

// ─── Разбор изменения документа пользователя ─────────────────────────────

/** Поля экономики: их меняет только сервер. */
const ECONOMY_FIELDS = ["casino_credits", "owned_items", "glitch_shards", "daily_streak"];

/** Поля бана. */
const BAN_FIELDS = ["isBanned", "banReason", "banCategory", "bannedAt"];

/**
 * Служебные поля: меняются при каждой игре, входе или сохранении и сами по
 * себе действием человека не являются.
 */
const IGNORED_FIELDS = new Set([
  "econ_op", "fcmToken", "lastBackupSignature", "last_game_played", "last_crash_game",
  "last_bonus_game", "last_chat_message", "last_location_update", "last_avatar_upload",
  "last_daily_bonus", "birthday_bonus_claimed", "referralBonusClaimed", "stepperAnomalyFlag",
  "hasAgreedRequiredConsents", "consentsV5", "consentsUpdatedAt", "consents_updated_at",
  "consents_tos_version", "consents_privacy_version", "activity_data_consent",
  "activity_leaderboard_consent", "isBetaUser", "betaChannel", "migratedAt",
]);

type Data = Record<string, unknown> | undefined;

/**
 * Одинаковы ли значения поля (с учётом массивов, карт и Timestamp).
 * @param {unknown} a значение до
 * @param {unknown} b значение после
 * @return {boolean} равны ли
 */
function same(a: unknown, b: unknown): boolean {
  // Порядок ключей в картах Firestore не гарантирован — сортируем.
  const norm = (v: unknown): unknown => {
    if (v && typeof v === "object") {
      if (typeof (v as {toMillis?: unknown}).toMillis === "function") {
        return (v as {toMillis: () => number}).toMillis();
      }
      if (Array.isArray(v)) return v.map(norm);
      const o = v as Record<string, unknown>;
      return Object.keys(o).sort().map((k) => [k, norm(o[k])]);
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Изменённые поля верхнего уровня; у карты `socials` — по ключам.
 * @param {Data} before данные до
 * @param {Data} after данные после
 * @return {string[]} пути изменённых полей
 */
export function changedFields(before: Data, after: Data): string[] {
  const b = before ?? {};
  const a = after ?? {};
  const out: string[] = [];
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (key === "socials") {
      const bs = (b.socials ?? {}) as Record<string, unknown>;
      const as = (a.socials ?? {}) as Record<string, unknown>;
      for (const s of new Set([...Object.keys(bs), ...Object.keys(as)])) {
        if (!same(bs[s], as[s])) out.push(`socials.${s}`);
      }
    } else if (!same(b[key], a[key])) {
      out.push(key);
    }
  }
  return out.sort();
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/**
 * Запись журнала по изменению документа пользователя или null, если менялись
 * только служебные поля.
 *
 * Чистая функция — проверяется тестами без Firebase.
 * @param {string} uid чей документ
 * @param {Data} before данные до (нет — документ создан)
 * @param {Data} after данные после (нет — документ удалён)
 * @param {Author} author кто записал
 * @return {Entry | null} запись или null
 */
export function describeUserChange(uid: string, before: Data, after: Data, author: Author): Entry | null {
  const username = String((after ?? before)?.username ?? "") || null;

  if (!before && after) {
    return {group: "account", kind: "created", uid, username, balance: num(after.casino_credits), author};
  }
  if (before && !after) {
    // Без ника: удаление аккаунта обезличивает его записи журнала
    // (accountPurge.ts), и эта запись не должна вернуть ник обратно.
    return {group: "account", kind: "deleted", uid, author};
  }
  if (!before || !after) return null;

  const changed = changedFields(before, after).filter((f) => !IGNORED_FIELDS.has(f));
  if (changed.length === 0) return null;

  const direct = author.type === "direct";
  const economy = changed.filter((f) => ECONOMY_FIELDS.includes(f));
  const delta = num(after.casino_credits) - num(before.casino_credits);
  const op = after.econ_op as {kind?: string; ref?: string; id?: string} | undefined;
  const marked = !!op?.id && op.id !== (before.econ_op as {id?: string} | undefined)?.id;

  if (economy.length > 0) {
    const added = list(after.owned_items).filter((x) => !list(before.owned_items).includes(x));
    const removed = list(before.owned_items).filter((x) => !list(after.owned_items).includes(x));
    const big = Math.abs(delta) >= BIG_DELTA;
    const kind = direct ? "direct" : marked ? String(op?.kind) : "server_unknown";
    const flag = direct ? "direct" : !marked && author.type === "server" ? "unexplained" : big ? "big" : null;
    const rest = changed.filter((f) => !ECONOMY_FIELDS.includes(f));
    return {
      group: "economy", kind, uid, username,
      delta, balance: num(after.casino_credits),
      items: added.length || removed.length ? {added, removed} : null,
      shards: changed.includes("glitch_shards") ? num(after.glitch_shards) - num(before.glitch_shards) : null,
      fields: rest.length ? rest : null,
      ref: marked ? op?.ref ?? null : null,
      author, flag,
      alert: direct || big,
    };
  }

  if (changed.some((f) => BAN_FIELDS.includes(f))) {
    const banned = after.isBanned === true;
    return {
      group: "moderation", kind: banned ? "ban" : "unban", uid, username,
      text: banned ? snippet(after.banReason) : null,
      author, flag: direct ? "direct" : null,
      alert: direct,
    };
  }

  if (changed.includes("role")) {
    return {
      group: "admin", kind: "role", uid, username, text: snippet(after.role ?? "—"),
      author, flag: direct ? "direct" : null, alert: true,
    };
  }

  if (changed.includes("username")) {
    return {
      group: "profile", kind: "username", uid, username,
      text: `${String(before.username ?? "")} → ${String(after.username ?? "")}`,
      fields: changed, author,
    };
  }

  return {group: "profile", kind: "profile", uid, username, fields: changed, author};
}
