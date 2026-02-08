<script lang="ts">
    import { userStore } from '$lib/stores';
    import { onMount, onDestroy } from 'svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { getDatabase, ref, onValue, off } from 'firebase/database';
    import { modal } from '$lib/stores/modalStore';
    import { Howl } from 'howler';
    import { tweened } from 'svelte/motion';
    import { fade, scale } from 'svelte/transition';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';
    import { renderMarkdown } from '$lib/utils/markdown';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let animationFrame: number;

    let betAmount = 100;
    let multiplier = 1.00;
    let isPlaying = false;
    let isCrashed = false;
    let gameId: string | null = null;
    let startTime = 0;

    let gameStatus = 'IDLE';
    let winAmount = 0;

    let history: { val: number, crashed: boolean }[] = [];
    let sounds: { [key: string]: Howl } = {};
    let unsubscribeRTDB: (() => void) | null = null;

    // ⬅️ НОВОЕ: Состояние тултипа
    let isMechanicsOpen = false;
    let tooltipElement: HTMLElement;
    let buttonElement: HTMLElement;

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500 });
    $: if ($userStore.user) displayedCredits.set($userStore.user.casino_credits);

    let particles: {x: number, y: number, vx: number, vy: number, life: number, color: string}[] = [];
    let shakeIntensity = 0;
    let themeColor = '#00f3ff';

    const SPEED_CONST = 0.08;

    // ⬅️ НОВОЕ: Функции для тултипа
    function toggleMechanics() {
        isMechanicsOpen = !isMechanicsOpen;
        if (isMechanicsOpen && buttonElement && tooltipElement) {
            setTimeout(() => {
                const buttonRect = buttonElement.getBoundingClientRect();
                const tooltipRect = tooltipElement.getBoundingClientRect();

                // Позиция относительно кнопки
                let top = buttonRect.top - tooltipRect.height - 10;
                let left = buttonRect.left + (buttonRect.width / 2) - (tooltipRect.width / 2);

                // Проверяем выход за левую границу
                if (left < 10) left = 10;

                // Проверяем выход за правую границу
                if (left + tooltipRect.width > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipRect.width - 10;
                }

                // Проверяем выход за верхнюю границу
                if (top < 10) {
                    top = buttonRect.bottom + 10;
                    tooltipElement.classList.add('below');
                } else {
                    tooltipElement.classList.remove('below');
                }

                tooltipElement.style.top = `${top}px`;
                tooltipElement.style.left = `${left}px`;
            }, 0);
        }
    }

    function closeMechanics() {
        isMechanicsOpen = false;
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        drawIdle();

        (window as any).CheatMenu = {
            enableWin: () => {
                console.warn("%c⚠️ SYSTEM ALERT:", "color: red; font-size: 20px; font-weight: bold;");
                console.log("%cNice try, Kuraga. Your IP has been logged... just kidding. Love you! <3", "color: #00f3ff; font-size: 14px;");
                return "ACCESS_DENIED";
            },
            predictCrash: () => {
                return "42.069x (Trust me bro)";
            }
        };

        sounds.engine = new Howl({ src: ['/sounds/suspense_music.mp3'], loop: true, volume: 0, rate: 0.8 });
        sounds.crash = new Howl({ src: ['/sounds/fail.mp3'], volume: 1.0 });
        sounds.win = new Howl({ src: ['/sounds/sucsess.mp3'], volume: 0.8 });
        sounds.click = new Howl({ src: ['/sounds/click.mp3'] });

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrame);
            sounds.engine?.stop();
            if (unsubscribeRTDB) unsubscribeRTDB();
        };
    });

    function resizeCanvas() {
        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (rect) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
            }
            if (!isPlaying) drawIdle();
        }
    }

    function updateTheme(val: number) {
        if (isCrashed) { themeColor = '#ff003c'; return; }
        if (val < 2.0) themeColor = '#00f3ff';
        else if (val < 5.0) themeColor = '#bd00ff';
        else if (val < 10.0) themeColor = '#ffd700';
        else themeColor = '#ff003c';
    }

    async function startGame() {
    betAmount = Math.floor(betAmount);
        if (betAmount > ($userStore.user?.casino_credits || 0)) {
            modal.error("ОШИБКА", "НЕДОСТАТОЧНО СРЕДСТВ");
            return;
        }
        if (betAmount > 1000) {
            modal.error("ОШИБКА", "МАКСИМАЛЬНАЯ СТАВКА 1000 PC");
            betAmount = 1000;
            return;
        }

        isPlaying = true;
        isCrashed = false;
        gameStatus = 'UPLOADING';
        multiplier = 1.00;
        winAmount = 0;
        particles = [];
        shakeIntensity = 0;
        themeColor = '#00f3ff';

        sounds.click?.play();

        try {
            const functions = getFunctions();
            const startFunc = httpsCallable(functions, 'startCrashGame');
            const result: any = await startFunc({ bet: betAmount });
            gameId = result.data.data.gameId;

            if ($userStore.user) {
                userStore.update(s => {
                    if(s.user) s.user.casino_credits -= betAmount;
                    return s;
                });
            }

            const db = getDatabase(undefined, "https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app");
            const gameRef = ref(db, `crash_games/${gameId}`);

            if (unsubscribeRTDB) unsubscribeRTDB();

            unsubscribeRTDB = onValue(gameRef, (snapshot) => {
                const data = snapshot.val();
                if (!data) return;

                if (data.s === 'bang') {
                    if (gameStatus === 'CASHED_OUT') {
                        if (unsubscribeRTDB) unsubscribeRTDB();
                        return;
                    }

                    crash(data.m);
                    if (unsubscribeRTDB) unsubscribeRTDB();
                    return;
                }

                if (data.s === 'done') {
                    if (unsubscribeRTDB) unsubscribeRTDB();
                    return;
                }
            });

            startTime = Date.now();
            sounds.engine?.volume(0.5);
            sounds.engine?.rate(0.8);
            sounds.engine?.play();

            loop();

        } catch (e: any) {
            modal.error("СБОЙ СЕТИ", e.message);
            isPlaying = false;
            gameStatus = 'IDLE';
        }
    }

    async function cashOut() {
        if (!isPlaying || gameStatus !== 'UPLOADING') return;

        isPlaying = false;
        gameStatus = 'CASHED_OUT';

        const currentMult = multiplier;

        sounds.engine?.stop();
        sounds.win?.play();

        winAmount = Math.floor(betAmount * currentMult);
        addToHistory(currentMult, false);

        drawFrame(currentMult);

        try {
            const functions = getFunctions();
            const cashOutFunc = httpsCallable(functions, 'cashOutCrashGame');
            await cashOutFunc({ gameId, multiplier: currentMult });

            userStore.update(s => { if(s.user) s.user.casino_credits += winAmount; return s; });
        } catch (e) {
            gameStatus = 'CRASHED';
            isCrashed = true;
            crash(currentMult);
        }
    }

    function addToHistory(val: number, crashed: boolean) {
        history = [{ val, crashed }, ...history].slice(0, 10);
    }

    function loop() {
        if (!isPlaying) return;

        const timeElapsed = (Date.now() - startTime) / 1000;

        multiplier = Math.exp(SPEED_CONST * timeElapsed);
        updateTheme(multiplier);

        const rate = 0.8 + (timeElapsed * 0.05);
        sounds.engine?.rate(Math.min(rate, 3.0));

        if (multiplier > 10) shakeIntensity = Math.min((multiplier - 10) * 0.5, 5);

        drawFrame(multiplier);

        animationFrame = requestAnimationFrame(loop);
    }

    function crash(finalVal: number) {
        multiplier = finalVal;
        isCrashed = true;
        gameStatus = 'CRASHED';
        isPlaying = false;

        shakeIntensity = 20;
        updateTheme(finalVal);

        sounds.engine?.stop();
        sounds.crash?.play();
        addToHistory(finalVal, true);

        drawFrame(finalVal);

        const shakeDecay = setInterval(() => {
            shakeIntensity *= 0.85;
            if (shakeIntensity < 0.5) {
                shakeIntensity = 0;
                clearInterval(shakeDecay);
            }
            drawFrame(finalVal);
        }, 16);
    }

    function drawFrame(val: number) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;

        ctx.save();
        ctx.translate(dx, dy);

        ctx.fillStyle = '#050a10';
        ctx.fillRect(-20, -20, w + 40, h + 40);

        const gridOffset = (val - 1) * 200;
        drawGrid(gridOffset, w, h);

        const x = w - 100;

        const normY = 1 - (1 / val);
        const y = h - 50 - (normY * (h - 100));

        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.quadraticCurveTo(x * 0.5, h, x, y);

        ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = themeColor;
        ctx.shadowBlur = 20;
        ctx.shadowColor = themeColor;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.lineTo(x, h);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, hexToRgba(themeColor, 0.4));
        gradient.addColorStop(1, hexToRgba(themeColor, 0));
        ctx.fillStyle = gradient;
        ctx.fill();

        if (!isCrashed && gameStatus === 'UPLOADING') {
            for(let i=0; i<3; i++) {
                particles.push({
                    x: x,
                    y: y,
                    vx: (Math.random() - 1.5) * 5,
                    vy: (Math.random() - 0.5) * 5,
                    life: 1.0,
                    color: Math.random() > 0.5 ? '#fff' : themeColor
                });
            }
        }
        updateAndDrawParticles();

        if (!isCrashed) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.5);
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(-10, 7); ctx.lineTo(-10, -7);
            ctx.closePath();
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 15; ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, 20 + Math.random() * 20, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 40 + Math.random() * 20, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff003c';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }

    function updateAndDrawParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;

            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    function drawGrid(offset: number, w: number, h: number) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const spacing = 80;

        ctx.beginPath();
        for (let x = - (offset % spacing); x < w; x += spacing) {
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += spacing) {
            ctx.moveTo(0, y); ctx.lineTo(w, y);
        }
        ctx.stroke();
    }

    function drawIdle() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        ctx.fillStyle = '#050a10';
        ctx.fillRect(0, 0, w, h);
        drawGrid(0, w, h);
    }

    function hexToRgba(hex: string, alpha: number) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
</script>

<svelte:head>
    <title>{$t('crash.title')} | The Glitch Pit</title>
</svelte:head>

<!-- ⬅️ НОВОЕ: Закрываем тултип по клику на фон -->
<svelte:window on:click={closeMechanics} />

<div class="page-container">
    <div class="bg-blur-1" style="background: {themeColor}; opacity: 0.2;"></div>

    <div class="terminal-frame" style="border-color: {themeColor}; box-shadow: 0 0 30px rgba(0,0,0,0.8), 0 0 20px {themeColor}33;">

        <!-- ⬅️ НОВОЕ: Заголовок с инфо-кнопкой -->
        <div class="game-header">
            <h1 class="game-title">{$t('crash.title')}</h1>
            <button
                bind:this={buttonElement}
                class="info-tooltip-wrapper"
                on:click|stopPropagation={toggleMechanics}
            >
                <div class="info-icon">?</div>

                <div bind:this={tooltipElement} class="custom-tooltip" class:mobile-visible={isMechanicsOpen}>
                    <h5 class="tooltip-title">{$t('crash.mechanics_title')}</h5>
                    <div class="tooltip-body">
                        {@html renderMarkdown($t('crash.mechanics_text'))}
                    </div>
                </div>
            </button>
        </div>

        <div class="history-bar">
            <span class="label">LOGS:</span>
            <div class="history-track">
                {#each history as item}
                    <div class="history-pill" class:crash={item.crashed} transition:scale>
                        {item.val.toFixed(2)}x
                    </div>
                {/each}
            </div>
        </div>

        <div class="screen-wrapper">
            <canvas bind:this={canvas}></canvas>

            <div class="screen-overlay">
                {#if gameStatus === 'IDLE'}
                    <div class="status-box">
                        <h2 class="glitch-text" data-text="SYSTEM READY">SYSTEM READY</h2>
                        <p class="blink">WAITING FOR UPLINK...</p>
                    </div>
                {:else if gameStatus === 'UPLOADING' || gameStatus === 'CASHED_OUT'}
                    <div class="big-multiplier" style="color: {themeColor}; text-shadow: 0 0 20px {themeColor};">
                        {multiplier.toFixed(2)}<span class="x">x</span>
                    </div>
                    {#if gameStatus === 'CASHED_OUT'}
                        <div class="cashed-out-badge" transition:scale>
                            DATA SECURED: +{winAmount}
                        </div>
                    {/if}
                {:else if gameStatus === 'CRASHED'}
                    <div class="crash-box" transition:scale>
                        <h2 class="glitch-text" data-text="CONNECTION LOST">CONNECTION LOST</h2>
                        <div class="final-val">{multiplier.toFixed(2)}x</div>
                    </div>
                {/if}
            </div>
        </div>

        <div class="controls-panel">
            <div class="bet-section">
                <div class="input-label">PACKET SIZE (BET)</div>
                <div class="bet-input-group">
                    <button class="adj" on:click={() => betAmount = Math.max(10, betAmount - 50)} disabled={isPlaying}>-</button>
                    <input
                        type="number"
                        bind:value={betAmount}
                        disabled={isPlaying}
                        class="cyber-input"
                        step="1"
                        on:input={() => betAmount = Math.floor(betAmount)}
                    >
                    <button class="adj" on:click={() => betAmount = Math.min(1000, betAmount + 50)} disabled={isPlaying}>+</button>
                </div>
                <div class="quick-bets">
                    <button on:click={() => betAmount = 100} disabled={isPlaying}>100</button>
                    <button on:click={() => betAmount = 500} disabled={isPlaying}>500</button>
                    <button on:click={() => betAmount = 1000} disabled={isPlaying}>MAX</button>
                </div>
            </div>

            <div class="action-section">
                {#if !isPlaying || gameStatus === 'CRASHED' || gameStatus === 'CASHED_OUT'}
                    <button class="launch-btn" on:click={startGame} disabled={isPlaying && gameStatus !== 'CRASHED'}>
                        <div class="btn-content">
                            <span class="big">INITIATE</span>
                            <span class="small">COST: {betAmount} PC</span>
                        </div>
                        <div class="btn-glitch"></div>
                    </button>
                {:else}
                    <button class="abort-btn" on:click={cashOut}>
                        <div class="btn-content">
                            <span class="big">ABORT</span>
                            <span class="small win">+{Math.floor(betAmount * multiplier)} PC</span>
                        </div>
                    </button>
                {/if}
            </div>
        </div>

        <div class="footer-status">
            <span>STATUS: {gameStatus}</span>
            <span>BALANCE: {Math.floor($displayedCredits)} PC</span>
        </div>
    </div>
</div>

<style>
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes glitch-skew { 0% { transform: skew(0deg); } 20% { transform: skew(-10deg); } 40% { transform: skew(10deg); } 100% { transform: skew(0deg); } }

    .page-container {
        min-height: calc(100vh - 64px);
        display: flex; justify-content: center; align-items: center;
        padding: 0.5rem; overflow: hidden; position: relative;
        background: #050505;
    }

    .bg-blur-1, .bg-blur-2 { position: absolute; width: 600px; height: 600px; filter: blur(150px); pointer-events: none; z-index: 0; transition: background 0.5s; }
    .bg-blur-1 { top: -200px; left: -200px; }
    .bg-blur-2 { bottom: -200px; right: -200px; background: rgba(255, 255, 255, 0.05); }

    .terminal-frame {
        width: 100%; max-width: 900px;
        background: rgba(10, 12, 15, 0.95);
        border: 1px solid;
        border-radius: 8px;
        position: relative; z-index: 10;
        display: flex; flex-direction: column;
        transition: border-color 0.5s, box-shadow 0.5s;
    }

    /* ⬅️ НОВОЕ: Заголовок с кнопкой */
    .game-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        padding: 1rem 1rem 0.5rem;
        border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .game-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.8rem;
        color: var(--cyber-cyan);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin: 0;
    }

    /* ⬅️ ИСПРАВЛЕННЫЕ СТИЛИ ТУЛТИПА */
    .info-tooltip-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        cursor: help;
        z-index: 20;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
    }

    .info-icon {
        width: 18px; height: 18px;
        border-radius: 50%;
        border: 1px solid #555;
        color: #777;
        background: rgba(255, 255, 255, 0.05);
        font-family: monospace;
        font-size: 12px;
        font-weight: bold;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
    }

    .info-tooltip-wrapper:hover .info-icon {
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan);
        color: #000;
        box-shadow: 0 0 10px var(--cyber-cyan);
    }

    .custom-tooltip {
        position: fixed;
        width: 340px;
        max-width: calc(100vw - 2rem);
        padding: 1rem;
        background: rgba(10, 10, 15, 0.95);
        border: 1px solid var(--cyber-cyan);
        border-radius: 8px;
        box-shadow: 0 0 20px rgba(0, 243, 255, 0.2);
        backdrop-filter: blur(10px);
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.3s;
        pointer-events: none;
        z-index: 1000;
    }

    .custom-tooltip::after {
        content: '';
        position: absolute;
        bottom: -6px;
        left: 50%;
        margin-left: -6px;
        border-width: 6px;
        border-style: solid;
        border-color: var(--cyber-cyan) transparent transparent transparent;
    }

    .custom-tooltip.below::after {
        bottom: auto;
        top: -6px;
        border-color: transparent transparent var(--cyber-cyan) transparent;
    }

    .info-tooltip-wrapper:hover .custom-tooltip,
    .custom-tooltip.mobile-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }

    .tooltip-title {
        color: var(--cyber-yellow);
        font-family: 'Chakra Petch', monospace;
        font-weight: bold;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
        text-transform: uppercase;
        border-bottom: 1px dashed rgba(255,255,255,0.2);
        padding-bottom: 4px;
    }
    .tooltip-body {
        color: #ccc; font-size: 0.75rem; line-height: 1.5; text-align: left;
    }
    .tooltip-body :global(p) { margin-bottom: 0.5rem; }
    .tooltip-body :global(p:last-child) { margin-bottom: 0; }
    .tooltip-body :global(strong) { color: var(--cyber-yellow); font-weight: 800; }

    @media (max-width: 640px) {
        .custom-tooltip {
            width: 280px;
            left: 50%;
            right: auto;
            transform: translateX(-50%) translateY(10px);
        }

        .custom-tooltip::after {
            left: 50%;
            right: auto;
            margin-left: -6px;
        }

        .info-tooltip-wrapper:hover .custom-tooltip,
        .custom-tooltip.mobile-visible {
            transform: translateX(-50%) translateY(0);
        }

        .game-title {
            font-size: 1.3rem;
        }
    }

    .history-bar {
        display: flex; align-items: center; padding: 0.5rem;
        background: rgba(0,0,0,0.5); border-bottom: 1px solid rgba(255,255,255,0.1);
        overflow: hidden; height: 40px;
    }
    .history-bar .label { font-size: 0.6rem; color: #666; margin-right: 0.5rem; font-weight: bold; letter-spacing: 0.1em; }
    .history-track { display: flex; gap: 0.3rem; flex-direction: row-reverse; justify-content: flex-end; width: 100%; overflow: hidden; }
    .history-pill {
        padding: 1px 6px; border-radius: 3px; font-size: 0.65rem; font-weight: bold; font-family: monospace; white-space: nowrap;
        background: rgba(57, 255, 20, 0.1); color: #39ff14; border: 1px solid #39ff14;
    }
    .history-pill.crash { background: rgba(255, 0, 60, 0.1); color: #ff003c; border-color: #ff003c; }

    .screen-wrapper {
        position: relative; height: 350px; width: 100%;
        background: #020406; overflow: hidden;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    canvas { display: block; width: 100%; height: 100%; }

    .screen-overlay {
        position: absolute; inset: 0; pointer-events: none; z-index: 20;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center;
        padding: 1rem;
    }

    .big-multiplier {
        font-size: 4rem; font-weight: 900; font-family: 'Chakra Petch', sans-serif;
        transition: color 0.2s, text-shadow 0.2s;
        line-height: 1;
    }
    .big-multiplier .x { font-size: 2rem; opacity: 0.7; }

    .status-box h2 { font-size: 1.5rem; color: #fff; letter-spacing: 0.2em; font-weight: bold; }
    .status-box p { color: var(--cyber-cyan); font-family: monospace; margin-top: 0.5rem; font-size: 0.8rem; }

    .crash-box h2 { font-size: 2rem; color: #ff003c; text-shadow: 0 0 20px #ff003c; animation: glitch-skew 0.3s infinite; }
    .crash-box .final-val { font-size: 1.5rem; color: #fff; font-family: monospace; }

    .cashed-out-badge {
        background: #39ff14; color: #000; padding: 0.3rem 1rem;
        font-weight: 900; font-size: 1rem; transform: rotate(-5deg);
        box-shadow: 0 0 20px #39ff14; border: 2px solid #fff;
    }

    .controls-panel { padding: 1rem; display: grid; grid-template-columns: 1fr 1.5fr; gap: 1.5rem; align-items: stretch; }

    .input-label { font-size: 0.6rem; color: #666; font-weight: bold; margin-bottom: 0.3rem; }
    .bet-input-group { display: flex; height: 3rem; width: 100%; }
    .cyber-input {
        flex: 1; min-width: 0;
        background: #0a0c10; border: 1px solid #333; color: #fff;
        text-align: center; font-size: 1.2rem; font-weight: bold;
        border-left: none; border-right: none; font-family: 'Chakra Petch', monospace;
    }
    .cyber-input:focus { outline: none; border-color: var(--cyber-cyan); }

    .adj {
        flex: 0 0 3rem;
        background: #1a1d24; border: 1px solid #333; color: #888; font-size: 1.2rem;
        cursor: pointer; transition: all 0.1s; display: flex; align-items: center; justify-content: center;
    }
    .adj:first-child { border-radius: 4px 0 0 4px; border-right: none; }
    .adj:last-child { border-radius: 0 4px 4px 0; border-left: none; }
    .adj:hover:not(:disabled) { background: #2a2d35; color: #fff; }

    .quick-bets { display: flex; gap: 0.3rem; margin-top: 0.5rem; flex-wrap: wrap; }
    .quick-bets button {
        flex: 1; min-width: 40px;
        background: rgba(255,255,255,0.05); border: none; color: #666;
        font-size: 0.65rem; padding: 6px; border-radius: 2px;
        cursor: pointer; transition: all 0.2s; font-weight: bold;
    }
    .quick-bets button:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #fff; }

    .launch-btn, .abort-btn {
        width: 100%; height: 100%; border: none; border-radius: 4px; cursor: pointer;
        position: relative; overflow: hidden; transition: transform 0.1s;
        display: flex; align-items: center; justify-content: center;
        clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
    }
    .launch-btn:active, .abort-btn:active { transform: scale(0.98); }

    .launch-btn { background: var(--cyber-cyan); box-shadow: 0 0 30px rgba(0, 240, 255, 0.2); }
    .launch-btn:hover { background: #00d0dd; box-shadow: 0 0 50px rgba(0, 240, 255, 0.4); }
    .launch-btn:disabled { background: #222; color: #444; box-shadow: none; cursor: not-allowed; }

    .abort-btn { background: var(--cyber-yellow); box-shadow: 0 0 30px rgba(252, 238, 10, 0.3); animation: pulse-red 0.5s infinite; }
    .abort-btn:hover { background: #ffd700; }

    .btn-content { display: flex; flex-direction: column; align-items: center; line-height: 1.1; color: #000; z-index: 2; }
    .btn-content .big { font-size: 2rem; font-weight: 900; font-family: 'Chakra Petch', monospace; letter-spacing: 0.05em; }
    .btn-content .small { font-size: 0.9rem; font-weight: bold; opacity: 0.7; }

    .footer-status {
        padding: 0.4rem 1rem; display: flex; justify-content: space-between;
        background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05);
        font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #444;
    }

    @media (max-width: 640px) {
        .controls-panel { grid-template-columns: 1fr; gap: 1.5rem; }
        .action-section { height: 100px; }
        .screen-wrapper { height: 300px; }
        .big-multiplier { font-size: 3.5rem; }
        .crash-box h2, .win-msg h2 { font-size: 1.5rem; }
    }
</style>