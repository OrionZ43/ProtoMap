// Правила витрины магазина: что видно и что можно купить.
//
// Модуль без зависимостей. Его же импортирует сайт (src/lib/shop/rules.ts), чтобы
// витрина и функция покупки не расходились: раньше скрытые предметы прятала
// только страница, а purchaseShopItem продавал их любому, кто вызовет её напрямую.
// Android-приложение читает shop_items само и прячет товары по is_hidden —
// поэтому скрытость задаёт это поле, общее для всех трёх.

/**
 * Не продаются никогда: выдаются вручную или за особые заслуги. Список остался
 * от страницы магазина; у frame_dev и frame_cryo в базе нет is_hidden.
 */
export const HIDDEN_ITEM_IDS: readonly string[] = [
  "frame_dev", "frame_beta", "frame_ludoman",
  "frame_aurora", "frame_cryo", "frame_festive",
];

/**
 * Поля shop_items, от которых зависит продажа.
 * is_hidden: true — в магазине нет: предмет только выдаётся (например, приз Плинко).
 * available_from / available_until — окно сезона; без них — всегда.
 */
export interface SaleFields {
  is_hidden?: boolean;
  available_from?: unknown;
  available_until?: unknown;
}

/**
 * Миллисекунды из Timestamp Firestore, Date, ISO-строки или числа.
 * @param {unknown} value значение поля
 * @return {number | null} время или null, если поля нет
 */
export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  const ts = value as {toMillis?: () => number};
  return typeof ts.toMillis === "function" ? ts.toMillis() : null;
}

/**
 * Идёт ли окно предмета: с available_from включительно до available_until.
 * @param {SaleFields} item поля предмета
 * @param {number} now текущее время, мс
 * @return {boolean} окно открыто
 */
export function isWithinWindow(item: SaleFields, now: number): boolean {
  const from = toMillis(item.available_from);
  const until = toMillis(item.available_until);
  return (from === null || now >= from) && (until === null || now < until);
}

/**
 * Продаётся ли предмет сейчас.
 * @param {string} id id документа shop_items
 * @param {SaleFields} item поля предмета
 * @param {number} now текущее время, мс
 * @return {boolean} можно показывать на витрине и продавать
 */
export function isOnSale(id: string, item: SaleFields, now: number): boolean {
  return !HIDDEN_ITEM_IDS.includes(id) &&
    item.is_hidden !== true &&
    isWithinWindow(item, now);
}
