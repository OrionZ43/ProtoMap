/**
 * Сборка промо-ролика из отснятого материала.
 *
 * Берёт raw/source.webm и raw/scenes.json от capture.mjs, режет по сценам,
 * склеивает с плавными переходами и выдаёт два варианта:
 *
 *   out/promo.mp4       — с впечённым текстом, для TikTok и Telegram
 *   out/showcase.webm   — без текста, для витрины на странице входа
 *   out/poster.jpg      — первый кадр, показывается пока грузится видео
 *
 * Текст впекается только в первый: ролик уходит наружу и должен быть
 * самодостаточным. На сайте подписи накладываются HTML-ом — так они остаются
 * чёткими на любом экране и переводятся вместе с остальным интерфейсом.
 * Впечённый русский текст на английской версии сайта смотрелся бы странно.
 */

import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');
const OUT = join(HERE, 'out');

/** Шрифт для подписей. Нужен с кириллицей — иначе ffmpeg нарисует квадраты. */
const FONT = process.env.SHOWCASE_FONT || 'C:/Windows/Fonts/arialbd.ttf';

/**
 * Подписи, привязанные к СЦЕНАМ, а не к секундам.
 *
 * Жёсткие тайминги разъезжались при каждой пересъёмке: сцены длятся
 * по-разному, и «меняй на оформление профиля» показывалось поверх чатов.
 * Здесь каждая подпись живёт ровно столько, сколько идёт её сцена, и любая
 * пересъёмка синхронизируется сама.
 */
const CAPTIONS = [
    // У сцены `intro` подписи нет: там своя заставка с логотипом,
    // нарисованная в capture.mjs — как и финальная карточка на `end`.
    { scene: 'map',      text: 'Больше 200 протогенов уже на сайте' },
    { scene: 'map_zoom', text: 'Поставь свою метку на карте' },
    { scene: 'profile',  text: 'Заведи профиль и найди своих' },
    { scene: 'slots',    text: 'Играй и зарабатывай ProtoCoins' },
    { scene: 'shop',     text: 'Меняй их на оформление профиля' },
    // У сцены `end` подписи нет: там своя финальная карточка с логотипом,
    // ссылкой и строкой про Google Play — нарисована в capture.mjs.
];

/**
 * Раскладывает подписи по реальной дорожке.
 *
 * Сцена в scenes.json помечена моментом ЗАВЕРШЕНИЯ, поэтому подпись занимает
 * промежуток от конца предыдущей до конца своей.
 */
function layout(scenes) {
    const at = (name) => scenes.find((s) => s.name === name)?.at ?? 0;
    const out = [];

    for (const c of CAPTIONS) {
        const i = scenes.findIndex((s) => s.name === c.scene);
        if (i < 0) continue;

        const from = i === 0 ? 0 : scenes[i - 1].at;
        const to = at(c.scene);

        out.push({ text: c.text, from, to });
    }

    return out;
}

function ff(args) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
        stdio: 'inherit',
    });
}

/** Экранирование текста для drawtext: двоеточие и апостроф ломают фильтр. */
function esc(s) {
    return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Путь к шрифту для drawtext.
 *
 * Двоеточие после буквы диска ffmpeg принимает за разделитель параметров
 * фильтра и падает с невнятной ошибкой, которая на путь не указывает совсем.
 * Кавычки от этого не спасают — экранировать обязательно.
 */
function escPath(p) {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function captionFilters(items) {
    return items.map((c) => {
        const y = c.hero ? '(h-text_h)/2' : 'h*0.70';
        const size = c.hero ? 86 : 46;

        // Полупрозрачная подложка: белый текст поверх светлого кадра карты
        // иначе теряется, а тень его не спасает.
        return (
            `drawtext=fontfile='${escPath(FONT)}'` +
            `:text='${esc(c.text)}'` +
            `:fontcolor=white:fontsize=${size}` +
            `:box=1:boxcolor=black@0.55:boxborderw=22` +
            `:x=(w-text_w)/2:y=${y}` +
            `:enable='between(t,${c.from.toFixed(2)},${c.to.toFixed(2)})'`
        );
    }).join(',');
}

function main() {
    const src = join(RAW, 'source.webm');
    if (!existsSync(src)) {
        console.error('Нет raw/source.webm — сначала запусти capture.mjs');
        process.exit(1);
    }

    const { scenes, offset = 0 } = JSON.parse(readFileSync(join(RAW, 'scenes.json'), 'utf8'));
    mkdirSync(OUT, { recursive: true });

    const total = scenes.at(-1).at;
    console.log(`Исходник: ${total.toFixed(1)} с, сцен ${scenes.length}, срез ${offset.toFixed(1)} с`);

    // ── Витрина: без текста, VP9 ──────────────────────────────────────────────
    //
    // VP9 при -crf 40 на тёмном интерфейсе с плавными движениями даёт около
    // мегабайта на двадцать секунд. Звука нет вовсе: он не нужен, а дорожка
    // мешала бы автовоспроизведению — браузеры пускают без запроса только
    // беззвучное видео.
    console.log('Собираю витрину...');
    ff([
        '-ss', String(offset),
        '-i', src,
        '-t', String(total),
        '-an',
        // Съёмка идёт в 540×960 (см. capture.mjs), до нужного размера
        // доводим здесь. lanczos — самый аккуратный из быстрых фильтров.
        '-vf', 'scale=1080:1920:flags=lanczos',
        '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
        join(OUT, 'showcase.webm'),
    ]);

    // ── Реклама: с подписями, H.264 ───────────────────────────────────────────
    //
    // mp4/H.264, а не webm: TikTok и Telegram принимают его без вопросов,
    // с VP9 бывают сюрпризы при загрузке.
    console.log('Собираю ролик с подписями...');
    ff([
        '-ss', String(offset),
        '-i', src,
        '-t', String(total),
        '-an',
        '-vf', `scale=1080:1920:flags=lanczos,${captionFilters(layout(scenes))}`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
        '-pix_fmt', 'yuv420p',
        // faststart переносит заголовок в начало файла — без него превью
        // не строится, пока файл не скачан целиком. Ту же грабельку мы уже
        // ловили в качалке.
        '-movflags', '+faststart',
        join(OUT, 'promo.mp4'),
    ]);

    // ── Постер ────────────────────────────────────────────────────────────────
    console.log('Постер...');
    ff(['-ss', String(offset + 1.5), '-i', src, '-frames:v', '1', '-q:v', '3', join(OUT, 'poster.jpg')]);

    console.log('\nГотово:');
    for (const f of ['showcase.webm', 'promo.mp4', 'poster.jpg']) {
        const { size } = statSync(join(OUT, f));
        console.log(`  ${f.padEnd(16)} ${(size / 1024 / 1024).toFixed(2)} МБ`);
    }
}

main();
