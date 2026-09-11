/**
 * Проверка экрана согласий на живом дев-сервере.
 *
 * Заходит под тестовой учёткой, убеждается, что гейт перекрывает страницу,
 * проставляет галочки, принимает и проверяет, что гейт ушёл.
 *
 *   node scripts/check-consent-gate.mjs
 *
 * Требует поднятый `npm run dev` и scripts/showcase/.env с учёткой.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = {};
for (const line of readFileSync(join(HERE, 'showcase', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) cfg[m[1]] = m[2].trim();
}
const BASE = process.env.GATE_BASE || 'http://localhost:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: join(HERE, '..', `gate-${name}.png`) });

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => m.type() === 'error' && console.warn('  [консоль]', m.text().slice(0, 160)));

// Сплэш перекрывает клики — гасим его до первой отрисовки
await page.addInitScript(() => {
    try { localStorage.setItem('protomap_app_release_v2', 'true'); } catch {}
});

console.log('Вход...');
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await sleep(1500);

// Баннер куки перекрывает кнопку входа — без этого клик уходит в него
const cookieOk = page.locator('button', { hasText: /^принять$/i }).first();
if (await cookieOk.count()) await cookieOk.click().catch(() => {});

await page.waitForSelector('input[type="password"]', { timeout: 60_000 });
await page.fill('input[type="email"], #email', cfg.SHOWCASE_EMAIL);
await page.fill('input[type="password"], #password', cfg.SHOWCASE_PASSWORD);

// В деве стоит тестовый ключ Turnstile — виджета обычно нет вовсе
const widget = page.locator('iframe[src*="challenges.cloudflare.com"]').first();
if (await widget.count()) {
    const frame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]').first();
    await frame.locator('input[type="checkbox"]').click({ timeout: 10_000 }).catch(() => {});
}

const submit = page.locator('button[type="submit"]', { hasText: /войти|log ?in/i }).first();
await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button[type=submit]')]
        .find((e) => /войти|log ?in/i.test(e.textContent || ''));
    return b && !b.disabled;
}, { timeout: 90_000 });
await submit.click();

try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
} catch {
    await shot(page, '0-login-failed');
    console.error('Вход не прошёл — скриншот gate-0-login-failed.png');
    await browser.close();
    process.exit(1);
}
console.log('Вошли.');

await sleep(3000);

// ── 1. Гейт должен перекрывать страницу ───────────────────────────────────
const gate = page.locator('[aria-labelledby="gate-title"]');
const visible = await gate.isVisible().catch(() => false);
console.log(`гейт виден:                 ${visible ? 'ДА' : 'НЕТ'}`);
await shot(page, '1-shown');
if (!visible) { await browser.close(); process.exit(1); }

// ── 2. Кнопка заблокирована, пока не отмечено всё ─────────────────────────
const accept = page.locator('button', { hasText: /Согласен, продолжить/ }).first();
console.log(`кнопка до галочек:          ${await accept.isDisabled() ? 'заблокирована' : 'АКТИВНА (плохо)'}`);

// ── 3. Под гейтом ничего не нажимается ────────────────────────────────────
const navClickable = await page
    .locator('nav a, header a').first()
    .click({ timeout: 1500, trial: true })
    .then(() => true).catch(() => false);
console.log(`ссылки под гейтом кликабельны: ${navClickable ? 'ДА (плохо)' : 'нет'}`);

// ── 4. Отмечаем всё и принимаем ───────────────────────────────────────────
// Сам input скрыт (opacity:0, нулевой размер), Playwright по нему не попадает.
// Диспатчим настоящий click на элементе — событие то же, что от живого клика
// по label, и bind:checked его видит.
const n = await page.$$eval('[aria-labelledby="gate-title"] input[type=checkbox]', (els) => {
    els.forEach((e) => { if (!e.checked) e.click(); });
    return els.length;
});
console.log(`галочек:                    ${n}`);
const checked = await page.$$eval('[aria-labelledby="gate-title"] input[type=checkbox]',
    (els) => els.filter((e) => e.checked).length);
console.log(`отмечено:                   ${checked}`);
await sleep(300);
console.log(`кнопка после галочек:       ${await accept.isDisabled() ? 'ЗАБЛОКИРОВАНА (плохо)' : 'активна'}`);
await shot(page, '2-checked');

await accept.click();
await sleep(6000);
const stillThere = await gate.isVisible().catch(() => false);
console.log(`гейт после принятия:        ${stillThere ? 'ОСТАЛСЯ (плохо)' : 'ушёл'}`);
await shot(page, '3-after');

// ── 5. Перезагрузка — гейт не должен вернуться ────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3500);
const backAgain = await gate.isVisible().catch(() => false);
console.log(`гейт после перезагрузки:    ${backAgain ? 'ВЕРНУЛСЯ (плохо)' : 'не вернулся'}`);

await browser.close();
