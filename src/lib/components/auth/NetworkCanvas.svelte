<script lang="ts">
    /**
     * Стилизованная «карта» для витрины входа и регистрации.
     *
     * Намеренно НЕ настоящий Leaflet. Он вынесен из optimizeDeps и грузится
     * динамически только на главной; тащить его сюда — это лишние секунды на
     * странице, где человек хочет побыстрее ввести пароль, ради картинки,
     * которую он и так увидит сразу после входа.
     *
     * Здесь чистый SVG и CSS-анимация: вес почти нулевой, JS-цикла нет вовсе,
     * поэтому вкладка в фоне не жрёт батарею.
     */

    /** Сколько меток показать. Больше 40 превращается в кашу. */
    export let markers = 26;

    /**
     * Раскладка считается один раз при создании компонента, а не в реактивном
     * блоке: иначе любое обновление родителя перетасовывало бы точки, и картинка
     * дёргалась бы на каждый ввод символа в поле.
     */
    const dots = Array.from({ length: markers }, (_, i) => ({
        x: 6 + Math.random() * 88,
        y: 8 + Math.random() * 84,
        r: 0.5 + Math.random() * 1.1,
        delay: (i % 9) * 0.45,
        bright: Math.random() > 0.72,
    }));

    /** Линии только между близкими точками — иначе получается паутина. */
    const links = dots.flatMap((a, i) =>
        dots.slice(i + 1).reduce<{ x1: number; y1: number; x2: number; y2: number }[]>((acc, b) => {
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 19) acc.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
            return acc;
        }, [])
    );
</script>

<svg class="net" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
        <radialGradient id="net-glow" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stop-color="rgba(0,243,255,0.16)" />
            <stop offset="100%" stop-color="rgba(0,243,255,0)" />
        </radialGradient>
        <pattern id="net-grid" width="6.25" height="6.25" patternUnits="userSpaceOnUse">
            <path d="M 6.25 0 L 0 0 0 6.25" fill="none"
                  stroke="rgba(0,243,255,0.09)" stroke-width="0.15" />
        </pattern>
    </defs>

    <rect width="100" height="100" fill="url(#net-grid)" />
    <rect width="100" height="100" fill="url(#net-glow)" />

    {#each links as l}
        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="rgba(0,243,255,0.14)" stroke-width="0.12" />
    {/each}

    {#each dots as d}
        <circle
            cx={d.x} cy={d.y} r={d.r}
            class="dot"
            class:bright={d.bright}
            style="animation-delay: {d.delay}s"
        />
    {/each}
</svg>

<style>
    .net {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
    }

    .dot {
        fill: rgba(0, 243, 255, 0.55);
        animation: pulse 4.5s ease-in-out infinite;
    }

    .dot.bright {
        fill: rgba(255, 213, 0, 0.75);
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.35; }
        50%      { opacity: 1; }
    }

    /* Анимация — украшение, а не смысл. У кого укачивает, тот её не увидит. */
    @media (prefers-reduced-motion: reduce) {
        .dot { animation: none; opacity: 0.7; }
    }
</style>
