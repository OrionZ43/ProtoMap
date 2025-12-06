<script lang="ts">
    import { onMount, createEventDispatcher, onDestroy } from 'svelte';
    import { fade } from 'svelte/transition';
    import { Howl } from 'howler';

    export let level: number = 0;
    const dispatch = createEventDispatcher();

    // === КОНФИГ ===
    const NIGHTMARE_PHRASES = [
        "TOO DEEP", "SYSTEM ROT", "NO SIGNAL", "VOID",
        "DATA CORRUPTION", "HELP ME", "I SEE YOU",
        "DISCONNECT", "FATAL ERROR", "IT'S COLD"
    ];

    // Мелкие ошибки для 2 уровня
    const SYSTEM_ERRORS = [
        "0x000F", "SYNC_FAIL", "NULL", "NaN", "ERR_CONNECTION", "404", "VOID_PTR"
    ];

    const WARNINGS = [
        "",
        "//: WARNING: SYSTEM INSTABILITY",
        "//: REALITY DISTORTION DETECTED",
        "//: CRITICAL ERROR. TURN BACK.",
        "//: REALITY ANCHOR FAILURE.",
        "FATAL."
    ];

    const WHISPER_FILES = ['/sounds/ih.wav', '/sounds/ns.wav', '/sounds/lby.wav', '/sounds/isy.wav'];

    let sounds: { [key: string]: Howl } = {};
    let whisperTimeout: NodeJS.Timeout;
    let prevLevel = 0;

    // Состояния визуалов
    let gifEyes: any[] = [];
    let glitchTexts: any[] = [];

    // Новые визуалы
    let ghostTexts: any[] = []; // Lvl 2
    let artifacts: any[] = [];  // Lvl 3

    let textInterval: NodeJS.Timeout;     // Lvl 5
    let ghostInterval: NodeJS.Timeout;    // Lvl 2
    let artifactInterval: NodeJS.Timeout; // Lvl 3

    // --- АУДИО ---
    function playRandomWhisper() {
        if (level !== 5) return;
        const file = WHISPER_FILES[Math.floor(Math.random() * WHISPER_FILES.length)];
        if (!file) return;

        const whisper = new Howl({ src: [file], volume: 0.8, rate: 0.7 });
        const pan = (Math.random() * 2) - 1;
        whisper.stereo(pan);
        whisper.play();

        const nextDelay = 15000 + Math.random() * 15000;
        whisperTimeout = setTimeout(playRandomWhisper, nextDelay);
    }

    // --- VISUALS ---

    // Level 2: Ghost Echoes
    function initLevel2Visuals() {
        if (ghostInterval) clearInterval(ghostInterval);
        ghostInterval = setInterval(() => {
            if (ghostTexts.length > 5) ghostTexts.shift();
            ghostTexts = [...ghostTexts, {
                id: Math.random(),
                x: Math.random() * 90,
                y: Math.random() * 90,
                text: SYSTEM_ERRORS[Math.floor(Math.random() * SYSTEM_ERRORS.length)],
                opacity: 0.3 + Math.random() * 0.4
            }];
        }, 800);
    }

    // Level 3: Corrupted Artifacts
    function initLevel3Visuals() {
        if (artifactInterval) clearInterval(artifactInterval);
        artifactInterval = setInterval(() => {
            if (artifacts.length > 8) artifacts.shift();
            artifacts = [...artifacts, {
                id: Math.random(),
                x: Math.random() * 95,
                y: Math.random() * 95,
                w: 20 + Math.random() * 100,
                h: 2 + Math.random() * 20,
            }];
        }, 300);
    }

    // Level 5: Nightmare
    function initNightmareVisuals() {
        gifEyes = [];
        for (let i = 0; i < 6; i++) {
            gifEyes.push({
                x: Math.random() * 90,
                y: Math.random() * 80,
                size: 150 + Math.random() * 250,
                jitterSpeed: 4 + Math.random() * 4
            });
        }

        if (textInterval) clearInterval(textInterval);
        textInterval = setInterval(() => {
            if (glitchTexts.length > 8) glitchTexts.shift();
            glitchTexts = [...glitchTexts, {
                id: Math.random(),
                x: 10 + Math.random() * 80,
                y: 10 + Math.random() * 80,
                text: NIGHTMARE_PHRASES[Math.floor(Math.random() * NIGHTMARE_PHRASES.length)],
                scale: 1 + Math.random() * 2,
            }];
        }, 2000);
    }

    function stopAllVisuals() {
        clearInterval(textInterval);
        clearInterval(ghostInterval);
        clearInterval(artifactInterval);
        glitchTexts = [];
        gifEyes = [];
        ghostTexts = [];
        artifacts = [];
    }

    onMount(() => {
        sounds.error = new Howl({ src: ['/sounds/error.mp3'], volume: 0.5 });
        sounds.alarm = new Howl({ src: ['/sounds/alarm.mp3'], volume: 0.4, loop: true });
        sounds.horror = new Howl({ src: ['/sounds/horror_ambient.mp3'], volume: 1.0, loop: true });
    });

    onDestroy(() => {
        Object.values(sounds).forEach(s => s.stop());
        clearTimeout(whisperTimeout);
        stopAllVisuals();
    });

    $: if (level !== prevLevel) {
        handleLevelChange(level);
        prevLevel = level;
    }

    function handleLevelChange(lvl: number) {
        // Очистка при смене уровня (чтобы эффекты не накладывались)
        stopAllVisuals();

        if (lvl === 0) {
            sounds.alarm?.stop();
            sounds.horror?.stop();
            clearTimeout(whisperTimeout);
            dispatch('restoreMusic');
            return;
        }

        if (lvl >= 1 && lvl <= 3) sounds.error?.play();

        // Запуск специфичных визуалов
        if (lvl === 2) initLevel2Visuals();
        if (lvl === 3) initLevel3Visuals();
        if (lvl === 5) initNightmareVisuals();

        if (lvl === 4) {
            dispatch('stopMusic');
            if (!sounds.horror?.playing()) sounds.horror?.play();
            if (!sounds.alarm?.playing()) sounds.alarm?.play();
        }

        if (lvl === 5) {
            sounds.alarm?.stop();
            if (!sounds.horror?.playing()) sounds.horror?.play();
            playRandomWhisper();
        }
    }
</script>

<div class="overlay-root level-{level}">

    <svg style="display: none;">
        <defs>
            <filter id="distortion">
                <feTurbulence type="fractalNoise" baseFrequency="0.01 0.005" numOctaves="5" seed="2">
                    <animate attributeName="baseFrequency" dur="20s" values="0.01 0.005;0.02 0.01;0.01 0.005" repeatCount="indefinite" />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" scale="20" />
            </filter>
        </defs>
    </svg>

    <!-- === LEVEL 1-4 === -->
    {#if level >= 1 && level < 5}

        <!-- L1: NOISE -->
        {#if level >= 1} <div class="noise-layer"></div> {/if}

        <!-- L2: RGB + GHOSTS -->
        {#if level >= 2}
            <div class="rgb-shift"></div>
            {#each ghostTexts as g (g.id)}
                <div class="ghost-text" style="left: {g.x}%; top: {g.y}%; opacity: {g.opacity};" in:fade out:fade>
                    {g.text}
                </div>
            {/each}
        {/if}

        <!-- L3: VIGNETTE + ARTIFACTS -->
        {#if level >= 3}
            <div class="dark-vignette heart-beat"></div>
            {#each artifacts as a (a.id)}
                <div class="artifact" style="left: {a.x}%; top: {a.y}%; width: {a.w}px; height: {a.h}px;"></div>
            {/each}
        {/if}

        <!-- L4: MELTING -->
        {#if level >= 4}
            <div class="melting-layer"></div>
            <div class="color-drift"></div>
        {/if}

        <div class="hud-wrapper" class:distorted={level >= 4}>
            <div class="hud-warning" class:critical={level >= 4}>
                <!-- На 3 уровне мигает быстрее -->
                <span class:blink-fast={level>=3} class:blink-slow={level<3}>⚠️</span>
                {WARNINGS[level]}
            </div>
        </div>
    {/if}

    <!-- === LEVEL 5: THE ABYSS === -->
    {#if level >= 5}
        <div class="level-5-nightmare" in:fade={{duration: 3000}}>
            <div class="static-noise"></div>
            <div class="scanlines"></div>

            {#each gifEyes as eye}
                <div class="eye-wrapper" style="left: {eye.x}%; top: {eye.y}%; width: {eye.size}px; opacity: 0.5;">
                    <div class="eye-tint">
                        <img src="/casino/eye.gif" alt="" class="gif-eye" />
                    </div>
                </div>
            {/each}

            {#each glitchTexts as t (t.id)}
                <div class="creepy-text" style="left: {t.x}%; top: {t.y}%; font-size: {t.scale}rem;" in:fade out:fade>
                    {t.text}
                </div>
            {/each}

            <div class="main-horror">
                <h1 data-text="SIGNAL LOST">SIGNAL LOST</h1>
            </div>
            <div class="claustrophobia"></div>
        </div>
    {/if}

</div>

<style>
    .overlay-root {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 50; overflow: hidden;
    }

    /* === L1 === */
    .noise-layer {
        position: absolute; inset: 0; opacity: 0.1;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    }

    /* === L2 === */
    .rgb-shift {
        position: absolute; inset: 0; opacity: 0.3;
        box-shadow: inset 4px 0 rgba(0,255,255,0.2), inset -4px 0 rgba(255,0,255,0.2);
        mix-blend-mode: overlay;
        animation: breath 4s infinite alternate;
    }
    @keyframes breath { from { opacity: 0.2; } to { opacity: 0.4; } }

    .ghost-text {
        position: absolute; color: rgba(0, 243, 255, 0.4);
        font-family: 'Chakra Petch', monospace; font-size: 0.8rem;
        text-shadow: 0 0 5px rgba(0, 243, 255, 0.5);
        pointer-events: none;
    }

    /* === L3 === */
    .dark-vignette {
        position: absolute; inset: 0;
        background: radial-gradient(circle, transparent 40%, rgba(50, 0, 0, 0.4) 100%);
        transition: all 1s;
    }
    .heart-beat { animation: pulse-hp 1s infinite; }
    @keyframes pulse-hp {
        0% { box-shadow: inset 0 0 0 rgba(255,0,0,0); }
        50% { box-shadow: inset 0 0 50px rgba(255,0,0,0.2); }
        100% { box-shadow: inset 0 0 0 rgba(255,0,0,0); }
    }

    .artifact {
        position: absolute; background: rgba(255, 0, 60, 0.6);
        box-shadow: 0 0 5px red; animation: glitch-block 0.2s linear forwards;
    }
    @keyframes glitch-block { from { opacity: 1; transform: scaleX(1); } to { opacity: 0; transform: scaleX(0); } }

    /* === L4 === */
    .melting-layer {
        position: absolute; inset: 0;
        backdrop-filter: url(#distortion) blur(1px); opacity: 0.7; z-index: 10;
    }
    .color-drift {
        position: absolute; inset: 0;
        background: linear-gradient(120deg, rgba(255,0,0,0.1), rgba(0,0,255,0.1));
        mix-blend-mode: exclusion; animation: drift 10s infinite linear;
    }
    @keyframes drift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
    .hud-wrapper.distorted { filter: url(#distortion); opacity: 0.8; }

    /* === L5 === */
    .level-5-nightmare {
        position: fixed; inset: 0; z-index: 9999; background: #000000;
        font-family: 'Courier New', monospace; pointer-events: none; overflow: hidden;
    }
    .static-noise {
        position: absolute; inset: 0; opacity: 0.15;
        background: repeating-radial-gradient(#000 0 0.0001%, #111 0 0.0002%) 50% 0/2500px 2500px;
    }
    .scanlines {
        position: absolute; inset: 0;
        background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 50%);
        background-size: 100% 4px; z-index: 100;
    }
    .eye-wrapper { position: absolute; mix-blend-mode: lighten; z-index: 5; }
    .eye-tint { filter: grayscale(100%) brightness(0.6) sepia(1) hue-rotate(-50deg) saturate(5); }
    .gif-eye { width: 100%; display: block; opacity: 0.7; animation: slow-pulse 4s infinite alternate; }
    @keyframes slow-pulse { from { opacity: 0.4; } to { opacity: 0.8; } }
    .creepy-text {
        position: absolute; font-family: 'Chakra Petch', monospace; font-weight: 900; color: #300;
        text-shadow: 1px 1px 0 #000; z-index: 50; white-space: nowrap; pointer-events: none;
    }
    .main-horror {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 200;
    }
    .main-horror h1 {
        font-size: 6rem; color: #fff; text-transform: uppercase; letter-spacing: 0.2em;
        text-shadow: 0 0 20px #f00; opacity: 0.9; animation: glitch-anim 5s infinite;
    }
    @keyframes glitch-anim {
        0% { transform: skew(0deg); } 2% { transform: skew(10deg); } 4% { transform: skew(-10deg); } 6% { transform: skew(0deg); } 100% { transform: skew(0deg); }
    }
    .claustrophobia {
        position: absolute; inset: 0;
        background: radial-gradient(circle, transparent 20%, #000 85%);
        z-index: 150; animation: breathe-panic 10s infinite ease-in-out;
    }
    @keyframes breathe-panic { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }

    /* === HUD === */
    .hud-wrapper { position: absolute; top: 15%; width: 100%; text-align: center; z-index: 200; }
    .hud-warning {
        display: inline-block; background: rgba(0,0,0,0.8); color: #ffb000;
        border: 1px solid #ffb000; padding: 0.5rem 1rem; border-radius: 4px;
        font-family: 'Chakra Petch', monospace; font-size: 1.2rem;
    }
    .hud-warning.critical {
        color: #ff5555; border-color: #ff5555; background: #1a0000;
        font-size: 1.3rem; font-weight: bold;
    }
    .blink-slow { animation: blink 2s infinite; }
    .blink-fast { animation: blink 0.5s infinite; }
    @keyframes blink { 50% { opacity: 0.3; } }
    /* === MOBILE ADAPTATION === */
    @media (max-width: 768px) {
        /* HUD: Делаем компактнее */
        .hud-wrapper {
            top: 10%;
            width: 90%;
            left: 5%;
            transform: none; /* Убираем центровку через translate, используем margin */
        }

        .hud-warning {
            font-size: 0.8rem;
            padding: 0.4rem 0.8rem;
            width: 100%; /* Растягиваем на ширину контейнера */
            box-sizing: border-box;
            white-space: normal; /* Разрешаем перенос текста */
        }

        .hud-warning.critical {
            font-size: 1rem;
        }

        /* L4: ОПТИМИЗАЦИЯ ПРОИЗВОДИТЕЛЬНОСТИ */
        /* SVG фильтры убивают мобильные GPU, заменяем на упрощенные эффекты */
        .melting-layer {
            backdrop-filter: none; /* Выключаем тяжелое искажение */
            background: rgba(80, 0, 20, 0.3); /* Просто красный туман */
            mix-blend-mode: overlay;
        }

        /* Усиливаем дрифт цветов, раз убрали искажение */
        .color-drift {
            opacity: 0.8;
            animation-duration: 5s;
        }

        /* L5: ГЛАВНЫЙ ТЕКСТ */
        .main-horror h1 {
            font-size: 3rem; /* Было 6-8rem, уменьшаем до 3 */
            line-height: 1.1;
            text-align: center;
            width: 100vw;
            padding: 0 10px;
            word-break: break-word;
        }

        /* L5: ГЛАЗА */
        .eye-wrapper {
            /* Ограничиваем размер глаз на мобиле, чтобы не закрывали весь экран */
            transform: scale(0.6) !important;
        }

        /* L5: ПЛАВАЮЩИЙ ТЕКСТ */
        .creepy-text {
            font-size: 1.5rem !important; /* Принудительно уменьшаем */
        }

        /* Виньетка более агрессивная на мобилках */
        .claustrophobia {
            background: radial-gradient(circle, transparent 10%, #000 95%);
        }
    }
</style>