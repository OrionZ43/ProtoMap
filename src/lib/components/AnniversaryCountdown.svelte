<script lang="ts">
    /**
     * AnniversaryCountdown.svelte
     * Таймер обратного отсчёта до 5 мая на странице карты.
     * 5 стадий: от спокойного сигнала до полного хаоса.
     *
     * Использование в src/routes/+page.svelte:
     *   import AnniversaryCountdown from '$lib/components/AnniversaryCountdown.svelte';
     *   <AnniversaryCountdown />
     */
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';

    // ── Дата назначения ─────────────────────────────────────────────
    const TARGET = new Date('2026-05-05T00:00:00');

    // ── Состояние ────────────────────────────────────────────────────
    let days    = 0;
    let hours   = 0;
    let minutes = 0;
    let seconds = 0;
    let totalMs = 0;
    let stage: 0|1|2|3|4|5 = 0; // 5 = arrived
    let visible   = true;
    let dismissed = false;

    // Для анимаций
    let glitchTick = false;
    let rgbShift   = false;
    let scanLine   = 0;
    let alarmBeat  = false;

    let interval: ReturnType<typeof setInterval>;
    let glitchInterval: ReturnType<typeof setInterval>;

    /*
     * СТАДИИ:
     * 0 → >7 дней    : SIGNAL DETECTED     — тихий пульс, зелёный
     * 1 → 3–7 дней   : INCOMING DATA       — жёлтый, сканлайн
     * 2 → 1–3 дня    : ALERT PROTOCOL      — оранжевый, резкие вспышки
     * 3 → <24 часа   : CRITICAL BREACH     — красный, постоянный глитч
     * 4 → <1 час     : EMERGENCY           — RGB-разрывы, строб
     * 5 → 0          : SYSTEM ONLINE       — золотой триумф
     */
    const STAGES = [
        { key: 'signal',    label: '// SIGNAL DETECTED',   color: '#00ff9d', glow: 'rgba(0,255,157,0.4)',   bg: 'rgba(0,255,157,0.06)'  },
        { key: 'incoming',  label: '// INCOMING DATA',      color: '#fcee0a', glow: 'rgba(252,238,10,0.4)',  bg: 'rgba(252,238,10,0.06)' },
        { key: 'alert',     label: '// ALERT PROTOCOL',     color: '#ff8c00', glow: 'rgba(255,140,0,0.5)',   bg: 'rgba(255,140,0,0.07)'  },
        { key: 'critical',  label: '// CRITICAL BREACH',    color: '#ff003c', glow: 'rgba(255,0,60,0.55)',   bg: 'rgba(255,0,60,0.08)'   },
        { key: 'emergency', label: '// EMERGENCY PROTOCOL', color: '#ff003c', glow: 'rgba(255,0,60,0.7)',    bg: 'rgba(255,0,60,0.10)'   },
        { key: 'arrived',   label: '// SYSTEM ONLINE',      color: '#ffd700', glow: 'rgba(255,215,0,0.6)',   bg: 'rgba(255,215,0,0.08)'  },
    ] as const;

    $: current = STAGES[stage];

    function calcStage(ms: number): 0|1|2|3|4|5 {
        if (ms <= 0)                      return 5;
        if (ms <= 60 * 60 * 1000)        return 4; // < 1 час
        if (ms <= 24 * 60 * 60 * 1000)   return 3; // < 24 часа
        if (ms <= 3 * 24 * 3600 * 1000)  return 2; // < 3 дня
        if (ms <= 7 * 24 * 3600 * 1000)  return 1; // < 7 дней
        return 0;
    }

    function tick() {
        const now = Date.now();
        totalMs = Math.max(0, TARGET.getTime() - now);

        if (totalMs <= 0) {
            days = hours = minutes = seconds = 0;
            stage = 5;
            clearInterval(interval);
            return;
        }

        days    = Math.floor(totalMs / (1000 * 60 * 60 * 24));
        hours   = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
        seconds = Math.floor((totalMs % (1000 * 60)) / 1000);

        stage = calcStage(totalMs);
        scanLine = (scanLine + 3) % 100;
    }

    // ── Глитч-цикл (только на 3/4 стадии) ──────────────────────────
    function startGlitch() {
        clearInterval(glitchInterval);

        if (stage >= 4) {
            // Стадия 4: строб + RGB каждые 1.5s
            glitchInterval = setInterval(() => {
                glitchTick = true;
                rgbShift   = true;
                alarmBeat  = true;
                setTimeout(() => { glitchTick = false; rgbShift = false; }, 120);
                setTimeout(() => { alarmBeat  = false; }, 300);
            }, 1500);

        } else if (stage === 3) {
            // Стадия 3: редкие глитчи каждые 3s
            glitchInterval = setInterval(() => {
                glitchTick = true;
                setTimeout(() => { glitchTick = false; }, 80);
            }, 3000);
        }
    }

    $: if (browser && (stage === 3 || stage === 4)) startGlitch();
    $: if (browser && stage < 3) { clearInterval(glitchInterval); glitchTick = false; rgbShift = false; }

    // ── Авто-показ ────────────────────────────────────────────────
    onMount(() => {
        const wasDismissed = sessionStorage.getItem('anniv_timer_dismissed');
        if (wasDismissed) { dismissed = true; visible = false; return; }

        tick();
        interval = setInterval(tick, 1000);
    });

    onDestroy(() => {
        clearInterval(interval);
        clearInterval(glitchInterval);
    });

    function dismiss() {
        visible = false;
        dismissed = true;
        sessionStorage.setItem('anniv_timer_dismissed', '1');
    }

    // ── Форматирование ───────────────────────────────────────────
    const pad = (n: number) => String(n).padStart(2, '0');

    // Описания стадий
    const SUB = [
        'Приближается важный сигнал…',
        'Трансмиссия устанавливается…',
        'Система входит в режим ожидания',
        'ВНИМАНИЕ: критический порог близко',
        'АВАРИЙНЫЙ ПРОТОКОЛ АКТИВЕН',
        'ProtoMap — 1 год в онлайне!',
    ];
</script>

{#if visible && !dismissed}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="countdown-root"
        class:stage-0={stage===0}
        class:stage-1={stage===1}
        class:stage-2={stage===2}
        class:stage-3={stage===3}
        class:stage-4={stage===4}
        class:stage-5={stage===5}
        class:glitch={glitchTick}
        class:rgb={rgbShift}
        class:alarm={alarmBeat}
        style="
            --c:   {current.color};
            --g:   {current.glow};
            --bg:  {current.bg};
        "
    >
        <!-- Сканлайн (стадии 1-4) -->
        {#if stage >= 1 && stage <= 4}
            <div class="scan-line" style="top: {scanLine}%"></div>
        {/if}

        <!-- Закрыть -->
        <button class="close-btn" on:click={dismiss} aria-label="Закрыть">✕</button>

        <!-- Лейбл стадии -->
        <div class="stage-label">{current.label}</div>

        <!-- Основной таймер -->
        {#if stage < 5}
            <div class="digits-row">
                {#if days > 0}
                    <div class="unit">
                        <span class="val">{pad(days)}</span>
                        <span class="lbl">ДНЕЙ</span>
                    </div>
                    <span class="sep">:</span>
                {/if}
                <div class="unit">
                    <span class="val">{pad(hours)}</span>
                    <span class="lbl">ЧАС</span>
                </div>
                <span class="sep">:</span>
                <div class="unit">
                    <span class="val">{pad(minutes)}</span>
                    <span class="lbl">МИН</span>
                </div>
                <span class="sep">:</span>
                <div class="unit">
                    <span class="val" class:pulse-sec={stage < 2}>{pad(seconds)}</span>
                    <span class="lbl">СЕК</span>
                </div>
            </div>

            <!-- Прогресс-бар -->
            <div class="progress-track">
                <div
                    class="progress-fill"
                    style="width: {Math.min(100, 100 - (totalMs / (10 * 24 * 3600 * 1000)) * 100)}%"
                ></div>
            </div>

            <div class="sub-text">{SUB[stage]}</div>

        {:else}
            <!-- ARRIVED -->
            <div class="arrived-text">🎂 HAPPY BIRTHDAY, PROTOMAP</div>
            <div class="arrived-sub">1 год онлайн. Спасибо вам!</div>
        {/if}

        <!-- Угловые акценты -->
        <div class="corner tl"></div>
        <div class="corner tr"></div>
        <div class="corner bl"></div>
        <div class="corner br"></div>
    </div>
{/if}

<style>
    /* ── Root ────────────────────────────────────────────────────── */
    .countdown-root {
        position: fixed;
        /* Над картой, снизу по центру */
        bottom: 5.5rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 35;

        width: min(380px, calc(100vw - 2rem));

        font-family: 'Chakra Petch', monospace;
        color: var(--c);

        background: rgba(8, 10, 16, 0.82);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid var(--c);
        box-shadow:
            0 0 12px var(--g),
            inset 0 0 20px var(--bg);

        padding: 1.1rem 1.25rem 1rem;
        clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
        overflow: hidden;

        transition:
            border-color   0.6s ease,
            box-shadow     0.6s ease,
            color          0.6s ease;
    }

    /* ── Сканлайн ─────────────────────────────────────────────── */
    .scan-line {
        position: absolute;
        left: 0; width: 100%; height: 1px;
        background: linear-gradient(90deg, transparent, var(--c), transparent);
        opacity: 0.35;
        pointer-events: none;
        transition: top 0.08s linear;
    }

    /* ── Закрыть ──────────────────────────────────────────────── */
    .close-btn {
        position: absolute;
        top: 0.4rem; right: 0.6rem;
        background: none; border: none; cursor: pointer;
        color: var(--c); opacity: 0.5;
        font-size: 14px; line-height: 1;
        transition: opacity 0.2s;
        padding: 2px 4px;
    }
    .close-btn:hover { opacity: 1; }

    /* ── Лейбл стадии ────────────────────────────────────────── */
    .stage-label {
        font-size: 0.6rem;
        letter-spacing: 0.25em;
        opacity: 0.75;
        margin-bottom: 0.65rem;
        text-transform: uppercase;
    }

    /* ── Цифры ───────────────────────────────────────────────── */
    .digits-row {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 0.2rem;
        margin-bottom: 0.75rem;
    }

    .unit {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }

    .val {
        font-size: 2.4rem;
        font-weight: 700;
        line-height: 1;
        color: var(--c);
        text-shadow: 0 0 16px var(--g), 0 0 32px var(--g);
        letter-spacing: 0.04em;
        transition: text-shadow 0.4s;
    }

    .lbl {
        font-size: 0.5rem;
        letter-spacing: 0.25em;
        opacity: 0.55;
    }

    .sep {
        font-size: 2rem;
        font-weight: 700;
        line-height: 1;
        color: var(--c);
        opacity: 0.5;
        margin-bottom: 0.2rem;
        animation: sep-blink 1s step-end infinite;
    }

    @keyframes sep-blink {
        0%, 100% { opacity: 0.5; }
        50%       { opacity: 0.15; }
    }

    /* Пульс секунд на ранних стадиях */
    .pulse-sec {
        animation: val-pulse 1s ease-in-out infinite;
    }
    @keyframes val-pulse {
        0%, 100% { text-shadow: 0 0 12px var(--g); }
        50%       { text-shadow: 0 0 24px var(--g), 0 0 48px var(--g); }
    }

    /* ── Прогресс-бар ────────────────────────────────────────── */
    .progress-track {
        height: 2px;
        background: rgba(255,255,255,0.08);
        margin-bottom: 0.6rem;
        position: relative;
        overflow: hidden;
    }
    .progress-fill {
        height: 100%;
        background: var(--c);
        box-shadow: 0 0 6px var(--g);
        transition: width 1s linear, background 0.6s ease;
    }

    /* ── Подпись ─────────────────────────────────────────────── */
    .sub-text {
        font-size: 0.6rem;
        letter-spacing: 0.12em;
        opacity: 0.5;
        text-align: center;
    }

    /* ── Arrived ─────────────────────────────────────────────── */
    .arrived-text {
        font-size: 1.1rem;
        font-weight: 700;
        text-align: center;
        letter-spacing: 0.08em;
        margin-bottom: 0.4rem;
        animation: arrived-glow 2s ease-in-out infinite;
    }
    .arrived-sub {
        font-size: 0.65rem;
        letter-spacing: 0.18em;
        opacity: 0.6;
        text-align: center;
    }
    @keyframes arrived-glow {
        0%, 100% { text-shadow: 0 0 10px var(--g), 0 0 24px var(--g); }
        50%       { text-shadow: 0 0 20px var(--g), 0 0 50px var(--g), 0 0 80px var(--g); }
    }

    /* ── Угловые акценты ──────────────────────────────────────── */
    .corner {
        position: absolute;
        width: 8px; height: 8px;
        border-color: var(--c);
        opacity: 0.7;
    }
    .tl { top: 4px; left: 4px;   border-top: 1px solid; border-left: 1px solid; }
    .tr { top: 4px; right: 4px;  border-top: 1px solid; border-right: 1px solid; }
    .bl { bottom: 4px; left: 4px;  border-bottom: 1px solid; border-left: 1px solid; }
    .br { bottom: 4px; right: 4px; border-bottom: 1px solid; border-right: 1px solid; }

    /* ══ СТАДИЙНЫЕ МОДИФИКАТОРЫ ═══════════════════════════════════ */

    /* Стадия 0: медленное дыхание */
    .stage-0 { animation: breathe-s0 4s ease-in-out infinite; }
    @keyframes breathe-s0 {
        0%,100% { box-shadow: 0 0 8px var(--g), inset 0 0 14px var(--bg); }
        50%     { box-shadow: 0 0 18px var(--g), inset 0 0 22px var(--bg); }
    }

    /* Стадия 1: сканирование */
    .stage-1 .val {
        animation: breathe-digits 2.5s ease-in-out infinite;
    }
    @keyframes breathe-digits {
        0%,100% { text-shadow: 0 0 10px var(--g); }
        50%     { text-shadow: 0 0 20px var(--g), 0 0 40px var(--g); }
    }

    /* Стадия 2: пульсирующая рамка */
    .stage-2 {
        animation: pulse-border-s2 1.8s ease-in-out infinite;
    }
    @keyframes pulse-border-s2 {
        0%,100% { box-shadow: 0 0 10px var(--g), inset 0 0 16px var(--bg); }
        50%     { box-shadow: 0 0 25px var(--g), 0 0 50px rgba(255,140,0,0.15), inset 0 0 28px var(--bg); }
    }
    .stage-2 .val {
        animation: flicker-s2 2s ease-in-out infinite;
    }
    @keyframes flicker-s2 {
        0%, 90%, 100% { opacity: 1; }
        92%           { opacity: 0.7; }
        94%           { opacity: 1; }
    }

    /* Стадия 3: глитч-рамка, красный */
    .stage-3 {
        animation: alarm-border-s3 1.2s ease-in-out infinite;
    }
    @keyframes alarm-border-s3 {
        0%,100% { box-shadow: 0 0 12px var(--g), inset 0 0 18px var(--bg); }
        50%     { box-shadow: 0 0 30px var(--g), 0 0 60px rgba(255,0,60,0.2), inset 0 0 30px var(--bg); }
    }

    /* Стадия 4: строб */
    .stage-4 {
        animation: strobe-s4 1.5s ease-in-out infinite;
    }
    @keyframes strobe-s4 {
        0%, 45%, 55%, 100% { box-shadow: 0 0 16px var(--g), inset 0 0 20px var(--bg); }
        50%                { box-shadow: 0 0 50px var(--g), 0 0 100px rgba(255,0,60,0.3), inset 0 0 40px var(--bg); }
    }

    /* Стадия 5: золотая */
    .stage-5 {
        animation: gold-pulse 3s ease-in-out infinite;
        clip-path: none !important;
        border-radius: 4px;
    }
    @keyframes gold-pulse {
        0%,100% { box-shadow: 0 0 16px rgba(255,215,0,0.5), inset 0 0 24px rgba(255,215,0,0.06); }
        50%     { box-shadow: 0 0 40px rgba(255,215,0,0.8), 0 0 80px rgba(255,215,0,0.2), inset 0 0 40px rgba(255,215,0,0.10); }
    }

    /* ══ ГЛИТЧ-МОДИФИКАТОРЫ ════════════════════════════════════════ */

    /* Глитч: горизонтальный сдвиг */
    .glitch .digits-row {
        animation: glitch-digits 0.12s steps(1, end) 1;
    }
    @keyframes glitch-digits {
        0%   { transform: translate(0, 0) skew(0deg); }
        33%  { transform: translate(-4px, 1px) skew(-4deg); clip-path: inset(20% 0 60% 0); }
        66%  { transform: translate(3px, -1px) skew(2deg); clip-path: inset(55% 0 10% 0); }
        100% { transform: translate(0, 0) skew(0deg); clip-path: none; }
    }

    /* RGB-разрыв */
    .rgb .val {
        animation: rgb-split 0.12s steps(1, end) 1;
    }
    @keyframes rgb-split {
        0%   { text-shadow: 0 0 16px var(--g); filter: none; }
        33%  { text-shadow: -4px 0 #ff003c, 4px 0 #00f0ff; filter: blur(0.5px); }
        66%  { text-shadow: 3px 0 #ff00ff, -3px 0 #39ff14; }
        100% { text-shadow: 0 0 16px var(--g); filter: none; }
    }

    /* Алярм-сигнал на рамке */
    .alarm {
        animation: alarm-flash 0.3s ease-out 1 !important;
    }
    @keyframes alarm-flash {
        0%   { box-shadow: 0 0 60px rgba(255,0,60,0.9), inset 0 0 40px rgba(255,0,60,0.3); }
        100% { box-shadow: 0 0 12px var(--g), inset 0 0 18px var(--bg); }
    }

    /* ── Адаптив ─────────────────────────────────────────────────── */
    @media (max-width: 480px) {
        .countdown-root {
            bottom: 5rem;
            padding: 0.9rem 1rem 0.85rem;
        }
        .val { font-size: 1.9rem; }
    }
</style>