<script lang="ts">
    import { userStore } from '$lib/stores';
    import { onMount, onDestroy } from 'svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { Howl } from 'howler';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';
    import { fade, scale } from 'svelte/transition';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let animationFrame: number;

    let betAmount = 100;
    let multiplier = 1.00;
    let isPlaying = false;
    let isCrashed = false;
    let gameId: string | null = null;
    let targetCrashPoint = 0;
    let startTime = 0;

    let gameStatus = 'IDLE';
    let winAmount = 0;

    let history: { val: number, crashed: boolean }[] = [];
    let sounds: { [key: string]: Howl } = {};

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500 });
    $: if ($userStore.user) displayedCredits.set($userStore.user.casino_credits);

    let particles: {x: number, y: number, vx: number, vy: number, life: number, color: string}[] = [];
    let shakeIntensity = 0;
    let themeColor = '#00f3ff';

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        drawIdle();

        sounds.engine = new Howl({ src: ['/sounds/suspense_music.mp3'], loop: true, volume: 0, rate: 0.8 });
        sounds.crash = new Howl({ src: ['/sounds/fail.mp3'], volume: 1.0 });
        sounds.win = new Howl({ src: ['/sounds/sucsess.mp3'], volume: 0.8 });
        sounds.click = new Howl({ src: ['/sounds/click.mp3'] });
        sounds.tick = new Howl({ src: ['/sounds/click_for_other_buttons.mp3'], volume: 0.2 });

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrame);
            sounds.engine?.stop();
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
        if (betAmount > ($userStore.user?.casino_credits || 0)) {
            modal.error("ОШИБКА", "НЕДОСТАТОЧНО ЭНЕРГИИ (PC).");
            return;
        }
        if (betAmount > 1000) {
            modal.error("ОШИБКА", "МАКСИМАЛЬНАЯ СТАВКА 1000 PC.");
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
            const data = result.data.data;

            gameId = data.gameId;
            targetCrashPoint = parseFloat(atob(data.token));
            userStore.update(s => { if(s.user) s.user.casino_credits = data.newBalance; return s; });

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
        const currentMult = multiplier;
        gameStatus = 'CASHED_OUT';
        sounds.engine?.stop();
        sounds.win?.play();
        winAmount = Math.floor(betAmount * currentMult);
        addToHistory(currentMult, false);

        try {
            const functions = getFunctions();
            const cashOutFunc = httpsCallable(functions, 'cashOutCrashGame');
            await cashOutFunc({ gameId, multiplier: currentMult });
            userStore.update(s => { if(s.user) s.user.casino_credits += winAmount; return s; });
        } catch (e) {
            gameStatus = 'CRASHED';
            isCrashed = true;
            addToHistory(targetCrashPoint, true);
        }
    }

    function addToHistory(val: number, crashed: boolean) {
        history = [{ val, crashed }, ...history].slice(0, 10);
    }

    function loop() {
        if (!isPlaying) return;

        const timeElapsed = (Date.now() - startTime) / 1000;
        const speed = 0.08;
        let nextMult = Math.exp(speed * timeElapsed);

        if (nextMult >= targetCrashPoint) {
            crash(targetCrashPoint);
            return;
        }

        if (gameStatus !== 'CASHED_OUT') {
            multiplier = nextMult;
            updateTheme(multiplier);
        }

        const rate = 0.8 + (timeElapsed * 0.05);
        sounds.engine?.rate(Math.min(rate, 3.0));

        if (multiplier > 10) shakeIntensity = Math.min((multiplier - 10) * 0.5, 5);

        drawFrame(timeElapsed, nextMult);
        animationFrame = requestAnimationFrame(loop);
    }

    function crash(finalVal: number) {
        multiplier = finalVal;
        isCrashed = true;
        isPlaying = false;
        shakeIntensity = 10;
        updateTheme(finalVal);

        if (gameStatus !== 'CASHED_OUT') {
            gameStatus = 'CRASHED';
            sounds.crash?.play();
            addToHistory(finalVal, true);
        }

        sounds.engine?.stop();

        drawFrame((Date.now() - startTime) / 1000, finalVal);

        const shakeDecay = setInterval(() => {
            shakeIntensity *= 0.8;
            if (shakeIntensity < 0.1) {
                shakeIntensity = 0;
                clearInterval(shakeDecay);
                setTimeout(() => {
                   if (gameStatus === 'CASHED_OUT' || gameStatus === 'CRASHED') {
                       isPlaying = false;
                   }
                }, 1000);
            }
            drawFrame((Date.now() - startTime) / 1000, finalVal);
        }, 16);
    }

    function drawFrame(t: number, val: number) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;

        ctx.save();
        ctx.translate(dx, dy);

        ctx.fillStyle = '#050a10';
        ctx.fillRect(-10, -10, w + 20, h + 20);

        const gridSpeed = 50 + (val * 20);
        drawGrid(t * gridSpeed, w, h);

        const x = Math.min(t * 100, w - 100);

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

        if (!isCrashed && gameStatus !== 'CASHED_OUT') {
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
            ctx.moveTo(10, 0);
            ctx.lineTo(-10, 7);
            ctx.lineTo(-10, -7);
            ctx.closePath();
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, 30 + Math.random() * 10, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
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

<div class="page-container">
    <div class="bg-blur-1" style="background: {themeColor}; opacity: 0.2;"></div>

    <div class="terminal-frame" style="border-color: {themeColor}; box-shadow: 0 0 30px rgba(0,0,0,0.8), 0 0 20px {themeColor}33;">

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
                    <input type="number" bind:value={betAmount} disabled={isPlaying} class="cyber-input">
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
        flex: 1; min-width: 0; /* Резина */
        background: #0a0c10; border: 1px solid #333; color: #fff;
        text-align: center; font-size: 1.2rem; font-weight: bold;
        border-left: none; border-right: none; font-family: 'Chakra Petch', monospace;
    }
    .cyber-input:focus { outline: none; border-color: var(--cyber-cyan); }

    .adj {
        flex: 0 0 3rem; /* Фиксированная ширина кнопок */
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
        width: 100%; height: 100%; min-height: 80px; /* Мин высота для пальца */
        border: none; border-radius: 4px; cursor: pointer;
        position: relative; overflow: hidden; transition: transform 0.1s;
        display: flex; align-items: center; justify-content: center;
        clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    }
    .launch-btn:active, .abort-btn:active { transform: scale(0.98); }

    .launch-btn { background: var(--cyber-cyan); box-shadow: 0 0 20px rgba(0, 240, 255, 0.2); }
    .launch-btn:hover { background: #00d0dd; box-shadow: 0 0 40px rgba(0, 240, 255, 0.4); }
    .launch-btn:disabled { background: #222; color: #444; box-shadow: none; cursor: not-allowed; }

    .abort-btn { background: var(--cyber-yellow); box-shadow: 0 0 20px rgba(252, 238, 10, 0.3); animation: pulse-red 0.5s infinite; }
    .abort-btn:hover { background: #ffd700; }

    .btn-content { display: flex; flex-direction: column; align-items: center; line-height: 1.1; color: #000; z-index: 2; }
    .btn-content .big { font-size: 1.5rem; font-weight: 900; font-family: 'Chakra Petch', monospace; letter-spacing: 0.05em; }
    .btn-content .small { font-size: 0.8rem; font-weight: bold; opacity: 0.7; }

    .footer-status {
        padding: 0.4rem 1rem; display: flex; justify-content: space-between;
        background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05);
        font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #444;
    }

    @media (max-width: 640px) {
        .page-container { padding: 0.5rem; }
        .controls-panel { grid-template-columns: 1fr; gap: 1rem; padding: 1rem; }
        .screen-wrapper { height: 250px; }
        .action-section { height: 70px; }
        .big-multiplier { font-size: 3.5rem; }
        .crash-box h2, .win-msg h2 { font-size: 1.5rem; }
    }
</style>