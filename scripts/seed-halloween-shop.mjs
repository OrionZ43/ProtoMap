// scripts/seed-halloween-shop.mjs
//
// Хэллоуинская косметика в shop_items: пять рамок и три фона.
//
// Продаются только в окно available_from — available_until. Окно проверяют
// purchaseShopItem (functions/src/shopRules.ts) и витрина магазина, так что
// после конца окна товар сам пропадает из продажи, а у купивших остаётся.
// Тыквенная голова не продаётся (is_hidden: true — его понимает и Android-приложение):
// это приз Плинко, её выдаёт playPlinko, пока открыто то же окно. Цена 999999, как
// у других непродажных рамок, — на случай, если флаг когда-нибудь сотрут.
//
// Картинки и CSS — в коде сайта (static/halloween/cosmetics/, cosmetics.css,
// profile-skins.css), id документа — это класс CSS. Поэтому сначала выкатывается
// сайт и функции, потом этот скрипт: иначе товар появится на витрине без картинки.
//
// Запуск:
//   node scripts/seed-halloween-shop.mjs            # показать, что будет записано
//   node scripts/seed-halloween-shop.mjs --apply    # записать в прод
//
// Товары, цены и окно продаж — в src/lib/shop/halloween.json: по нему же дев-сервер
// с VITE_PREVIEW_DATE показывает товары, которых ещё нет в базе. Через год достаточно
// поменять там даты и перезапустить: обновятся только поля товаров, купленное
// у игроков не трогается.
//
// Заодно прячет с витрины приложения товары прошлых сезонов (HIDE): сайт их
// не продаёт по HIDDEN_ITEM_IDS в shopRules.ts, а приложение смотрит только на is_hidden.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const CATALOG = JSON.parse(readFileSync(new URL('../src/lib/shop/halloween.json', import.meta.url), 'utf8'));
const FROM = new Date(CATALOG.available_from);
const UNTIL = new Date(CATALOG.available_until);
const ITEMS = CATALOG.items;

// Рамка зимнего ивента: у купивших остаётся, в продаже её быть не должно.
const HIDE = ['frame_cryo'];

const apply = process.argv.includes('--apply');

function readServiceAccount() {
	let raw;
	try {
		raw = readFileSync('.env', 'utf8');
	} catch {
		throw new Error('Не найден .env в текущей папке. Запускать из корня проекта.');
	}

	const line = raw
		.split(/\r?\n/)
		.find((l) => l.startsWith('PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY='));
	if (!line) throw new Error('В .env нет PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY');

	let value = line.slice('PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY='.length).trim();
	if (
		(value.startsWith("'") && value.endsWith("'")) ||
		(value.startsWith('"') && value.endsWith('"'))
	) {
		value = value.slice(1, -1);
	}
	return JSON.parse(value);
}

const db = getFirestore(initializeApp({ credential: cert(readServiceAccount()) }));
const fmt = (d) => d.toISOString().replace('.000Z', 'Z');

console.log(`Окно: ${fmt(FROM)} — ${fmt(UNTIL)}${apply ? '' : '   (сухой прогон, без --apply ничего не пишется)'}\n`);

const batch = db.batch();
for (const [id, item] of Object.entries(ITEMS)) {
	const ref = db.collection('shop_items').doc(id);
	const snap = await ref.get();
	const doc = {
		...item,
		is_hidden: item.is_hidden ?? false,
		style_value: id,
		available_from: Timestamp.fromDate(FROM),
		available_until: Timestamp.fromDate(UNTIL)
	};
	const state = snap.exists ? 'обновить' : 'создать';
	console.log(`${state.padEnd(9)} ${id.padEnd(22)} ${String(item.price).padStart(5)} PC  ${doc.is_hidden ? 'приз' : 'продаётся'}  ${item.name}`);
	batch.set(ref, doc, { merge: true });
}

for (const id of HIDE) {
	const snap = await db.collection('shop_items').doc(id).get();
	if (!snap.exists) continue;
	console.log(`спрятать  ${id.padEnd(22)} ${String(snap.data().price).padStart(5)} PC  было is_hidden: ${snap.data().is_hidden === true}`);
	batch.set(snap.ref, { is_hidden: true }, { merge: true });
}

if (apply) {
	await batch.commit();
	console.log('\nЗаписано.');
} else {
	console.log('\nДля записи — тот же запуск с --apply.');
}
