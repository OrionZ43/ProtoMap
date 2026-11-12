// Переносит шрифты Google Fonts на свой хостинг: static/fonts/*.woff2 + static/fonts.css.
// Зачем: браузер посетителя не ходит на fonts.googleapis.com / fonts.gstatic.com (IP не
// уходит Google), минус два чужих домена при загрузке. Лицензия шрифтов — SIL OFL 1.1, список
// с копирайтами — static/licenses/third-party.txt (п. 6). Меняете набор шрифтов — правьте SOURCES.
// Запускать из корня проекта. Берёт ровно те же запросы css2, что сейчас в коде.
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SOURCES = [
	'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Russo+One&display=swap',
	'https://fonts.googleapis.com/css2?family=Creepster&display=swap',
	'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;700;900&family=Inter:wght@400;700&display=swap',
	'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@300;400;500;600&display=swap'
];
// Сайт на ru/en: греческий, вьетнамский и тайский не нужны. math/symbols оставляем —
// у админских Onest/Unbounded там стрелки и знаки.
const KEEP = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'math', 'symbols']);
const OUT = 'static/fonts';
const CSS_OUT = 'static/fonts.css'; // в корне: /fonts/ целиком под immutable-кэшем (vercel.json)
const OFL = { Inter: 'inter', 'Russo One': 'russoone', 'Chakra Petch': 'chakrapetch', Creepster: 'creepster', Onest: 'onest', Unbounded: 'unbounded' };

(async () => {
	const faces = new Map(); // ключ: family|style|weight|subset -> блок
	for (const url of SOURCES) {
		const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
		const re = /\/\* ([a-z-]+) \*\/\s*@font-face\s*\{([^}]+)\}/g;
		let m;
		while ((m = re.exec(css))) {
			const subset = m[1];
			const body = m[2];
			const get = (k) => (body.match(new RegExp(k + ':\\s*([^;]+);')) || [])[1]?.trim();
			const family = get('font-family').replace(/'/g, '');
			const style = get('font-style');
			const weight = get('font-weight');
			const src = (body.match(/url\(([^)]+\.woff2)\)/) || [])[1];
			const range = get('unicode-range');
			if (!KEEP.has(subset)) continue;
			const key = `${family}|${style}|${weight}|${subset}`;
			if (!faces.has(key)) faces.set(key, { family, style, weight, subset, src, range });
		}
	}

	// скачать уникальные woff2
	const urls = [...new Set([...faces.values()].map((f) => f.src))];
	let bytes = 0;
	for (const u of urls) {
		const rel = u.split('/s/')[1]; // inter/v20/xxxx.woff2
		const dest = path.join(OUT, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
		fs.writeFileSync(dest, buf);
		bytes += buf.length;
	}

	// fonts.css
	const order = ['Inter', 'Russo One', 'Chakra Petch', 'Creepster', 'Onest', 'Unbounded'];
	const list = [...faces.values()].sort((a, b) =>
		order.indexOf(a.family) - order.indexOf(b.family) || Number(a.weight) - Number(b.weight) || a.subset.localeCompare(b.subset));
	let out = '/* Шрифты раздаются с нашего сайта, а не с Google Fonts: браузер посетителя\n' +
		'   не обращается к fonts.googleapis.com / fonts.gstatic.com. Файлы — из Google Fonts\n' +
		'   (лицензия SIL OFL 1.1, см. /licenses/third-party.txt). Наборы символов: латиница,\n' +
		'   кириллица (+ math/symbols у админских шрифтов). Пересобрать: node scripts/selfhost-fonts.cjs (из корня проекта). */\n';
	for (const f of list) {
		out += `\n/* ${f.family} ${f.weight} — ${f.subset} */\n@font-face {\n` +
			`\tfont-family: '${f.family}';\n\tfont-style: ${f.style};\n\tfont-weight: ${f.weight};\n` +
			`\tfont-display: swap;\n\tsrc: url(/fonts/${f.src.split('/s/')[1]}) format('woff2');\n` +
			`\tunicode-range: ${f.range};\n}\n`;
	}
	fs.writeFileSync(CSS_OUT, out);

	// официальные OFL.txt
	const licenses = {};
	for (const [fam, dir] of Object.entries(OFL)) {
		const r = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`);
		licenses[fam] = r.ok ? await r.text() : null;
	}

	const perFamily = {};
	for (const f of faces.values()) perFamily[f.family] = (perFamily[f.family] || 0) + 1;
	console.log('@font-face:', faces.size, perFamily);
	console.log('файлов woff2:', urls.length, '| объём:', Math.round(bytes / 1024), 'КБ');
	for (const [fam, txt] of Object.entries(licenses)) console.log('OFL', fam, ':', txt ? txt.split('\n')[0].slice(0, 110) : 'НЕ СКАЧАЛСЯ');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
