/**
 * Съёмка промо-ролика ProtoMap.
 *
 * Водит браузер по приложению по сценарию и пишет видео. Не «запись с экрана»:
 * прогон воспроизводим, и когда интерфейс поменяется, достаточно запустить
 * скрипт заново вместо пересъёмки вручную.
 *
 * Снимается в мобильном окне 9:16 — этот формат нужен и для рекламы в TikTok,
 * и для витрины на странице входа: там панель почти вертикальная, видео ложится
 * в неё с обрезкой боков.
 *
 * Пишется ОДНО видео за один проход, а границы сцен складываются в scenes.json.
 * Разбивать на отдельные записи по сцене нельзя: сессия Firebase живёт в
 * IndexedDB, которую Playwright между контекстами не переносит, и каждую сцену
 * пришлось бы логиниться заново.
 *
 * Запуск:
 *   node scripts/showcase/capture.mjs
 *
 * Результат: raw/<имя>.webm и raw/scenes.json — их забирает build.mjs.
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');

// ─── Настройки ────────────────────────────────────────────────────────────────

function env() {
    const raw = readFileSync(join(HERE, '.env'), 'utf8');
    const cfg = {};
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) cfg[m[1]] = m[2].trim();
    }
    if (!cfg.SHOWCASE_EMAIL || !cfg.SHOWCASE_PASSWORD) {
        throw new Error('В scripts/showcase/.env нужны SHOWCASE_EMAIL и SHOWCASE_PASSWORD');
    }
    return cfg;
}

const cfg = env();
const BASE = cfg.SHOWCASE_BASE_URL || 'https://proto-map.vercel.app';

/**
 * Окно 540×960 при масштабе 2 даёт физические 1080×1920 — ровно то, что нужно
 * TikTok. Снимать сразу в 1080 шириной нельзя: приложение решит, что это
 * десктоп, и покажет широкую вёрстку.
 */
const VIEWPORT = { width: 540, height: 960 };
const SCALE = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Чью метку показываем крупным планом в сцене с картой. */
const FOCUS_USER = cfg.SHOWCASE_FOCUS_USER || 'Orion_Z43';

/**
 * Закрывает модалку про мобильное приложение.
 *
 * На мобильном окне SplashModal показывается поверх всего и перекрывает даже
 * форму входа — без этого шага съёмка упирается в «кнопка не разблокировалась».
 * Вызывается после каждого перехода: модалка живёт в корневом layout и может
 * появиться снова.
 */
/**
 * Закрывает баннер про куки.
 * В кадре он не нужен, а внизу экрана перекрывает ссылки.
 */
async function dismissCookies(page) {
    const accept = page.locator('button', { hasText: /^принять$/i }).first();
    if (await accept.count()) {
        await accept.click().catch(() => {});
        await sleep(300);
    }
}

/**
 * Проходит проверку Turnstile.
 *
 * Она рисуется в кросс-доменном iframe и в этом режиме требует клика по
 * галочке «Verify you are human» — сама не проходит. Playwright до фрейма
 * достаёт, но только в обычном режиме браузера: headless сам по себе выглядит
 * ботом, и защита его не пропускает.
 */
async function passTurnstile(page) {
    // С тестовым ключом (dev-режим, см. src/lib/turnstile.ts) проверка проходит
    // сама, и никакого виджета на странице нет — поэтому шаг необязательный.
    const widget = page.locator('iframe[src*="challenges.cloudflare.com"]').first();
    if (!(await widget.count())) return;

    const frame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]').first();
    try {
        await frame.locator('input[type="checkbox"]').click({ timeout: 10_000 });
    } catch {
        // Разметку внутри виджета Cloudflare меняет без предупреждения —
        // запасной путь через клик по координатам самого iframe.
        const box = await widget.boundingBox().catch(() => null);
        if (box) await page.mouse.click(box.x + 30, box.y + box.height / 2);
    }
}

async function dismissSplash(page) {
    // Модалка появляется не сразу после перехода, а когда доедет корневой
    // layout — фиксированная пауза её то ловила, то нет. Поэтому крутимся,
    // пока оверлей не исчезнет, и заодно закрываем всё, что могло всплыть
    // следом (баннер про куки, баннер обновлённых документов).
    for (let i = 0; i < 12; i++) {
        const overlay = page.locator('.overlay').first();
        const banner = page.locator('button', { hasText: /^(потом|принять)$/i }).first();

        const hasOverlay = await overlay.isVisible().catch(() => false);
        const hasBanner = (await banner.count()) > 0;

        if (!hasOverlay && !hasBanner) return;

        if (hasBanner) await banner.click({ force: true }).catch(() => {});
        await sleep(400);
    }
    console.warn('  ! оверлей не закрылся, снимаю как есть');
}

// ─── Сцены ────────────────────────────────────────────────────────────────────

const scenes = [];
let t0 = 0;

function mark(name) {
    const at = (Date.now() - t0) / 1000;
    scenes.push({ name, at });
    console.log(`  [${at.toFixed(1)}s] ${name}`);
}

/**
 * Рисует поверх страницы фирменную карточку — заставку или финал.
 *
 * Логотип и шрифты берём у самого сайта, поэтому карточка выглядит своей,
 * а не подрисованной в монтаже. Раньше и заставка, и финал были текстом,
 * впечённым ffmpeg: в начале это давало две подписи на чёрном экране, в
 * конце — ссылку поверх витрины магазина.
 *
 * @param {object} lines - `url` и `store` показываются только в финале.
 */
async function drawCard(page, lines = {}) {
    const logoSvg = readFileSync(join(HERE, '..', '..', 'static', 'logo.svg'), 'utf8');
    await page.evaluate(
        ({ svg, url, store }) => {
            document.getElementById('promo-card')?.remove();
            const card = document.createElement('div');
            card.id = 'promo-card';
            card.innerHTML =
                `<div class="ec-logo">${svg}</div>` +
                `<div class="ec-title">ProtoMap</div>` +
                (url ? `<div class="ec-url">${url}</div>` : '') +
                (store ? `<div class="ec-store">${store}</div>` : '');
            const css = document.createElement('style');
            css.textContent = `
                #promo-card {
                    position: fixed; inset: 0; z-index: 2147483647;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center; gap: 0.6rem;
                    background: radial-gradient(circle at 50% 42%, #10121c 0%, #05060a 70%);
                    font-family: 'Chakra Petch', sans-serif;
                    animation: ec-in 700ms ease both;
                }
                @keyframes ec-in { from { opacity: 0 } to { opacity: 1 } }
                #promo-card .ec-logo svg { width: 130px; height: 130px; }
                /* Логотип чёрный по умолчанию — на тёмном фоне его не видно */
                #promo-card .ec-logo svg path { fill: #f5e663; }
                #promo-card .ec-title {
                    font-size: 3.1rem; font-weight: 700; letter-spacing: 0.06em;
                    color: #f5e663; text-shadow: 0 0 26px rgba(245,230,99,0.45);
                }
                #promo-card .ec-url {
                    font-size: 1.35rem; color: #e8f4ff; letter-spacing: 0.04em;
                    border-top: 1px solid rgba(245,230,99,0.35);
                    padding-top: 0.75rem; margin-top: 0.35rem;
                }
                #promo-card .ec-store {
                    font-size: 0.95rem; color: #8ba0b8; letter-spacing: 0.05em;
                }`;
            document.head.appendChild(css);
            document.body.appendChild(card);
        },
        { svg: logoSvg, url: lines.url || '', store: lines.store || '' }
    );
}

async function main() {
    mkdirSync(RAW, { recursive: true });

    /**
     * НЕ headless — и это обязательно.
     *
     * Вход защищён Cloudflare Turnstile, то есть защитой от ботов, а headless
     * Chromium ровно им и выглядит: кнопка входа так и остаётся заблокированной.
     * В обычном режиме проверка проходит. Окно во время съёмки будет видно —
     * это нормально, трогать его не надо.
     */
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        isMobile: true,
        hasTouch: true,
        locale: 'ru-RU',
        /**
         * Размер видео равен окну, а НЕ удвоенному.
         *
         * Playwright умеет вписывать страницу в заданный размер уменьшением,
         * но не увеличением: при 1080×1920 кадр 540×960 лёг в угол, а три
         * четверти площади залились серым. До 1080×1920 доводит ffmpeg
         * при сборке.
         */
        recordVideo: {
            dir: RAW,
            size: { width: VIEWPORT.width, height: VIEWPORT.height },
        },
    });

    /**
     * Гасим модалку про мобильное приложение до первого показа.
     *
     * Закрывать её кликом после каждого перехода не выходит: она появляется
     * через секунду после навигации, когда домонтируется корневой layout,
     * а проверка отрабатывает сразу и ничего не находит. В итоге модалка
     * попадала в кадр на всех сценах.
     *
     * Ключ тот же, что ставит сама модалка при нажатии «потом»
     * (SplashModal.svelte).
     */
    await context.addInitScript(() => {
        try {
            localStorage.setItem('protomap_app_release_v2', 'true');
        } catch {
            // Приватный режим — не критично, останется клик-заглушка ниже
        }
    });

    const page = await context.newPage();

    /**
     * Момент, с которого пишется видео.
     *
     * Запись начинается при создании страницы, то есть ДО входа — а отсчёт
     * сцен идёт от момента после него. Без этой отметки метки времени сцен
     * не совпадают с дорожкой, подписи разъезжаются с картинкой, и в ролик
     * попадает экран логина с заполненным паролем. Разницу вырезает build.mjs.
     */
    const videoStartedAt = Date.now();

    // Ошибки страницы в терминал: без этого сцена молча снимается «мёртвой».
    // Так вскрылось, что спин в слотах не выполнялся — вызов функции падал,
    // а на видео барабаны просто стояли.
    page.on('console', (m) => {
        if (m.type() === 'error') console.warn(`  [консоль] ${m.text().slice(0, 220)}`);
    });
    page.on('pageerror', (e) => console.warn(`  [страница] ${String(e.message).slice(0, 220)}`));
    const seen4xx = new Set();
    page.on('response', (r) => {
        if (r.status() < 400) return;
        const url = r.url().slice(0, 160);
        if (seen4xx.has(url)) return; // одни и те же звуки просят десятки раз
        seen4xx.add(url);
        console.warn(`  [${r.status()}] ${url}`);
    });

    // ── Вход ──────────────────────────────────────────────────────────────────
    // Происходит ДО отсчёта времени: логин в ролик не попадает.
    console.log('Вход...');
    // domcontentloaded, а не networkidle: у Vite в dev-режиме открыт вебсокет
    // горячей перезагрузки, и «тишина в сети» не наступает никогда — ожидание
    // просто упирается в таймаут. Ждём конкретные элементы.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    await dismissSplash(page);
    await dismissCookies(page);
    await page.waitForSelector('input[type="password"]', { timeout: 60_000 });

    await page.fill('input[type="email"], #email', cfg.SHOWCASE_EMAIL);
    await page.fill('input[type="password"], #password', cfg.SHOWCASE_PASSWORD);

    await dismissSplash(page);
    await passTurnstile(page);

    // Ждём разблокировки именно кнопки входа: на странице есть и другие
    // submit-кнопки (чат-виджет, переключатель языка), и общий селектор
    // цеплялся за них.
    const submit = page.locator('button[type="submit"]', { hasText: /войти|log ?in/i }).first();
    await submit.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForFunction(
        () => {
            const b = [...document.querySelectorAll('button[type=submit]')]
                .find((e) => /войти|log ?in/i.test(e.textContent || ''));
            return b && !b.disabled;
        },
        { timeout: 90_000 }
    );
    await submit.click();

    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
    console.log('Вошли.\n');

    // ── Прогрев маршрутов ─────────────────────────────────────────────────────
    //
    // Vite в dev-режиме компилирует маршрут при первом заходе. На видео это
    // выглядело как четыре секунды чёрного экрана перед профилем — под уже
    // идущей подписью. Заходим на каждый маршрут заранее, до старта отсчёта:
    // ко второму заходу он уже собран и открывается мгновенно.
    for (const path of [`/profile/${encodeURIComponent(FOCUS_USER)}`, '/casino/slot-machine', '/casino/shop']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(2500);
    }

    // ── Съёмка ────────────────────────────────────────────────────────────────
    t0 = Date.now();

    // 0. Заставка: логотип и название. Держим её на уже открытой странице,
    // пока карта грузится в фоне — так первые секунды ролика не чёрные.
    // 1a. Карта целиком: под подпись «больше 200 протогенов» нужен кадр,
    // где этих меток видно много. Сразу открывать карточку нельзя — там
    // на экране остаётся одна метка, и цифра в подписи звучит пусто.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(page);

    // 0. Заставка поверх грузящейся карты: первые секунды ролика не чёрные,
    // а под карточкой тем временем успевают приехать метки.
    await drawCard(page);
    await sleep(2600);
    mark('intro');
    await page.evaluate(() => document.getElementById('promo-card')?.remove());
    // Ждём появления самих меток, а не фиксированную паузу: карта грузится
    // по-разному, и жёсткий sleep снимал бы то серый прямоугольник, то готовое.
    await page.waitForSelector('.custom-leaflet-div-icon, .custom-cluster-icon-wrapper', { timeout: 60_000 })
        .catch(() => console.warn('  ! метки не появились'));
    await sleep(1500);
    // Отъезд колесом: кластеры расходятся на большее число значков
    for (let i = 0; i < 2; i++) {
        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
        await page.mouse.wheel(0, 260);
        await sleep(900);
    }
    await sleep(1600);
    mark('map');

    // 1b. Перелёт к конкретной метке: focus раскрывает кластер и открывает
    // попап сам — см. focusRequestedMarker в mapLogic.
    await page.goto(`${BASE}/?focus=${encodeURIComponent(FOCUS_USER)}`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(page);
    await page.waitForSelector('.custom-leaflet-div-icon, .custom-cluster-icon-wrapper', { timeout: 60_000 })
        .catch(() => {});
    await sleep(4500); // перелёт, раскрытие кластера, карточка
    mark('map_zoom');

    // 2. Профиль.
    //
    // Здесь по плану был чат, но снять его нечем: личка у аккаунта пустая,
    // в общем чате последние сообщения — «кто нибудь в этом чате жив?», а в
    // списке каналов превью с анонсом закрытия проекта. Рекламировать общение
    // таким кадром хуже, чем не рекламировать вовсе. Профиль показывает то же
    // «здесь живут люди», но кадром, который мы контролируем.
    await page.goto(`${BASE}/profile/${encodeURIComponent(FOCUS_USER)}`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(page);
    // Профиль открывается «кинематографической» заставкой со взломом
    // брандмауэра (CinematicLoader) — секунд шесть прогресс-бара. Красиво,
    // но под подпись про профиль в кадре должен быть профиль.
    await sleep(900);
    const skip = page.locator('button.skip-btn').first();
    if (await skip.count()) {
        await skip.click({ force: true }).catch(() => {});
    }
    // ждём контент, а не таймер
    await page.waitForFunction(
        () => /SECURITY LEVEL|КОММЕНТАРИИ/i.test(document.body.innerText),
        { timeout: 45_000 }
    ).catch(() => console.warn('  ! профиль не отрисовался'));
    await sleep(2400); // задержаться на шапке: аватар, статус, значки
    // Плавная прокрутка вниз: профиль длинный, одним экраном не показать
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 240);
        await sleep(750);
    }
    await sleep(1400);
    mark('profile');

    // 3. Слоты
    await page.goto(`${BASE}/casino/slot-machine`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(page);
    // Гидратация: клик раньше неё проходит «в пустоту» — разметка уже есть,
    // обработчик ещё не привязан, и барабаны в ролике просто стоят.
    await sleep(3200);
    const balance = () =>
        page.evaluate(() => document.body.innerText.match(/БАЛАНС\s+(\d+)/)?.[1] ?? '?');
    const before = await balance();

    // Кнопка спина ищется по тексту: класс может поменяться, надпись — вряд ли
    const spin = page.locator('button', { hasText: /крут|spin|играть/i }).first();
    if (await spin.count()) {
        await spin.click().catch((e) => console.warn('  ! клик:', e.message));
        await sleep(5000); // барабаны + анимация выигрыша
        console.log(`  спин: баланс ${before} → ${await balance()}`);
    } else {
        console.warn('  ! кнопка спина не найдена, снимаю статику');
        await sleep(4500);
    }
    mark('slots');

    // 4. Магазин косметики
    await page.goto(`${BASE}/casino/shop`, { waitUntil: 'domcontentloaded' });
    await dismissSplash(page);
    await sleep(1800);
    // Баланс в панели магазина подтягивается не сразу, да ещё и
    // прокручивается анимацией (tweened, 500 мс). Проверки «не ноль» мало —
    // в кадр попадала промежуточная цифра вроде «9 PC». Ждём, пока значение
    // перестанет меняться.
    await page.waitForFunction(
        () => {
            const now = document.querySelector('.balance-display')?.innerText || '';
            const prev = window.__balPrev;
            window.__balPrev = now;
            return Boolean(now) && now === prev && !/[^0-9]0 PC/.test(now);
        },
        { timeout: 25_000, polling: 400 }
    ).catch(() => console.warn('  ! баланс магазина не устоялся'));
    await sleep(700);
    await page.mouse.wheel(0, 350);
    await sleep(1600);
    await page.mouse.wheel(0, 350);
    await sleep(1800);
    mark('shop');

    // 5. Финальная карточка.
    //
    // Раньше финальные подписи ложились поверх прокрутки магазина — ссылка
    // висела на витрине рамок и читалась как часть товара. Карточку рисуем
    // сами: логотип и шрифты берём у сайта, так что она выглядит своей.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await drawCard(page, { url: 'proto-map.vercel.app', store: 'И приложение в Google Play' });
    await sleep(3200);
    mark('end');

    // ── Завершение ────────────────────────────────────────────────────────────
    await context.close(); // видео дописывается именно здесь
    await browser.close();

    // Playwright именует файл случайно — переименовываем в предсказуемое
    const file = readdirSync(RAW).find((f) => f.endsWith('.webm') && f !== 'source.webm');
    if (file) renameSync(join(RAW, file), join(RAW, 'source.webm'));

    writeFileSync(
        join(RAW, 'scenes.json'),
        JSON.stringify({ offset: (t0 - videoStartedAt) / 1000, scenes }, null, 2),
        'utf8'
    );

    console.log(`\nГотово: raw/source.webm, сцен ${scenes.length}`);
}

main().catch((e) => {
    console.error('Съёмка не удалась:', e.message);
    process.exit(1);
});
