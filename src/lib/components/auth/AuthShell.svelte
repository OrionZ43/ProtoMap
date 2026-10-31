<script lang="ts">
    import { t, locale } from 'svelte-i18n';
    import { onMount } from 'svelte';

    /**
     * Общий каркас страниц входа и регистрации.
     *
     * Концепт (решение Ориона, 31.10.2026): никакой колонки-витрины и коробки
     * формы. Фильм-тур лежит фоном на всю страницу, поверх — красивое затемнение,
     * а заголовок и поля ввода «проявляются» прямо на затемнённом видео, без
     * контейнера. «Безрамочность».
     */

    /** Заголовок над формой. */
    export let title: string;

    /** Строка под заголовком — необязательная. */
    export let subtitle: string | null = null;

    /**
     * Оставлен для совместимости с вызовами (login/register передают число
     * протогенов). Счётчик «PROTOMAP NETWORK» убран по просьбе Ориона, поэтому
     * значение больше не показывается.
     */
    export let protogens: number | null = null;
    void protogens;

    /**
     * Фон — беззвучный видео-тур из трейлера (Storage, public/film/v2/).
     * Десктоп — широкий фильм 16:9 (`login-wide`); на телефоне (<1024px) тяжёлый
     * ролик не качаем, показываем вертикальный постер `login-tall` (один на оба
     * языка, без титров). Текст интерфейса вшит в кадр, поэтому у RU и EN свои
     * широкие файлы.
     *   - mounted — до гидрации и в SSR показываем постер;
     *   - wideEnough — ниже 1024px видео нет, только постер;
     *   - !reducedMotion — у попросивших «меньше движения» остаётся постер.
     */
    let mounted = false;
    let wideEnough = true;
    let reducedMotion = false;

    const FILM_BASE =
        'https://firebasestorage.googleapis.com/v0/b/protomap-1e1db.firebasestorage.app/o/public%2Ffilm%2Fv2%2F';
    const filmUrl = (file: string) => `${FILM_BASE}${file}?alt=media`;

    $: videoSuffix = $locale?.startsWith('en') ? '-en' : '';
    // Широкий постер под 16:9-видео на десктопе, вертикальный — на телефоне.
    $: posterSrc = wideEnough ? filmUrl(`login-wide${videoSuffix}.webp`) : filmUrl('login-tall.webp');
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
     * Запуск фонового видео. Не полагаемся на один атрибут `autoplay`: Svelte не
     * всегда отражает `muted` в свойство (браузер тогда блокирует беззвучный
     * автоплей), а динамически вставленное сетевое видео само стартует только к
     * canplaythrough — поэтому стартуем явно по canplay.
     */
    function startPlayback(e: Event) {
        const v = e.currentTarget as HTMLVideoElement;
        v.muted = true;
        void v.play().catch(() => {});
    }
</script>

<div class="auth">
    <!-- Фон: фильм на всю страницу. Постер — SSR/no-JS/reduced-motion фолбэк.
         {#key} пересобирает <video> при смене языка. -->
    {#if showVideo}
        {#key videoSuffix}
            <video
                class="auth__media"
                autoplay
                muted
                loop
                playsinline
                poster={posterSrc}
                on:loadeddata={startPlayback}
                on:canplay={startPlayback}
            >
                <source src={filmUrl(`login-wide${videoSuffix}.webm`)} type="video/webm" />
                <source src={filmUrl(`login-wide${videoSuffix}.mp4`)} type="video/mp4" />
            </video>
        {/key}
    {:else}
        <img class="auth__media" src={posterSrc} alt="" />
    {/if}

    <!-- Красивое затемнение поверх видео: радиальное (к краям и низу темнее) +
         вертикальное, чтобы поля читались, а видео оставалось видно. -->
    <div class="auth__scrim"></div>

    <!-- Контент прямо на видео, без коробки. -->
    <div class="auth__content">
        <header class="auth__head">
            <h1 class="auth__title font-display">{title}</h1>
            {#if subtitle}
                <p class="auth__subtitle">{subtitle}</p>
            {/if}
        </header>

        <slot />
    </div>

    <!-- Плёночный шум поверх: сглаживает переходы затемнения (убирает полосы)
         и делает картинку «киношной». Кликам не мешает (pointer-events: none). -->
    <div class="auth__noise" aria-hidden="true"></div>

    <!-- Подпись карты: в видео не вшита, рисует страница. -->
    <p class="auth__attribution">© OpenFreeMap © OpenMapTiles © OpenStreetMap</p>
</div>

<style>
    .auth {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - 4rem);
        overflow: hidden;
        background: #05080c;
        padding: 3rem 1.25rem 4.5rem;
    }

    /* Фон закреплён за окном (не зависит от высоты формы — иначе кроп разный на
       входе и регистрации). Широкий 16:9, cover. */
    .auth__media {
        position: fixed;
        inset: 4rem 0 0 0;
        width: 100%;
        height: calc(100vh - 4rem);
        object-fit: cover;
        z-index: 0;
    }

    /* Затемнение-столб по центру (где форма); край зависит от ширины окна, чтобы
       не гасить окно сайта в кадре на ноутбуках. Закреплено за окном. Стопы — от
       студии, проверены над кадром сайта на 1920/1536/1366/1024. */
    .auth__scrim {
        position: fixed;
        inset: 4rem 0 0 0;
        width: 100%;
        height: calc(100vh - 4rem);
        z-index: 1;
        pointer-events: none;
        --f: min(8rem, 6vw);
        background: linear-gradient(
            to right,
            rgba(5, 8, 12, 0) calc(50% - 14rem - var(--f)),
            rgba(5, 8, 12, 0.12) calc(50% - 14rem - var(--f) * 0.81),
            rgba(5, 8, 12, 0.42) calc(50% - 14rem - var(--f) * 0.5),
            rgba(5, 8, 12, 0.68) calc(50% - 14rem - var(--f) * 0.19),
            rgba(5, 8, 12, 0.8) calc(50% - 13rem),
            rgba(5, 8, 12, 0.84) 50%,
            rgba(5, 8, 12, 0.8) calc(50% + 13rem),
            rgba(5, 8, 12, 0.68) calc(50% + 14rem + var(--f) * 0.19),
            rgba(5, 8, 12, 0.42) calc(50% + 14rem + var(--f) * 0.5),
            rgba(5, 8, 12, 0.12) calc(50% + 14rem + var(--f) * 0.81),
            rgba(5, 8, 12, 0) calc(50% + 14rem + var(--f))
        );
    }

    /* Форма — узкая колонка по центру, без фона и рамок: поля лежат прямо на
       затемнённом видео. Мягкая тень-гало за колонкой держит читаемость, не
       образуя коробки. */
    .auth__content {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 28rem;
        /* Плавное появление: после затемнения фильма форма мягко всплывает. */
        animation: authContentIn 0.6s 0.15s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes authContentIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .auth__content {
            animation: none;
        }
    }

    .auth__head {
        margin-bottom: 2rem;
        text-align: center;
    }

    .auth__title {
        margin: 0;
        font-size: 2.2rem;
        letter-spacing: 0.04em;
        color: var(--cyber-yellow, #ffd500);
        text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
        overflow-wrap: break-word;
    }

    .auth__subtitle {
        margin: 0.6rem 0 0;
        font-size: 0.95rem;
        color: #cbd5e1;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
    }

    @media (max-width: 520px) {
        .auth__title {
            font-size: 1.7rem;
            letter-spacing: 0.02em;
        }
    }

    .auth__noise {
        position: fixed;
        inset: 4rem 0 0 0;
        z-index: 3;
        pointer-events: none;
        opacity: 0.05;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 140px 140px;
    }

    .auth__attribution {
        position: fixed;
        bottom: 0.7rem;
        right: 0.85rem;
        z-index: 4;
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
</style>
