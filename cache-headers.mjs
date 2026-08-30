// cache-headers.mjs
//
// Разовый бэкфилл заголовка Cache-Control у файлов в Firebase Storage.
//
// Зачем. Storage НЕ ставит Cache-Control, если не задать метаданные явно, и
// отдаёт объект как `private, max-age=0`. Браузер обязан перепроверять такой
// файл при каждом показе: приходит 304 без тела, байты не качаются, но сетевой
// round-trip происходит на каждый файл. Для пикера стикеров это 30+ запросов
// при каждом открытии — отсюда ощущение, что всё грузится заново.
//
// Новые файлы чата (chat_media/**) заливаются уже с правильным заголовком —
// см. cacheControl в messages/+page.svelte и DMInbox.svelte. Этот скрипт нужен
// для того, что залито РАНЬШЕ, и для стикеров, которые кладут руками.
//
// Запуск:
//   node cache-headers.mjs                 # показать, что будет сделано
//   node cache-headers.mjs --apply         # применить
//   node cache-headers.mjs --prefix=chat_media/ --apply
//
// По умолчанию — сухой прогон. Скрипт меняет прод-хранилище, поэтому
// применение требует явного --apply.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const BUCKET = 'protomap-1e1db.firebasestorage.app';

// max-age год + immutable: у стикеров и медиа чата путь однозначно определяет
// содержимое (имя файла для стикеров, id сообщения для медиа).
//
// ВАЖНО: immutable означает, что браузер не перепроверит файл до истечения
// срока. Если стикер когда-нибудь заменят, положив новый файл ПОД ТЕМ ЖЕ
// именем, у уже заходивших пользователей год будет висеть старый. Заменять
// стикеры нужно под новым именем. Если такой порядок не подходит — убрать
// immutable и поставить max-age поменьше, например 604800 (неделя).
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const prefixArg = args.find((a) => a.startsWith('--prefix='));
const prefix = prefixArg ? prefixArg.split('=')[1] : 'stickers/';

function readServiceAccount() {
	let raw;
	try {
		raw = readFileSync('.env', 'utf8');
	} catch {
		throw new Error('Не найден .env в текущей папке');
	}

	// Значение — JSON в одну строку, возможно в кавычках.
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

const bucket = getStorage(
	initializeApp({ credential: cert(readServiceAccount()), storageBucket: BUCKET })
).bucket();

console.log(`Бакет:   ${BUCKET}`);
console.log(`Префикс: ${prefix}`);
console.log(`Режим:   ${apply ? 'ПРИМЕНЕНИЕ' : 'сухой прогон (добавь --apply)'}\n`);

const [files] = await bucket.getFiles({ prefix });
if (files.length === 0) {
	console.log('Файлов не найдено — проверь префикс.');
	process.exit(0);
}

let alreadyOk = 0;
let changed = 0;
let failed = 0;

for (const file of files) {
	const current = file.metadata?.cacheControl ?? '(не задан)';
	if (current === CACHE_CONTROL) {
		alreadyOk++;
		continue;
	}

	if (!apply) {
		console.log(`  ${file.name}\n      было: ${current}`);
		changed++;
		continue;
	}

	try {
		await file.setMetadata({ cacheControl: CACHE_CONTROL });
		changed++;
		if (changed % 25 === 0) console.log(`  обработано: ${changed}`);
	} catch (e) {
		failed++;
		console.error(`  ОШИБКА ${file.name}: ${e.message}`);
	}
}

console.log(`\nВсего файлов:      ${files.length}`);
console.log(`Уже с заголовком:  ${alreadyOk}`);
console.log(apply ? `Обновлено:         ${changed}` : `Будет обновлено:   ${changed}`);
if (failed) console.log(`Ошибок:            ${failed}`);
if (!apply && changed > 0) console.log('\nЧтобы применить: node cache-headers.mjs --apply');
