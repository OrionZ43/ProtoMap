/**
 * Ориону в личку Telegram: тревожные записи журнала сразу и сводка за сутки.
 *
 * Тревожная запись — с `alert: true`: баланс или бан изменены в обход
 * сервера, крупное изменение баланса, правка списка админов, роли, витрины,
 * любое действие админки сайта. Решает тот, кто пишет запись (log.ts,
 * triggers.ts, src/lib/server/activity.ts), здесь только отправка.
 *
 * Отправка — прямым запросом к Bot API, как sendToCasinoChat в index.ts:
 * Telegraf для одного sendMessage не нужен.
 */

import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {ORION_TG_ID} from "../telegram/core/bot";
import {ACTIVITY, FIRESTORE_REGION} from "./log";
import {briefHtml, makeBrief} from "./brief";

const db = () => admin.firestore();

const SITE = "https://proto-map.vercel.app";

/** Больше стольких уведомлений в минуту не шлём — остальное ждёт в журнале. */
const ALERTS_PER_MINUTE = 20;

const nf = new Intl.NumberFormat("ru-RU");
const tf = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Minsk", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/**
 * Экранирование для parse_mode HTML.
 * @param {unknown} s текст
 * @return {string} безопасный текст
 */
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Число со знаком: +16 055 / −7 000.
 * @param {number} n число
 * @return {string} строка
 */
function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf.format(Math.abs(n))}`;
}

/** Названия операций с балансом — по пометке econ_op. */
export const ECON_KINDS: Record<string, string> = {
  slots: "слоты",
  coinflip: "монетка",
  crash_bet: "краш, ставка",
  crash_cashout: "краш, выигрыш",
  plinko: "плинко",
  synthesize: "синтез артефакта",
  duel: "дуэль в Telegram",
  daily_bonus: "ежедневный бонус",
  birthday: "бонус в день рождения",
  purchase: "покупка",
  referral: "реферал",
  referral_bonus: "бонус новичку по рефералу",
  referral_prize: "приз реферального конкурса",
  stepper: "шагомер",
  admin_credits: "правка баланса в админке",
  admin_items: "выдача предметов в админке",
  admin_migrate: "перенос аккаунта в админке",
  direct: "запись в обход сервера",
  server_unknown: "сервер, без пометки",
};

type Doc = FirebaseFirestore.DocumentData;

/**
 * Кто записал — строкой.
 * @param {Doc | undefined} a поле author записи
 * @return {string} описание
 */
function authorLine(a: Doc | undefined): string {
  if (!a) return "";
  if (a.type === "server") return "Кто: сервер (функции или сайт)";
  if (a.type === "system") return "Кто: платформа";
  return `Кто: напрямую в базу — ${esc(a.authType)}${a.id ? ` <code>${esc(a.id)}</code>` : ""}`;
}

/**
 * Ссылка на человека: ник и id в журнале.
 * @param {unknown} uid uid
 * @param {unknown} name ник
 * @return {string} HTML
 */
function who(uid: unknown, name: unknown): string {
  if (!uid) return esc(name || "—");
  return `<a href="${SITE}/admin/activity?user=${encodeURIComponent(String(uid))}">${esc(name || uid)}</a>`;
}

/**
 * Ссылка на журнал аудита Firestore по документу пользователя и минуте
 * события. Триггер знает автора записи не всегда точно: запись из приложения
 * может прийти от служебного аккаунта правил Firebase, а uid человека в
 * журнале аудита лежит в thirdPartyPrincipal.
 * @param {Doc} e запись журнала
 * @return {string | null} ссылка или null
 */
export function auditLink(e: Doc): string | null {
  const at = e.at?.toDate ? e.at.toDate().getTime() : null;
  if (!e.uid || at === null) return null;
  const query = "protoPayload.serviceName=\"firestore.googleapis.com\"\n" +
    `protoPayload.request.writes.update.name:"users/${e.uid}"`;
  const range = `${new Date(at - 120_000).toISOString()}/${new Date(at + 60_000).toISOString()}`;
  return "https://console.cloud.google.com/logs/query;query=" + encodeURIComponent(query) +
    ";timeRange=" + encodeURIComponent(range) + "?project=protomap-1e1db";
}

/**
 * Текст уведомления по записи журнала.
 * @param {Doc} e запись
 * @return {string} HTML для Telegram
 */
export function alertText(e: Doc): string {
  const at = e.at?.toDate ? tf.format(e.at.toDate()) : "";
  const lines: string[] = [];

  if (e.group === "economy") {
    lines.push(e.flag === "direct" ? "<b>Баланс изменён в обход игр</b>" : "<b>Крупное изменение баланса</b>");
    const items = e.items?.added?.length ? ` · вещи +${e.items.added.length}` : "";
    lines.push(`${who(e.uid, e.username)}: ${signed(e.delta ?? 0)} PC → ${nf.format(e.balance ?? 0)}${items}`);
    lines.push(`Операция: ${esc(ECON_KINDS[e.kind] ?? e.kind)}${e.ref ? ` (${esc(e.ref)})` : ""}`);
  } else if (e.group === "moderation") {
    lines.push(`<b>${e.kind === "ban" ? "Бан" : "Разбан"} в обход админки</b>`);
    lines.push(`${who(e.uid, e.username)}${e.text ? ` — ${esc(e.text)}` : ""}`);
  } else if (e.kind === "role") {
    lines.push("<b>Изменена роль в профиле</b>");
    lines.push(`${who(e.uid, e.username)} → ${esc(e.text)}`);
  } else if (String(e.kind).startsWith("admins_")) {
    const what = {admins_added: "добавлен", admins_removed: "убран", admins_changed: "изменён"}[e.kind as string];
    lines.push(`<b>Список админов: ${what ?? esc(e.kind)}</b>`);
    lines.push(`${who(e.target, e.targetName)}${e.text ? ` · роль ${esc(e.text)}` : ""}`);
  } else if (String(e.kind).startsWith("shop_")) {
    const what = {shop_added: "товар добавлен", shop_removed: "товар убран", shop_changed: "товар изменён"}[e.kind as string];
    lines.push(`<b>Витрина: ${what ?? esc(e.kind)}</b>`);
    lines.push(`<code>${esc(e.ref)}</code>${e.text ? ` · ${esc(e.text)}` : ""}`);
  } else if (e.group === "admin") {
    lines.push("<b>Админка сайта</b>");
    const amount = typeof e.delta === "number" ? ` · ${signed(e.delta)} PC` : "";
    lines.push(`${who(e.uid, e.username)} → ${who(e.target, e.targetName)}: ${esc(e.text ?? e.kind)}${amount}`);
  } else {
    lines.push(`<b>${esc(e.group)} / ${esc(e.kind)}</b>`);
    if (e.uid) lines.push(who(e.uid, e.username));
  }

  const author = authorLine(e.author);
  if (author) lines.push(author);
  const audit = e.flag === "direct" ? auditLink(e) : null;
  if (audit) lines.push(`<a href="${audit}">Кто именно — журнал аудита</a>`);
  lines.push(`${at} · <a href="${SITE}/admin/activity?alerts=1">журнал</a>`);
  return lines.join("\n");
}

/**
 * Сообщение Ориону в личку.
 * @param {string} html текст с разметкой HTML
 * @return {Promise<boolean>} ушло ли
 */
async function sendToOrion(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[ACTIVITY] TELEGRAM_BOT_TOKEN не задан");
    return false;
  }
  const res = await (globalThis as any).fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({chat_id: ORION_TG_ID, text: html, parse_mode: "HTML", disable_web_page_preview: true}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error(`[ACTIVITY] Telegram ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return false;
  }
  return true;
}

/**
 * Можно ли слать ещё одно уведомление в эту минуту. Сколько пропущено —
 * допишется к следующему отправленному.
 * @return {Promise<{ok: boolean; dropped: number}>} решение и счёт пропусков
 */
async function takeAlertSlot(): Promise<{ok: boolean; dropped: number}> {
  const ref = db().collection("system").doc("activity_alerts");
  const minute = Math.floor(Date.now() / 60_000);
  return db().runTransaction(async (t) => {
    const d = (await t.get(ref)).data() ?? {};
    const count = d.minute === minute ? Number(d.count ?? 0) : 0;
    const dropped = Number(d.dropped ?? 0);
    if (count >= ALERTS_PER_MINUTE) {
      t.set(ref, {minute, count, dropped: dropped + 1}, {merge: true});
      return {ok: false, dropped};
    }
    t.set(ref, {minute, count: count + 1, dropped: 0}, {merge: true});
    return {ok: true, dropped};
  });
}

/** Тревожная запись журнала — сразу в личку. */
export const activityAlert = onDocumentCreated(
  {document: `${ACTIVITY}/{entryId}`, region: FIRESTORE_REGION, secrets: ["TELEGRAM_BOT_TOKEN"]},
  async (event) => {
    const e = event.data?.data();
    if (!e || e.alert !== true) return;
    const slot = await takeAlertSlot();
    if (!slot.ok) return;
    const tail = slot.dropped > 0 ? `\n\n<i>Ещё ${slot.dropped} уведомл. пропущено из-за частоты — они в журнале.</i>` : "";
    await sendToOrion(alertText(e) + tail);
  }
);

// ─── Сводка за сутки ─────────────────────────────────────────────────────

const GAMES = new Set(["slots", "coinflip", "crash_bet", "crash_cashout", "plinko", "synthesize", "duel"]);
const BONUSES = new Set(["daily_bonus", "birthday", "referral", "referral_bonus", "referral_prize", "stepper"]);
const ADMIN_ECON = new Set(["admin_credits", "admin_items", "admin_migrate"]);

/**
 * Текст сводки по записям журнала за сутки.
 * Чистая функция — проверяется тестами без Firebase.
 * @param {Doc[]} entries записи за сутки
 * @param {number | null} bank текущий банк казино
 * @return {string} HTML для Telegram
 */
export function digestText(entries: Doc[], bank: number | null): string {
  let won = 0; let lost = 0; let spent = 0; let purchases = 0; let bonuses = 0;
  let adminEcon = 0; let adminSum = 0;
  const count: Record<string, number> = {};
  const net = new Map<string, {name: string; sum: number}>();

  for (const e of entries) {
    const key = `${e.group}.${e.kind}`;
    count[key] = (count[key] ?? 0) + 1;
    if (e.flag) count[`flag.${e.flag}`] = (count[`flag.${e.flag}`] ?? 0) + 1;
    if (e.alert) count.alerts = (count.alerts ?? 0) + 1;
    if (e.group !== "economy" || typeof e.delta !== "number") continue;

    const d = e.delta as number;
    if (GAMES.has(e.kind)) {
      if (d >= 0) won += d;
      else lost += d;
    } else if (e.kind === "purchase") {
      purchases++;
      spent += -d;
    } else if (BONUSES.has(e.kind)) {
      bonuses += d;
    } else if (ADMIN_ECON.has(e.kind)) {
      adminEcon++;
      adminSum += d;
    }

    if (e.uid) {
      const cur = net.get(e.uid) ?? {name: String(e.username || e.uid), sum: 0};
      cur.sum += d;
      net.set(e.uid, cur);
    }
  }

  const c = (k: string) => count[k] ?? 0;
  const ranked = [...net.entries()].sort((a, b) => b[1].sum - a[1].sum);
  const fmtTop = (list: typeof ranked) =>
    list.map(([uid, x]) => `${who(uid, x.name)} ${signed(x.sum)}`).join(", ") || "—";
  const top = ranked.filter(([, x]) => x.sum > 0).slice(0, 3);
  const bottom = ranked.filter(([, x]) => x.sum < 0).reverse().slice(0, 3);

  return [
    "<b>Сводка за сутки</b>",
    `Игры: выиграно ${signed(won)}, проиграно ${signed(lost)}, итог ${signed(won + lost)} PC` +
      (bank !== null ? ` · банк ${nf.format(bank)}` : ""),
    `Покупки: ${purchases} на ${nf.format(spent)} PC · бонусы ${signed(bonuses)} PC`,
    `Больше всех прибавили: ${fmtTop(top)}`,
    `Больше всех убавили: ${fmtTop(bottom)}`,
    `Правки админки: ${adminEcon}${adminEcon ? ` (${signed(adminSum)} PC)` : ""} · ` +
      `в обход сервера: ${c("flag.direct")} · без пометки: ${c("flag.unexplained")}`,
    `Аккаунты: новых ${c("account.created")}, удалено ${c("account.deleted")}, ` +
      `банов ${c("moderation.ban")}, жалоб ${c("moderation.report")}`,
    `Контент: комментарии ${c("content.profile_comment")}, чат ${c("content.chat")}, ` +
      `посты ${c("content.channel_post")}, комментарии каналов ${c("content.channel_comment")}`,
    `Тревог за сутки: ${c("alerts")} · <a href="${SITE}/admin/activity">журнал</a>`,
  ].join("\n");
}

/**
 * Сводку Gemini — под заголовок дайджеста, курсивом.
 * @param {string} digest текст дайджеста (первая строка — заголовок)
 * @param {string} brief сводка Gemini
 * @return {string} HTML
 */
export function withBrief(digest: string, brief: string): string {
  const [title, ...rest] = digest.split("\n");
  return [title, `<i>${briefHtml(brief)}</i>`, "", ...rest].join("\n");
}

/**
 * Каждый вечер — что было за сутки. Сверху — сводка Gemini (brief.ts); она же
 * ложится на главную админки. Не ответил Gemini — дайджест уходит без неё.
 */
export const activityDigest = onSchedule(
  {schedule: "every day 21:00", timeZone: "Europe/Minsk", secrets: ["TELEGRAM_BOT_TOKEN"], timeoutSeconds: 180},
  async () => {
    const now = Date.now();
    const since = Timestamp.fromMillis(now - 86_400_000);
    const [snap, bankDoc, brief] = await Promise.all([
      db().collection(ACTIVITY).where("at", ">=", since).orderBy("at").get(),
      db().collection("system").doc("casino_stats").get(),
      makeBrief(now - 86_400_000, now, "day").catch((e) => {
        console.error("[DIGEST] Сводка Gemini не получилась:", e);
        return null;
      }),
    ]);
    const bank = Number(bankDoc.get("bank_balance"));
    const digest = digestText(snap.docs.map((d) => d.data()), Number.isFinite(bank) ? bank : null);
    await sendToOrion(brief ? withBrief(digest, brief.ru) : digest);
  }
);
