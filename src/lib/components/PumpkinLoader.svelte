<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    // Хэллоуинский экран при заходе в профиль: в темноте тыква, внутри «зажигается свеча» —
    // рожица разгорается и чуть мерцает, потом экран растворяется и открывает профиль.
    // Профиль уже отрисован под экраном: лоадер ничего не ждёт и не держит.
    // Анимируются только opacity и transform отдельных слоёв — без фильтров во весь экран.
    // Клик, касание или клавиша — сразу к растворению. С «меньше движения» не показывается.

    // Контуры из static/halloween/pumpkin.svg: тело с прорезями в хвостике и рожица отдельно
    // (те же, что у тыквы-шарика в src/lib/client/plinkoBoard.ts).
    const BODY =
        'M8.04 2.79c 0,0 0,0 0,0 -0.3,-0.08 -0.18,-0.52 0.32,-1.02 l 0,0 c 0.08,-0.1 -0.1,-0.31 -0.44,-0.5 -0.37,-0.21 -0.79,-0.32 -0.93,-0.24 -0.01,0 -0.01,0.01 -0.02,0.01 l 0,0 c -0.75,0.63 -0.89,1.54 -0.91,1.77 C 3.39,2.39 1,4.41 1,8.11 c 0,3.21 4.19,4.89 6,4.89 1.81,0 6,-1.67 6,-4.89 0,-3.65 -2.12,-5.79 -4.96,-5.33 M7.67 1.69c 0.13,0.05 0.26,0.09 0.37,0.11 -0.26,0.36 -0.44,0.87 -0.29,1.01 0.19,0.17 0.57,0.39 0.69,0.48 0.12,0.09 -0.55,0.11 -0.82,0.4 0,0 -0.67,-1.12 0.05,-2 M6.05 2.93c 0.06,0.42 -0.35,0.77 -0.35,0.77 -0.01,-0.27 -0.27,-0.44 -0.27,-0.44 0.18,-0.2 0.62,-0.34 0.62,-0.34';
    const FACE =
        'M9.1 6.51c 0.23,-0.07 2.45,-1.09 2.45,-0.79 0,0.35 -1.22,2.17 -2.12,2.46 -0.29,0.09 -1.38,-0.78 -1.16,-1.84 0.05,-0.27 0.53,0.27 0.84,0.17 M7 7.25c 0.23,0 1.14,0.41 1.14,1.09 0,0.68 -0.51,0.07 -1.14,0.07 -0.63,0 -1.14,0.61 -1.14,-0.07 0,-0.68 0.91,-1.09 1.14,-1.09 M4.9 6.51c 0.31,0.1 0.78,-0.44 0.84,-0.17 0.21,1.06 -0.88,1.93 -1.16,1.84 -0.91,-0.28 -2.12,-2.1 -2.12,-2.46 0,-0.3 2.22,0.72 2.45,0.79 M11.07 10.39l-0.7,-0.4 -0.44,1.14 -0.73,-0.72 -0.57,1.36 -1.49,-1.06 -0.76,0.92 -0.82,-0.96 -1.27,0.47 -0.74,-1.3 -0.95,0.42 -0.62,-2.56 0.96,1.6 0.93,-0.49 0.58,1.12 1.05,-0.61 0.86,1.15 0.81,-1.1 0.99,0.74 0.6,-0.87 0.93,0.5 0.55,-1.03 0.65,0.68 1.47,-1.68 -1.27,2.69';

    const SHOW_MS = 1050; // тыква горит
    const LEAVE_MS = 450; // экран растворяется

    let phase: 'show' | 'leaving' | 'done' = 'show';
    let timers: ReturnType<typeof setTimeout>[] = [];

    function leave(after: number) {
        timers.forEach(clearTimeout);
        timers = [
            setTimeout(() => (phase = 'leaving'), after),
            setTimeout(() => (phase = 'done'), after + LEAVE_MS)
        ];
    }

    function skip() {
        if (phase === 'show') leave(0);
    }

    onMount(() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            phase = 'done';
            return;
        }
        leave(SHOW_MS);
    });

    onDestroy(() => timers.forEach(clearTimeout));

    // Экран переносится в <body>: страница живёт внутри слоя макета с z-index 20,
    // и без переноса подвал и кнопка чата оказались бы поверх тыквы.
    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy: () => node.remove() };
    }
</script>

<svelte:window on:keydown={skip} on:pointerdown={skip} />

{#if phase !== 'done'}
    <div class="pumpkin-loader" class:leaving={phase === 'leaving'} aria-hidden="true" use:toBody>
        <div class="glow"></div>
        <div class="pumpkin">
            <!-- Тело и тёмные прорези -->
            <svg viewBox="0 0 14 14">
                <defs>
                    <linearGradient id="pumpkin-loader-body" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#ff9a3d" />
                        <stop offset="1" stop-color="#b8400c" />
                    </linearGradient>
                </defs>
                <path d={BODY} fill="url(#pumpkin-loader-body)" />
                <path d={FACE} fill="#2b1206" />
            </svg>
            <!-- Тень на теле, пока свеча не зажглась -->
            <svg viewBox="0 0 14 14" class="shade">
                <path d={BODY} fill="#0b0605" />
            </svg>
            <!-- Свет в прорезях: мягкий ореол по форме рожицы и сама рожица -->
            <svg viewBox="0 0 14 14" class="flame">
                <defs>
                    <filter id="pumpkin-loader-blur" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="0.35" />
                    </filter>
                </defs>
                <path d={FACE} fill="#ff8a1f" filter="url(#pumpkin-loader-blur)" />
                <path d={FACE} fill="#ffd27a" />
            </svg>
        </div>
    </div>
{/if}

<style>
    .pumpkin-loader {
        position: fixed;
        inset: 0;
        z-index: 10001; /* поверх шапки, чата и синематик-лоадера */
        display: flex;
        align-items: center;
        justify-content: center;
        /* Непрозрачен с первого кадра: профиль под ним уже отрисован и не должен мелькнуть */
        background: radial-gradient(ellipse at 50% 55%, #140c1e 0%, #07060c 60%, #040307 100%);
    }
    .pumpkin-loader.leaving {
        animation: loader-out 0.45s ease-in forwards;
    }

    /* Тёплое пятно света вокруг тыквы — появляется вместе со свечой */
    .glow {
        position: absolute;
        width: min(110vmin, 620px);
        aspect-ratio: 1;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 138, 31, 0.22) 0%, rgba(255, 138, 31, 0.07) 38%, transparent 68%);
        opacity: 0;
        animation: candle 1.05s linear forwards;
    }

    .pumpkin {
        position: relative;
        width: min(46vmin, 240px);
        aspect-ratio: 1;
        animation: pumpkin-in 0.4s cubic-bezier(0.2, 0.8, 0.3, 1) both;
    }
    .pumpkin svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }
    .shade {
        opacity: 0.6;
        animation: shade-off 0.7s ease-out 0.3s forwards;
    }
    .flame {
        opacity: 0;
        animation: candle 1.05s linear forwards;
    }
    .leaving .pumpkin {
        animation: pumpkin-out 0.45s ease-in forwards;
    }

    @keyframes loader-out {
        to { opacity: 0; }
    }
    @keyframes pumpkin-in {
        from { opacity: 0; transform: scale(0.94); }
        to { opacity: 1; transform: scale(1); }
    }
    @keyframes pumpkin-out {
        from { transform: scale(1); }
        to { transform: scale(1.06); }
    }
    /* Свеча: вспыхивает, проседает, разгорается и чуть дышит */
    @keyframes candle {
        0%, 22% { opacity: 0; }
        30% { opacity: 0.45; }
        36% { opacity: 0.15; }
        46% { opacity: 0.75; }
        52% { opacity: 0.5; }
        64% { opacity: 1; }
        76% { opacity: 0.82; }
        88% { opacity: 1; }
        94% { opacity: 0.9; }
        100% { opacity: 1; }
    }
    @keyframes shade-off {
        to { opacity: 0; }
    }
</style>
