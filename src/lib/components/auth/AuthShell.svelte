<script lang="ts">
    import { t, locale } from 'svelte-i18n';
    import { onMount } from 'svelte';

    /**
     * Общий каркас страниц входа и регистрации.
     *
     * Раньше обе были колонкой в 512 пикселей по центру. После добавления
     * блока согласий колонка стала вдвое длиннее экрана и превратилась
     * в «тоненький столбик» — отсюда переделка.
     *
     * Витрина слева не украшение ради украшения: она забирает половину ширины
     * на большом экране, из-за чего форма перестаёт выглядеть потерянной,
     * а длинный текст согласий получает нормальную колонку вместо узкой полосы.
     * На экранах уже 1024 пикселей витрина убирается совсем — там она только
     * отняла бы место у формы.
     */

    /** Заголовок над формой. */
    export let title: string;

    /** Строка под заголовком — необязательная. */
    export let subtitle: string | null = null;

    /** Сколько протогенов уже на карте. Показывается на витрине, если известно. */
    export let protogens: number | null = null;

    /**
     * Фон витрины — беззвучный видео-тур 1:1 из трейлера (решение Ориона,
     * 29.10.2026; монтаж в ритм трека-ориентира, звука нет).
     *
     * Грузим видео только когда оно реально видно и уместно:
     *   - mounted — на сервере и до гидрации показываем статичный постер
     *     (корректный no-JS фолбэк и защита от вспышки автоплея);
     *   - wideEnough — витрина скрыта (display:none) до 1024px, поэтому на
     *     телефоне тяжёлый файл не качаем вовсе, только лёгкий постер в SSR;
     *   - !reducedMotion — у попросивших «меньше движения» остаётся постер.
     *
     * Текст интерфейса вшит в кадр, поэтому у RU и EN свои файлы. ru_april
     * регистрируется под кодом 'ru' и отдельного файла не требует.
     */
    let mounted = false;
    let wideEnough = true;
    let reducedMotion = false;

    /**
     * Файлы фильма раздаёт Firebase Storage (public/film/v1/), а не репозиторий:
     * так тяжёлые ролики (~114 МБ на сайт) не висят в git и не идут через Vercel.
     * Ссылка прямая, без токена — правило Storage `allow get: if true` на
     * public/film/**; эндпоинт ?alt=media поддерживает Range для <video>. Новая
     * версия фильма — новая папка (v2, …), чтобы адрес не менялся.
     */
    const FILM_BASE =
        'https://firebasestorage.googleapis.com/v0/b/protomap-1e1db.firebasestorage.app/o/public%2Ffilm%2Fv1%2F';
    const filmUrl = (file: string) => `${FILM_BASE}${file}?alt=media`;

    $: videoSuffix = $locale?.startsWith('en') ? '-en' : '';
    $: posterSrc = filmUrl(`login-1x1${videoSuffix}.webp`);
    $: showVideo = mounted && wideEnough && !reducedMotion;

    onMount(() => {
        const wide = window.matchMedia('(min-width: 1024px)');
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        wideEnough = wide.matches;
        reducedMotion = motion.matches;
        mounted = true;

        const onWide = (e: MediaQueryListEvent) => (wideEnough = e.matches);
        const onMotion = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
        wide.addEventListener('change', onWide);
        motion.addEventListener('change', onMotion);
        return () => {
            wide.removeEventListener('change', onWide);
            motion.removeEventListener('change', onMotion);
        };
    });

    /**
     * Запуск фонового видео. Не полагаемся на один атрибут `autoplay`:
     *   - Svelte не всегда отражает атрибут `muted` в одноимённое свойство, а
     *     автоплей без звука браузер пускает только по свойству `muted` — иначе
     *     блокирует. Ставим явно.
     *   - видео вставляется динамически (после onMount) и грузится с сети, поэтому
     *     стартуем сами по canplay, а не ждём canplaythrough.
     * Если браузер всё равно отклонил play() — остаётся постер/первый кадр, в
     * консоль не шумим.
     */
    function startPlayback(e: Event) {
        const v = e.currentTarget as HTMLVideoElement;
        v.muted = true;
        void v.play().catch(() => {});
    }
</script>

<div class="auth">
    <!-- Витрина -->
    <aside class="showcase" aria-hidden="true">
        <!-- Фон: беззвучный видео-тур 1:1. Постер — и SSR/no-JS фолбэк, и кадр
             при prefers-reduced-motion. {#key} пересобирает <video> при смене
             языка, иначе смена src у <source> сама по себе не перегружает ролик. -->
        {#if showVideo}
            {#key videoSuffix}
                <video
                    class="showcase__media"
                    autoplay
                    muted
                    loop
                    playsinline
                    poster={posterSrc}
                    on:loadeddata={startPlayback}
                    on:canplay={startPlayback}
                >
                    <source src={filmUrl(`login-1x1${videoSuffix}.webm`)} type="video/webm" />
                    <source src={filmUrl(`login-1x1${videoSuffix}.mp4`)} type="video/mp4" />
                </video>
            {/key}
        {:else}
            <img class="showcase__media" src={posterSrc} alt="" />
        {/if}

        <!-- Затемнение снизу: под счётчиком в кадре разное (карта, карточка
             слотов с балансом), без скрима подпись теряется. -->
        <div class="showcase__scrim"></div>

        <div class="showcase__content">
            <p class="showcase__kicker font-display">PROTOMAP NETWORK</p>

            {#if protogens !== null}
                <p class="showcase__count font-display">{protogens}</p>
                <p class="showcase__caption">
                    {$t('auth.showcase_protogens', { values: { count: protogens } })}
                </p>
            {:else}
                <p class="showcase__caption showcase__caption--solo">
                    {$t('auth.showcase_tagline')}
                </p>
            {/if}
        </div>

        <div class="showcase__corner showcase__corner--tl"></div>
        <div class="showcase__corner showcase__corner--br"></div>

        <!-- Атрибуция карты рисуется страницей: в видео она не вшита. -->
        <p class="showcase__attribution">© OpenFreeMap © OpenMapTiles © OpenStreetMap</p>
    </aside>

    <!-- Форма -->
    <main class="panel">
        <div class="panel__inner">
            <header class="panel__head">
                <h1 class="panel__title font-display">{title}</h1>
                {#if subtitle}
                    <p class="panel__subtitle">{subtitle}</p>
                {/if}
            </header>

            <slot />
        </div>
    </main>
</div>

<style>
    .auth {
        display: grid;
        grid-template-columns: 1fr;
        min-height: calc(100vh - 4rem);
    }

    /* Две колонки только там, где для них правда есть место. */
    @media (min-width: 1024px) {
        .auth {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            align-items: stretch;
        }
    }

    /* ─── Витрина ─────────────────────────────────────────────────────────── */

    .showcase {
        display: none;
        position: relative;
        overflow: hidden;
        background: radial-gradient(circle at 30% 20%, #0a1620 0%, #05080c 70%);
        border-right: 1px solid rgba(0, 243, 255, 0.18);
    }

    @media (min-width: 1024px) {
        .showcase { display: block; }
    }

    /* Видео и постер лежат одним слоем в самом низу витрины. Кадр 1:1,
       витрина — высокий прямоугольник, поэтому cover: по бокам срезается
       до ~6%, главное тура держится в средних ~85% ширины. */
    .showcase__media {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 0;
    }

    /* Нижняя треть гасится сильно: в кадре там UI приложения (баланс слотов,
       кнопки), и без этого наш счётчик сталкивается с чужими цифрами. Верхние
       ~60% видео остаются живыми. */
    .showcase__scrim {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background: linear-gradient(
            to top,
            rgba(5, 8, 12, 0.97) 0%,
            rgba(5, 8, 12, 0.92) 20%,
            rgba(5, 8, 12, 0.6) 40%,
            rgba(5, 8, 12, 0) 70%
        );
    }

    .showcase__content {
        position: relative;
        z-index: 2;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 3rem;
    }

    .showcase__kicker {
        font-size: 0.75rem;
        letter-spacing: 0.28em;
        color: rgba(0, 243, 255, 0.65);
        margin: 0 0 1.5rem;
    }

    .showcase__count {
        font-size: 5rem;
        line-height: 1;
        color: #fff;
        margin: 0;
        text-shadow: 0 0 24px rgba(0, 243, 255, 0.45);
    }

    .showcase__caption {
        font-size: 0.95rem;
        color: #7e93a5;
        margin: 0.5rem 0 0;
    }

    .showcase__caption--solo {
        font-size: 1.4rem;
        color: #9fb3c8;
    }

    .showcase__corner {
        position: absolute;
        width: 40px;
        height: 40px;
        border-color: rgba(0, 243, 255, 0.5);
        z-index: 2;
    }
    .showcase__corner--tl {
        top: 1.25rem; left: 1.25rem;
        border-top: 1px solid; border-left: 1px solid;
    }
    .showcase__corner--br {
        bottom: 1.25rem; right: 1.25rem;
        border-bottom: 1px solid; border-right: 1px solid;
    }

    /* Подпись карты поверх видео — статично, мелко, в свободном верхнем
       правом углу (там нет уголка-рамки). Тень держит читаемость над
       светлыми кадрами. */
    .showcase__attribution {
        position: absolute;
        top: 0.6rem;
        right: 0.85rem;
        z-index: 2;
        margin: 0;
        max-width: 60%;
        text-align: right;
        font-size: 0.58rem;
        line-height: 1.3;
        letter-spacing: 0.01em;
        color: rgba(159, 179, 200, 0.72);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
        pointer-events: none;
    }

    /* ─── Панель формы ────────────────────────────────────────────────────── */

    .panel {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2.5rem 1.25rem 4rem;
    }

    .panel__inner {
        width: 100%;
        /* Шире прежних 512: длинному тексту согласий нужна нормальная колонка,
           а не узкая полоса, в которой строка ломается на каждом слове. */
        max-width: 34rem;
    }

    .panel__head {
        margin-bottom: 2rem;
    }

    .panel__title {
        font-size: 2rem;
        color: var(--cyber-yellow, #ffd500);
        margin: 0;
        letter-spacing: 0.04em;
    }

    .panel__subtitle {
        margin: 0.6rem 0 0;
        font-size: 0.9rem;
        color: #7e93a5;
    }
</style>
