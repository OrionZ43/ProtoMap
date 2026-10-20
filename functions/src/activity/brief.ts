/**
 * Сводка дня от Gemini — для главной админки сайта (/admin) и вечернего
 * дайджеста в Telegram (notify.ts).
 *
 * В Gemini уходят только факты из журнала действий: счёт, суммы PC, названия
 * вещей витрины. Ни текстов сообщений, ни ников: люди — псевдонимами U1, U2…,
 * ники подставляются обратно в готовый текст. Модель пишет 2–4 предложения на
 * русском и английском и выделяет главное [[так]] — как шаблонная сводка
 * сайта (src/lib/admin/day.ts, segments).
 *
 * Хранится в admin_daily/{день по Минску}.brief — там же, где сайт кэширует
 * итоги дней. Клиентам коллекция закрыта (разрешающего правила нет), сайт
 * читает её через Admin SDK.
 */

import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {ACTIVITY} from "./log";
import {generateJson} from "../telegram/gemini";

const db = () => admin.firestore();

const DAY = 86_400_000;
/** Минск живёт по UTC+3 круглый год. */
const MINSK_OFFSET = 3 * 3_600_000;
const RTDB_URL = "https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app";
/** Потолок записей за отрезок. Журнал пока набирает десятки в день. */
const LIMIT = 5000;
/** Больше этого на язык — обрезаем: сводка должна читаться за пару секунд. */
const MAX_LENGTH = 700;

export const DAILY = "admin_daily";

type Doc = FirebaseFirestore.DocumentData;

/**
 * Начало минских суток.
 * @param {number} ms момент
 * @return {number} начало суток
 */
export function dayStart(ms: number): number {
  return Math.floor((ms + MINSK_OFFSET) / DAY) * DAY - MINSK_OFFSET;
}

/**
 * Ключ суток по Минску: 2026-10-20.
 * @param {number} ms момент
 * @return {string} ключ
 */
export function dayKey(ms: number): string {
  return new Date(dayStart(ms) + MINSK_OFFSET).toISOString().slice(0, 10);
}

/** Игры против казино: их итог — результат казино. */
const HOUSE = new Set(["slots", "coinflip", "crash_bet", "crash_cashout", "plinko"]);
/** Ставки для «сыграли N раз»: выплата краша — продолжение той же игры. */
const ROUNDS = new Set(["slots", "coinflip", "crash_bet", "plinko"]);
const BONUSES = new Set(["daily_bonus", "birthday", "referral", "referral_bonus", "referral_prize", "stepper"]);
const GAME_NAMES: Record<string, string> = {slots: "Слоты", coinflip: "Монетка", crash: "Data Uplink", plinko: "Плинко"};

const gameOf = (kind: string) => (kind === "crash_bet" || kind === "crash_cashout" ? "crash" : kind);
const delta = (e: Doc) => (typeof e.delta === "number" && Number.isFinite(e.delta) ? e.delta : 0);

/**
 * Что за тревога — коротко, для фактов.
 * @param {Doc} e запись журнала
 * @return {string} описание
 */
function alertWhat(e: Doc): string {
  if (e.flag === "direct") return "баланс или бан изменены в обход сервера";
  if (e.group === "economy") return "крупное изменение баланса";
  if (String(e.kind).startsWith("admins_")) return "изменён список админов";
  if (e.kind === "role") return "изменена роль в профиле";
  if (String(e.kind).startsWith("shop_")) return "изменена витрина";
  if (e.group === "admin") return "действие в админке сайта";
  return `${e.group}/${e.kind}`;
}

/** Псевдонимы людей: U1, U2… в порядке появления. */
export class Pseudonyms {
  private byUid = new Map<string, string>();
  readonly names = new Map<string, string>();

  /**
   * Псевдоним человека.
   * @param {string} uid uid
   * @param {unknown} username ник
   * @return {string} U1, U2…
   */
  of(uid: string, username: unknown): string {
    let p = this.byUid.get(uid);
    if (!p) {
      p = `U${this.byUid.size + 1}`;
      this.byUid.set(uid, p);
      this.names.set(p, String(username || uid));
    }
    return p;
  }
}

/**
 * Короткий счёт по записям — для сравнения со вчерашним днём.
 * @param {Doc[]} entries записи
 * @return {object} счёт
 */
function tally(entries: Doc[]) {
  let rounds = 0;
  let casino = 0;
  let purchases = 0;
  let chat = 0;
  for (const e of entries) {
    if (e.kind === "chat") chat++;
    if (e.group !== "economy") continue;
    if (ROUNDS.has(e.kind)) rounds++;
    if (HOUSE.has(e.kind)) casino -= delta(e);
    if (e.kind === "purchase") purchases++;
  }
  return {actions: entries.length, rounds, casino_result_pc: casino + 0, purchases, chat_messages: chat};
}

export interface FactsContext {
  /** Подпись отрезка для модели: «сегодня, 00:00–14:32». */
  period: string;
  weekday: string;
  visited: number | null;
  onlineNow: number | null;
  bank: number | null;
  itemNames: Record<string, string>;
  seasonal: {day: number; of: number; soldInPeriod: number} | null;
  /** Записи журнала за тот же отрезок вчера — для сравнения. */
  yesterday: Doc[] | null;
}

/**
 * Факты для модели. Чистая функция — проверяется без Firebase.
 * @param {Doc[]} entries записи журнала за отрезок
 * @param {FactsContext} ctx остальное
 * @return {{facts: object, names: Map<string, string>}} факты и расшифровка псевдонимов
 */
export function buildFacts(entries: Doc[], ctx: FactsContext): {facts: Record<string, unknown>; names: Map<string, string>} {
  const ids = new Pseudonyms();
  const count = (test: (e: Doc) => boolean) => entries.filter(test).length;

  const actions = new Map<string, {name: unknown; n: number}>();
  for (const e of entries) {
    if (!e.uid) continue;
    const cur = actions.get(e.uid) ?? {name: e.username, n: 0};
    cur.n++;
    if (e.username) cur.name = e.username;
    actions.set(e.uid, cur);
  }
  const mostActive = [...actions.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3)
    .map(([uid, x]) => ({who: ids.of(uid, x.name), actions: x.n}));

  const games = new Map<string, {rounds: number; result: number}>();
  let best: Doc | null = null;
  let worst: Doc | null = null;
  for (const e of entries) {
    if (e.group !== "economy" || !HOUSE.has(e.kind)) continue;
    const d = delta(e);
    const g = games.get(gameOf(e.kind)) ?? {rounds: 0, result: 0};
    if (ROUNDS.has(e.kind)) g.rounds++;
    g.result -= d;
    games.set(gameOf(e.kind), g);
    if (d > 0 && (!best || d > delta(best))) best = e;
    if (d < 0 && (!worst || d < delta(worst))) worst = e;
  }
  const move = (e: Doc | null) => e ?
    {who: ids.of(String(e.uid), e.username), game: GAME_NAMES[gameOf(e.kind)] ?? e.kind, pc: delta(e)} : null;
  const byGame = [...games.entries()]
    .map(([g, x]) => ({game: GAME_NAMES[g] ?? g, rounds: x.rounds, casino_result_pc: x.result + 0}));

  const items = new Map<string, number>();
  let spent = 0;
  for (const e of entries) {
    if (e.kind !== "purchase") continue;
    const id = String(e.items?.added?.[0] ?? e.ref ?? "?");
    items.set(id, (items.get(id) ?? 0) + 1);
    spent -= delta(e);
  }
  const topItems = [...items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, n]) => ({item: ctx.itemNames[id] ?? id, count: n}));

  const bonuses = entries.filter((e) => e.group === "economy" && BONUSES.has(e.kind));
  const alerts = entries.filter((e) => e.alert === true);

  const facts = {
    period: ctx.period,
    weekday: ctx.weekday,
    people: {
      visited: ctx.visited,
      online_now: ctx.onlineNow,
      new_accounts: count((e) => e.group === "account" && e.kind === "created"),
      deleted_accounts: count((e) => e.group === "account" && e.kind === "deleted"),
      most_active: mostActive,
    },
    casino: {
      rounds: byGame.reduce((s, g) => s + g.rounds, 0),
      casino_result_pc: byGame.reduce((s, g) => s + g.casino_result_pc, 0),
      bank_pc: ctx.bank,
      by_game: byGame,
      biggest_player_win: move(best),
      biggest_player_loss: move(worst),
    },
    shop: {purchases: count((e) => e.kind === "purchase"), spent_pc: spent + 0, top_items: topItems},
    bonuses: {count: bonuses.length, total_pc: bonuses.reduce((s, e) => s + delta(e), 0)},
    community: {
      chat_messages: count((e) => e.kind === "chat"),
      profile_comments: count((e) => e.kind === "profile_comment"),
      channel_posts: count((e) => e.kind === "channel_post"),
      channel_comments: count((e) => e.kind === "channel_comment"),
      map_changes: count((e) => e.group === "map"),
    },
    moderation: {
      bans: count((e) => e.group === "moderation" && e.kind === "ban"),
      unbans: count((e) => e.group === "moderation" && e.kind === "unban"),
      reports: count((e) => e.kind === "report"),
    },
    alerts: {count: alerts.length, what: [...new Set(alerts.map(alertWhat))]},
    admin_actions: count((e) => e.group === "admin"),
    seasonal_shop: ctx.seasonal,
    same_time_yesterday: ctx.yesterday ? tally(ctx.yesterday) : null,
  };
  return {facts, names: ids.names};
}

/**
 * Ники обратно вместо псевдонимов U1, U2….
 * @param {string} text текст модели
 * @param {Map<string, string>} names псевдоним → ник
 * @return {string} текст с никами
 */
export function restoreNames(text: string, names: Map<string, string>): string {
  return text.replace(/\bU\d+\b/g, (m) => names.get(m) ?? m);
}

/**
 * Текст модели — в порядок: строка, без лишних пробелов, не длиннее MAX_LENGTH,
 * ники на месте псевдонимов.
 * @param {unknown} raw поле ответа модели
 * @param {Map<string, string>} names псевдоним → ник
 * @return {string} текст или пустая строка
 */
export function cleanText(raw: unknown, names: Map<string, string>): string {
  if (typeof raw !== "string") return "";
  const text = restoreNames(raw.replace(/\s+/g, " ").trim(), names);
  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH - 1).trimEnd() + "…" : text;
}

const SYSTEM = [
  "Ты пишешь короткую сводку для владельца сайта ProtoMap — карты и соцсети сообщества",
  "протогенов с казино на внутренней валюте PC. На входе — факты за отрезок времени в JSON.",
  "",
  "Напиши 2–4 предложения: что было главным, что необычного, на что стоит обратить внимание.",
  "Без приветствия, без списков и заголовков. Тон живой и дружелюбный, без канцелярита.",
  "Ничего не выдумывай: только то, что есть в фактах. Если отрезок тихий — так и скажи.",
  "Сравнивай с тем же временем вчера (same_time_yesterday), только если разница заметная.",
  "casino_result_pc — сколько казино выиграло у игроков; минус — казино проиграло.",
  "Люди обозначены U1, U2… — пиши их ровно так, без кавычек и изменений.",
  "Выдели 2–4 самых важных числа или имени, обернув их в [[ и ]], например: сыграли [[214 раз]].",
  "Не длиннее 450 символов на язык.",
  "",
  "Верни JSON: ru — сводка по-русски, en — та же сводка по-английски.",
].join("\n");

const SCHEMA = {
  type: "OBJECT",
  properties: {ru: {type: "STRING"}, en: {type: "STRING"}},
  required: ["ru", "en"],
};

export interface StoredBrief {
  ru: string;
  en: string;
  model: string;
  /** Когда написана, мс. */
  at: number;
  /** today — с полуночи до сейчас (кнопка на сайте), day — последние сутки (дайджест в 21:00). */
  scope: "today" | "day";
}

const clock = new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Minsk", hour: "2-digit", minute: "2-digit"});
const weekday = new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Minsk", weekday: "long"});

/**
 * Сезонная витрина: вещи со сроком продажи, которые продаются сейчас.
 * @param {FirebaseFirestore.QueryDocumentSnapshot[]} shop вещи витрины
 * @param {Doc[]} entries записи за отрезок
 * @param {number} now момент
 * @return {object | null} день сезона, его длина и продажи за отрезок
 */
function seasonal(shop: FirebaseFirestore.QueryDocumentSnapshot[], entries: Doc[], now: number) {
  const ms = (v: unknown) => (v && typeof (v as Timestamp).toMillis === "function" ? (v as Timestamp).toMillis() : null);
  const live = shop
    .filter((d) => d.get("is_hidden") !== true)
    .map((d) => ({id: d.id, from: ms(d.get("available_from")), until: ms(d.get("available_until"))}))
    .filter((x) => x.until !== null && x.until > now && (x.from === null || x.from <= now));
  if (live.length === 0) return null;
  const from = Math.min(...live.map((x) => x.from ?? now));
  const until = Math.max(...live.map((x) => x.until as number));
  const ids = new Set(live.map((x) => x.id));
  return {
    day: Math.floor((dayStart(now) - dayStart(from)) / DAY) + 1,
    of: Math.round((dayStart(until - 1) - dayStart(from)) / DAY) + 1,
    soldInPeriod: entries.filter((e) => e.kind === "purchase" && ids.has(String(e.items?.added?.[0] ?? e.ref))).length,
  };
}

/**
 * Собрать факты за отрезок, попросить сводку у Gemini и сохранить её в
 * admin_daily/{день}.brief.
 * @param {number} from начало отрезка, мс
 * @param {number} to конец отрезка, мс
 * @param {"today" | "day"} scope today — с полуночи до сейчас, day — последние сутки
 * @return {Promise<StoredBrief | null>} сводка или null, если Gemini не справился
 */
export async function makeBrief(from: number, to: number, scope: "today" | "day"): Promise<StoredBrief | null> {
  const range = (a: number, b: number) => db().collection(ACTIVITY)
    .where("at", ">=", Timestamp.fromMillis(a)).where("at", "<", Timestamp.fromMillis(b))
    .orderBy("at", "desc").limit(LIMIT).get();
  const [now, before, bankDoc, shop, status] = await Promise.all([
    range(from, to),
    range(from - DAY, to - DAY),
    db().collection("system").doc("casino_stats").get(),
    db().collection("shop_items").get(),
    admin.app().database(RTDB_URL).ref("status").get().catch(() => null),
  ]);
  const entries = now.docs.map((d) => d.data());

  // Кто заходил сегодня — по статусам, менявшимся с полуночи: «online» с
  // прошлых дней — зависшие записи, их не считаем (как и сайт).
  let visited: number | null = null;
  let onlineNow: number | null = null;
  if (status) {
    const today = Object.values((status.val() ?? {}) as Record<string, {state?: unknown; last_changed?: unknown}>)
      .filter((p) => typeof p?.last_changed === "number" && p.last_changed >= dayStart(to));
    visited = today.length;
    onlineNow = today.filter((p) => p.state === "online").length;
  }

  const itemNames: Record<string, string> = {};
  for (const d of shop.docs) itemNames[d.id] = String(d.get("name") ?? d.id);
  const bank = Number(bankDoc.get("bank_balance"));

  const {facts, names} = buildFacts(entries, {
    period: scope === "today" ?
      `сегодня, 00:00–${clock.format(to)} по Минску` :
      `последние сутки, до ${clock.format(to)} по Минску`,
    weekday: weekday.format(to),
    visited,
    onlineNow,
    bank: Number.isFinite(bank) ? bank : null,
    itemNames,
    seasonal: seasonal(shop.docs, entries, to),
    yesterday: before.docs.map((d) => d.data()),
  });

  const answer = await generateJson(SYSTEM, JSON.stringify(facts), SCHEMA, "BRIEF");
  if (!answer.ok) {
    console.warn(`[BRIEF] Gemini не написал сводку: ${answer.reason}${answer.detail ? ` · ${answer.detail}` : ""}`);
    return null;
  }
  const ru = cleanText(answer.data?.ru, names);
  const en = cleanText(answer.data?.en, names);
  if (!ru) {
    console.warn("[BRIEF] В ответе нет текста по-русски");
    return null;
  }

  const brief: StoredBrief = {ru, en: en || ru, model: answer.model, at: Date.now(), scope};
  await db().collection(DAILY).doc(dayKey(to)).set({brief: {...brief, at: Timestamp.fromMillis(brief.at)}}, {merge: true});
  return brief;
}

/**
 * Последняя сохранённая сводка за день.
 * @param {string} key ключ дня
 * @return {Promise<StoredBrief | null>} сводка или null
 */
export async function latestBrief(key: string): Promise<StoredBrief | null> {
  const b = (await db().collection(DAILY).doc(key).get()).get("brief");
  if (!b || typeof b.ru !== "string") return null;
  return {
    ru: b.ru,
    en: typeof b.en === "string" ? b.en : b.ru,
    model: String(b.model ?? ""),
    at: b.at?.toMillis?.() ?? 0,
    scope: b.scope === "day" ? "day" : "today",
  };
}

/**
 * Сводка для Telegram: экранирование и [[главное]] → жирный.
 * @param {string} text сводка
 * @return {string} HTML
 */
export function briefHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\[\[(.+?)\]\]/g, "<b>$1</b>");
}
