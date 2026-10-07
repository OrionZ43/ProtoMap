// Плинко: правила и розыгрыш одного шарика.
//
// Модуль без обращения к базе (зависит только от правил витрины). Его же импортирует клиент
// (src/lib/games/plinko.ts), чтобы подписи лунок и лимит ставки на экране
// совпадали с тем, по чему платит сервер. Исход решает только playPlinko.

import type {SaleFields} from "./shopRules";
import {isWithinWindow} from "./shopRules";

/**
 * Плинко открывается вместе с Хэллоуином 2026 и дальше остаётся насовсем.
 * До этого момента игру не показывает сайт и не принимает playPlinko.
 */
export const PLINKO_OPENS_AT = Date.parse("2026-10-20T00:00:00+03:00");

/**
 * Открыто ли Плинко.
 * @param {number} now текущее время, мс
 * @return {boolean} игра доступна
 */
export function isPlinkoOpen(now: number): boolean {
  return now >= PLINKO_OPENS_AT;
}

/** Рядов штырьков: шарик проходит каждый, отскакивая влево или вправо. */
export const PLINKO_ROWS = 16;

/**
 * Выплата по лункам слева направо, в десятых долях ставки (30 — это ×3).
 * Целые числа — чтобы выплата считалась без ошибок дробей.
 *
 * Лунка k — это k отскоков вправо из 16, её шанс C(16, k) / 2^16.
 * Середина (×0,3–×0,7) забирает часть ставки у четырёх шариков из пяти,
 * край (×50) выпадает один раз на 32 768. Возврат — 89,6%: ниже слотов
 * (~91,5%), выше Краша (~88%).
 */
export const PLINKO_PAYOUT_TENTHS: readonly number[] = [
  500, 250, 120, 60, 30, 15, 7, 4, 3, 4, 7, 15, 30, 60, 120, 250, 500,
];

/** Минимум за шарик: при меньшей ставке выплаты середины уходили бы в ноль. */
export const PLINKO_MIN_BET = 10;

/** Потолок ставки за шарик, даже когда банк очень большой. */
export const PLINKO_MAX_BET_CAP = 500;

/** Шариков за один бросок. */
export const PLINKO_MAX_BALLS = 10;

/**
 * Приз ивента: шарик в крайних лунках (×12 и выше) приносит Тыквенную рамку —
 * одну на игрока. Шанс на шарик — 274 из 65 536, примерно 1 из 239. Выплата
 * за лунку при этом прежняя. Когда приз разыгрывается, решает окно документа
 * shop_items/frame_pumpkin_head (available_from / available_until).
 */
export const PLINKO_PRIZE_ITEM = "frame_pumpkin_head";
export const PLINKO_PRIZE_SLOTS: readonly number[] = [0, 1, 2, 14, 15, 16];

/**
 * Разыгрывается ли приз для игрока: документ приза есть, его окно открыто,
 * а рамки у игрока ещё нет.
 * @param {SaleFields | undefined} prizeItem данные shop_items/frame_pumpkin_head
 * @param {string[]} owned owned_items игрока
 * @param {number} now текущее время, мс
 * @return {boolean} приз в игре
 */
export function isPlinkoPrizeOpen(
  prizeItem: SaleFields | undefined,
  owned: readonly string[],
  now: number
): boolean {
  return prizeItem !== undefined &&
    isWithinWindow(prizeItem, now) &&
    !owned.includes(PLINKO_PRIZE_ITEM);
}

/**
 * Ставка за шарик — не больше 0,1% общего банка казино. При ×50 один шарик
 * забирает не больше 5% банка; банк худеет — падает и лимит. Если лимит
 * меньше PLINKO_MIN_BET, игра закрыта.
 * @param {number} bank баланс system/casino_stats.bank_balance
 * @return {number} максимальная ставка за шарик
 */
export function plinkoMaxBet(bank: number): number {
  if (!Number.isFinite(bank) || bank <= 0) return 0;
  return Math.min(PLINKO_MAX_BET_CAP, Math.floor(bank / 1000));
}

/**
 * Выплата за шарик в лунке slot, с округлением вниз.
 * @param {number} bet ставка за шарик, целое число
 * @param {number} slot номер лунки слева, от 0 до PLINKO_ROWS
 * @return {number} выплата в PC
 */
export function plinkoPayout(bet: number, slot: number): number {
  return Math.floor((bet * PLINKO_PAYOUT_TENTHS[slot]) / 10);
}

/**
 * Путь шарика: 0 — отскок влево, 1 — вправо. Лунка — число отскоков вправо.
 * @param {function(): number} randomBit источник 0 и 1; на сервере — crypto
 * @return {{path: number[], slot: number}} путь и лунка
 */
export function dropBall(
  randomBit: () => number
): { path: number[]; slot: number } {
  const path: number[] = [];
  for (let row = 0; row < PLINKO_ROWS; row++) {
    path.push(randomBit() === 1 ? 1 : 0);
  }
  return {path, slot: path.reduce((sum, bit) => sum + bit, 0)};
}
