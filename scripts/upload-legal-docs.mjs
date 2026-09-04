// scripts/upload-legal-docs.mjs
//
// Заливка Политики конфиденциальности и Пользовательского соглашения в Firestore.
//
// Документы живут в `system/licenses`: поля `privacy_policy` и `terms_of_service`
// хранят XML целиком, `privacy_policy_version` и `terms_of_service_version` —
// строки версий. Версии читает LegalUpdateBanner и показывает баннер повторного
// принятия, когда версия в базе разошлась с сохранённой у пользователя.
//
// Почему скриптом, а не руками в консоли Firebase: документы по 70–95 КБ, в
// консоли их легко обрезать или испортить кавычками, а ошибка в юридическом
// тексте на проде — это не то, что чинится откатом деплоя.
//
// Запуск:
//   node scripts/upload-legal-docs.mjs                 # показать, что будет сделано
//   node scripts/upload-legal-docs.mjs --apply         # применить
//   node scripts/upload-legal-docs.mjs --only=privacy --apply
//
// По умолчанию — сухой прогон. Скрипт пишет в прод, поэтому применение требует
// явного --apply.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { XMLParser } from 'fast-xml-parser';

const VERSION = '5.0';

const DOCS = {
	privacy: {
		file: 'docs/аудит/privacy_policy_v5.xml',
		field: 'privacy_policy',
		versionField: 'privacy_policy_version',
		expectedId: 'privacy_policy'
	},
	tos: {
		file: 'docs/аудит/terms_of_service_v5.xml',
		field: 'terms_of_service',
		versionField: 'terms_of_service_version',
		expectedId: 'terms_of_service'
	}
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;

if (only && !DOCS[only]) {
	console.error(`Неизвестный --only=${only}. Допустимо: ${Object.keys(DOCS).join(', ')}`);
	process.exit(1);
}

// ─── Креды ────────────────────────────────────────────────────────────────────

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

// ─── Проверки документа ───────────────────────────────────────────────────────

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	preserveOrder: true,
	textNodeName: '#text',
	trimValues: true
});

const KNOWN_TAGS = [
	'title',
	'section',
	'subsection',
	'paragraph',
	'bullet',
	'alert',
	'highlight',
	'contact'
];

function tagOf(child) {
	return Object.keys(child).find((k) => k !== ':@' && k !== '#text') ?? null;
}

function textOf(nodes) {
	if (!Array.isArray(nodes)) return String(nodes ?? '').trim();
	return String(nodes.find((n) => '#text' in n)?.['#text'] ?? '').trim();
}

function locOf(children) {
	const ru = children.find((c) => 'ru' in c);
	const en = children.find((c) => 'en' in c);
	return { ru: ru ? textOf(ru.ru) : '', en: en ? textOf(en.en) : '' };
}

/**
 * Повторяет логику src/lib/server/legalLoader.ts. Если документ не проходит
 * здесь — на сайте он отрендерится пустым или с дырами, а узнаем мы об этом
 * уже на проде.
 */
function validate(xml, expectedId) {
	const problems = [];

	// Незаполненные плейсхолдеры — самая дорогая ошибка: документ уходит в прод
	// со строкой «[ДАТА]» вместо даты вступления в силу.
	const placeholders = [...new Set(xml.match(/\[[А-ЯA-Z][^\]]*\]/g) ?? [])];
	if (placeholders.length) {
		problems.push(`незаполненные плейсхолдеры: ${placeholders.join(', ')}`);
	}

	let parsed;
	try {
		parsed = parser.parse(xml);
	} catch (e) {
		problems.push(`XML не парсится: ${e.message}`);
		return { problems, stats: null };
	}

	const entry = parsed.find((n) => 'document' in n);
	if (!entry) {
		problems.push('нет корневого <document>');
		return { problems, stats: null };
	}

	const id = (entry[':@'] ?? {})['@_id'];
	if (id !== expectedId) problems.push(`id="${id}", ожидался "${expectedId}"`);

	const children = entry.document ?? [];
	const counts = {};
	let nodes = 0;

	for (const child of children) {
		const tag = tagOf(child);
		if (!tag) continue;
		nodes++;
		counts[tag] = (counts[tag] || 0) + 1;

		if (!KNOWN_TAGS.includes(tag)) {
			problems.push(`неизвестный тег <${tag}> — рендерер молча его пропустит`);
			continue;
		}

		const content = child[tag] ?? [];

		if (tag === 'alert') {
			const t = content.find((c) => 'title' in c);
			const x = content.find((c) => 'text' in c);
			if (!t || !x) problems.push('<alert> без <title> или <text>');
			else {
				const lt = locOf(t.title);
				const lx = locOf(x.text);
				if (!lt.ru || !lt.en || !lx.ru || !lx.en)
					problems.push(`<alert> без пары ru/en: "${(lt.ru || lx.ru).slice(0, 40)}"`);
			}
		} else if (tag === 'highlight') {
			const t = content.find((c) => 'title' in c);
			const d = content.find((c) => 'description' in c);
			if (!t) problems.push('<highlight> без <title>');
			else if (!d) problems.push(`<highlight> "${textOf(t.title)}" без <description>`);
			else {
				const ld = locOf(d.description);
				if (!ld.ru || !ld.en)
					problems.push(`<highlight> "${textOf(t.title)}" без пары ru/en`);
			}
		} else if (tag === 'contact') {
			if (!(child[':@'] ?? {})['@_email']) problems.push('<contact> без email');
		} else {
			const l = locOf(content);
			if (!l.ru || !l.en)
				problems.push(`<${tag}> без пары ru/en: "${(l.ru || l.en || '(пусто)').slice(0, 40)}"`);
		}
	}

	if (nodes === 0) problems.push('в документе нет ни одного узла');

	return { problems, stats: { nodes, counts } };
}

// ─── Основной проход ──────────────────────────────────────────────────────────

const targets = only ? { [only]: DOCS[only] } : DOCS;

console.log(`Документ: system/licenses`);
console.log(`Версия:   ${VERSION}`);
console.log(`Режим:    ${apply ? 'ПРИМЕНЕНИЕ' : 'сухой прогон (добавь --apply)'}\n`);

const prepared = {};
let blocked = false;

for (const [key, cfg] of Object.entries(targets)) {
	let xml;
	try {
		xml = readFileSync(cfg.file, 'utf8');
	} catch {
		console.log(`✗ ${key}: не найден ${cfg.file}`);
		blocked = true;
		continue;
	}

	const { problems, stats } = validate(xml, cfg.expectedId);

	console.log(`${key} — ${cfg.file}`);
	console.log(`   размер: ${Math.round(xml.length / 1024)} КБ`);
	if (stats) console.log(`   узлов:  ${stats.nodes}  ${JSON.stringify(stats.counts)}`);

	if (problems.length) {
		console.log('   ✗ проблемы:');
		problems.forEach((p) => console.log(`      - ${p}`));
		blocked = true;
	} else {
		console.log('   ✓ структура в порядке');
		prepared[key] = { cfg, xml };
	}
	console.log();
}

if (blocked) {
	console.log('Заливка отменена: сначала почини перечисленное выше.');
	process.exit(1);
}

const db = getFirestore(initializeApp({ credential: cert(readServiceAccount()) }));
const ref = db.collection('system').doc('licenses');
const snap = await ref.get();
const current = snap.data() ?? {};

console.log('Текущее состояние в Firestore:');
for (const [key, { cfg }] of Object.entries(prepared)) {
	const curVer = current[cfg.versionField] ?? '(нет)';
	const curLen = (current[cfg.field] ?? '').length;
	console.log(
		`   ${cfg.field}: версия ${curVer} → ${VERSION},  ` +
			`${Math.round(curLen / 1024)} КБ → ${Math.round(prepared[key].xml.length / 1024)} КБ`
	);
}
console.log();

if (!apply) {
	console.log('Сухой прогон окончен. Ничего не записано. Для записи добавь --apply.');
	process.exit(0);
}

const payload = {};
for (const [, { cfg, xml }] of Object.entries(prepared)) {
	payload[cfg.field] = xml;
	payload[cfg.versionField] = VERSION;
}

await ref.set(payload, { merge: true });

console.log('Записано.');
console.log();
console.log('Дальше вручную:');
console.log('  1. Открыть /privacy-policy и /terms-of-service, проверить рендер.');
console.log('  2. Убедиться, что LegalUpdateBanner показал баннер повторного принятия.');
console.log('  3. Проверить, что Android-клиент подхватил новую версию.');
