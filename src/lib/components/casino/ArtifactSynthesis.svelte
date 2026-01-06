<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { fade, scale, fly } from 'svelte/transition';
    import { quintOut, elasticOut } from 'svelte/easing';
    import { ARTIFACTS_DATA } from '$lib/client/artifacts';
    import { t } from 'svelte-i18n';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { Howl } from 'howler';

    export let artifactIds: string[] = [];
    export let totalWin: number = 0;

    const dispatch = createEventDispatcher();

    type Stage = 'implode' | 'fusion' | 'flash' | 'reveal';
    let stage: Stage = 'implode';

    // Управление поочередным появлением
    let visibleCards = 0;
    let showFooter = false;

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let animationFrame: number;

    // Звуки
    let sfxCard: Howl;
    let sfxRare: Howl;
    let sfxLegendary: Howl;
    let sfxCursed: Howl;

    const shards = Array(10).fill(0).map(() => ({
        angle: Math.random() * 360,
        dist: 400 + Math.random() * 200,
        delay: Math.random() * 0.3
    }));

    onMount(() => {
        const sfxImplode = new Howl({ src: ['/sounds/synthesis_implode.mp3'], volume: 0.7 });
        const sfxFusion = new Howl({ src: ['/sounds/synthesis_fusion_loop.mp3'], volume: 0.5, loop: true });
        const sfxFlash = new Howl({ src: ['/sounds/synthesis_flash_hit.mp3'], volume: 1.0 });

        sfxCard = new Howl({ src: ['/sounds/card_drop.mp3'], volume: 0.8 });
        sfxRare = new Howl({ src: ['/sounds/rare_drop.mp3'], volume: 0.9 });
        sfxLegendary = new Howl({ src: ['/sounds/legendary_drop.mp3'], volume: 1.0 });
        sfxCursed = new Howl({ src: ['/sounds/cursed_drop.mp3'], volume: 0.9 });

        // 1. IMPLOSION
        sfxImplode.play();

        // 2. FUSION
        setTimeout(() => {
            stage = 'fusion';
            sfxFusion.play();
            initLightning();
        }, 1500);

        // 3. FLASH
        setTimeout(() => {
            stage = 'flash';
            sfxFusion.stop();
            sfxFlash.play();
            stopLightning();
        }, 5500);

        // 4. REVEAL START
        setTimeout(() => {
            stage = 'reveal';
            startRevealSequence();
        }, 5800);
    });

    onDestroy(() => {
        stopLightning();
    });

    // === ЛОГИКА ПООЧЕРЕДНОГО ПОЯВЛЕНИЯ ===
    function startRevealSequence() {
        // Было 3000, ставим 2000 (2 секунды)
        // Это оптимальный баланс между "скучно" и "слишком быстро"
        const CARD_DELAY = 2000;

        artifactIds.forEach((id, i) => {
            setTimeout(() => {
                visibleCards = i + 1;

                const item = ARTIFACTS_DATA[id];

                if (item.rarity === 'legendary') {
                    sfxLegendary?.play();
                } else if (item.rarity === 'rare') {
                    sfxRare?.play();
                } else if (item.rarity === 'cursed') {
                    sfxCursed?.play();
                } else {
                    sfxCard?.play();
                }

            }, i * CARD_DELAY);
        });

        setTimeout(() => {
            showFooter = true;
        }, artifactIds.length * CARD_DELAY);
    }

    function initLightning() {
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        loopLightning();
    }

    function stopLightning() {
        if (animationFrame) cancelAnimationFrame(animationFrame);
    }

    function loopLightning() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const bolts = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < bolts; i++) {
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            let x = centerX; let y = centerY;
            const angle = Math.random() * Math.PI * 2;
            const length = 100 + Math.random() * 150;
            for (let j = 0; j < 10; j++) {
                x += Math.cos(angle) * (length / 10) + (Math.random() - 0.5) * 20;
                y += Math.sin(angle) * (length / 10) + (Math.random() - 0.5) * 20;
                ctx.lineTo(x, y);
            }
            const color = Math.random() > 0.5 ? '#bd00ff' : '#00f3ff';
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.stroke();
        }
        animationFrame = requestAnimationFrame(loopLightning);
    }

    function close() {
        dispatch('close');
    }

    function holoSlam(node: Element, { delay = 0, duration = 1000 }) {
        return {
            delay,
            duration,
            css: (t: number) => {
                const eased = elasticOut(t);
                const scale = 2 - (eased * 1);
                const opacity = t;
                const blur = (1 - t) * 10;
                return `transform: scale(${scale}) translateY(${(1 - eased) * -50}px); opacity: ${opacity}; filter: blur(${blur}px);`;
            }
        };
    }
</script>

<div class="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden" transition:fade>

    {#if stage === 'implode'}
        <div class="center-stage">
            {#each shards as s}
                <div
                    class="shard"
                    style="
                        --angle: {s.angle}deg;
                        --dist: {s.dist}px;
                        animation-delay: {s.delay}s;
                    "
                >
                    <img src="/casino/glitch-6.svg" alt="shard" />
                </div>
            {/each}
            <div class="black-hole"></div>
        </div>
    {/if}

    {#if stage === 'fusion'}
        <div class="fusion-stage" in:scale={{duration: 200, start: 0}}>
            <canvas bind:this={canvas} width="800" height="800" class="lightning-canvas"></canvas>
            <div class="core-ring r1"></div>
            <div class="core-ring r2"></div>
            <div class="core-ring r3"></div>
            <div class="unstable-core"></div>
            <h2 class="fusion-text">SYNTHESIZING...</h2>
        </div>
    {/if}

    {#if stage === 'flash'}
        <div class="flash-screen"></div>
    {/if}

    <!-- === ФАЗА 4: REVEAL (Результат) === -->
    {#if stage === 'reveal'}
        <div class="synthesis-panel" in:scale={{duration: 500, start: 0.9, easing: quintOut}}>
            <h2 class="text-3xl font-display text-white mb-8 text-center text-glow">
                {$t('synthesis.title')}
            </h2>

            <div class="cards-row">
                {#each artifactIds as id, i}
                    <!-- Рендерим только по очереди -->
                    {#if i < visibleCards}
                        {@const item = ARTIFACTS_DATA[id]}

                        <div
                            class="artifact-card-wrapper"
                            in:holoSlam={{ delay: 0, duration: 1200 }}
                        >
                            <div class="artifact-card rarity-{item.rarity}" style="--item-color: {item.color}">

                                <!-- ЭФФЕКТЫ ПРИ ПОЯВЛЕНИИ -->
                                <div class="shockwave" style="border-color: {item.color}"></div>
                                <div class="flash-overlay"></div>

                                <div class="card-bg"></div>
                                <div class="icon">{item.icon}</div>
                                <div class="info">
                                    <h3 class="name" style="color: {item.color}">
                                        {$t(`artifacts.${id}.name`)}
                                    </h3>
                                    <div class="separator" style="background: {item.color}"></div>
                                    <p class="desc">{$t(`artifacts.${id}.desc`)}</p>
                                </div>

                                {#if item.rarity === 'legendary'}
                                    <div class="rarity-badge legendary">LEGENDARY</div>
                                {:else if item.rarity === 'rare'}
                                    <div class="rarity-badge rare">RARE</div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                {/each}
            </div>

            <!-- RESULT FOOTER (Показываем только когда showFooter = true) -->
            {#if showFooter}
                <div class="result-footer" in:fade={{ duration: 500 }}>
                    <div class="calculation-box">
                        <span class="calc-label">{$t('synthesis.total')}</span>
                        <span class="calc-val glitch" data-text="{totalWin} PC">{totalWin} PC</span>
                    </div>

                    <NeonButton on:click={close} extraClass="w-full max-w-md mx-auto mt-6">
                        {$t('synthesis.btn_collect')}
                    </NeonButton>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .text-glow {
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px currentColor;
    }

    .center-stage {
        position: absolute;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        perspective: 1000px;
    }

    .black-hole {
        width: 60px;
        height: 60px;
        background: #000;
        border-radius: 50%;
        box-shadow: 0 0 50px #bd00ff, 0 0 100px #00f3ff, inset 0 0 20px #fff;
        z-index: 10;
        animation: pulse-hole 0.2s infinite alternate;
    }

    @keyframes pulse-hole {
        from { transform: scale(1); box-shadow: 0 0 50px #bd00ff; }
        to { transform: scale(1.1); box-shadow: 0 0 70px #ff003c; }
    }

    .shard {
        position: absolute;
        width: 40px;
        height: 40px;
        transform: rotate(var(--angle)) translateX(var(--dist));
        opacity: 1;
        animation: suck-in 1.5s cubic-bezier(0.7, 0, 1, 1) forwards;
    }

    .shard img {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 0 10px #ff003c) brightness(1.5);
        animation: spin-shard 1s linear infinite;
    }

    @keyframes suck-in {
        0% { opacity: 1; }
        90% { opacity: 1; }
        100% {
            transform: rotate(calc(var(--angle) + 720deg)) translateX(0px) scale(0);
            opacity: 0;
        }
    }

    @keyframes spin-shard {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .fusion-stage {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .lightning-canvas {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 5;
        pointer-events: none;
        opacity: 0.8;
        mix-blend-mode: screen;
    }

    .unstable-core {
        width: 140px;
        height: 140px;
        border-radius: 50%;
        background: radial-gradient(circle, #fff 20%, #bd00ff 60%, #000 100%);
        box-shadow: 0 0 60px #bd00ff, 0 0 120px #00f3ff, inset 0 0 30px #fff;
        z-index: 10;
        animation: shake-core 0.05s infinite;
    }

    @keyframes shake-core {
        0% { transform: translate(2px, 1px) scale(1); }
        25% { transform: translate(-1px, -2px) scale(1.02); }
        50% { transform: translate(-3px, 0px) scale(0.98); }
        75% { transform: translate(0px, 2px) scale(1.02); }
        100% { transform: translate(1px, -1px) scale(1); }
    }

    .core-ring {
        position: absolute;
        border-radius: 50%;
        border: 4px solid transparent;
        z-index: 8;
        box-shadow: 0 0 15px rgba(255,255,255,0.1);
    }

    .r1 {
        width: 220px;
        height: 220px;
        border-top-color: #00f3ff;
        border-bottom-color: #00f3ff;
        filter: drop-shadow(0 0 10px #00f3ff);
        animation: spin-ring 2s linear infinite;
    }

    .r2 {
        width: 320px;
        height: 320px;
        border-left-color: #ff003c;
        border-right-color: #ff003c;
        filter: drop-shadow(0 0 10px #ff003c);
        animation: spin-ring 3s linear infinite reverse;
    }

    .r3 {
        width: 450px;
        height: 450px;
        border: 1px dashed rgba(255, 255, 255, 0.5);
        opacity: 0.5;
        animation: spin-ring 8s linear infinite;
    }

    @keyframes spin-ring {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .fusion-text {
        position: absolute;
        bottom: 15%;
        color: #fff;
        font-family: 'Chakra Petch', monospace;
        font-weight: 900;
        font-size: 1.5rem;
        letter-spacing: 0.5em;
        animation: text-flicker 0.1s infinite;
        text-shadow: 0 0 20px #bd00ff;
        text-align: center;
        width: 100%;
    }

    @keyframes text-flicker {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 0.9; }
    }

    .flash-screen {
        position: absolute;
        inset: 0;
        background: white;
        z-index: 200;
        animation: flash-out 0.5s ease-out forwards;
    }

    @keyframes flash-out {
        0% { opacity: 1; }
        100% { opacity: 0; display: none; }
    }

    .synthesis-panel {
        width: 100%;
        max-width: 1000px;
        padding: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: rgba(10, 10, 15, 0.8);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        box-shadow: 0 0 50px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.05);
        max-height: 95vh;
        overflow-y: auto;
    }

    .cards-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 2rem;
        margin-bottom: 2rem;
        perspective: 1000px;
        width: 100%;
    }

    .artifact-card-wrapper {
        width: 220px;
        perspective: 1000px;
        z-index: 10;
    }

    .artifact-card {
        position: relative;
        background: rgba(0, 0, 0, 0.6);
        border: 2px solid var(--item-color);
        border-radius: 16px;
        padding: 2rem 1rem;
        text-align: center;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 340px;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s;
    }

    .artifact-card:hover {
        transform: translateY(-15px) scale(1.05);
        z-index: 10;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px var(--item-color);
    }

    .flash-overlay {
        position: absolute;
        inset: 0;
        background: white;
        mix-blend-mode: overlay;
        z-index: 20;
        animation: card-flash 0.6s ease-out forwards;
        pointer-events: none;
    }

    @keyframes card-flash {
        0% { opacity: 1; }
        100% { opacity: 0; }
    }

    .shockwave {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 100%;
        height: 100%;
        border: 2px solid white;
        border-radius: 16px;
        opacity: 0;
        z-index: -1;
        animation: shockwave-expand 0.8s ease-out forwards;
    }

    @keyframes shockwave-expand {
        0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; border-width: 10px; }
        10% { opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2); opacity: 0; border-width: 0px; }
    }

    .card-bg {
        position: absolute;
        inset: 0;
        opacity: 0.15;
        background: radial-gradient(circle at 50% 0%, var(--item-color), transparent 80%);
        z-index: 0;
    }

    .icon {
        font-size: 4.5rem;
        margin-bottom: 1.5rem;
        filter: drop-shadow(0 0 20px var(--item-color));
        transform: scale(1);
        animation: float-icon 4s ease-in-out infinite;
        z-index: 1;
    }

    @keyframes float-icon {
        0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 20px var(--item-color)); }
        50% { transform: translateY(-10px); filter: drop-shadow(0 0 40px var(--item-color)) brightness(1.2); }
    }

    .info {
        z-index: 1;
        width: 100%;
    }

    .name {
        font-weight: 900;
        font-family: 'Chakra Petch', monospace;
        font-size: 1.3rem;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        line-height: 1.1;
        text-shadow: 0 0 10px rgba(0,0,0,0.8);
    }

    .separator {
        height: 2px;
        width: 60px;
        margin: 0.8rem auto;
        background: var(--item-color);
        box-shadow: 0 0 10px var(--item-color);
        opacity: 0.8;
    }

    .desc {
        font-size: 0.9rem;
        color: #ccc;
        line-height: 1.5;
        font-family: 'Inter', sans-serif;
    }

    .rarity-cursed {
        border-style: dashed;
        border-width: 2px;
        background: repeating-linear-gradient(
            45deg,
            rgba(0,0,0,0.8),
            rgba(0,0,0,0.8) 10px,
            rgba(255,0,0,0.05) 10px,
            rgba(255,0,0,0.05) 20px
        );
    }

    .rarity-legendary {
        border-width: 3px;
        animation: legendary-border 3s infinite alternate;
    }

    .rarity-legendary::before {
        content: '';
        position: absolute;
        inset: -5px;
        background: linear-gradient(45deg, #bd00ff, #00f3ff, #bd00ff);
        z-index: -2;
        filter: blur(20px);
        opacity: 0.6;
        animation: legendary-glow 3s infinite linear;
    }

    @keyframes legendary-border {
        0% { box-shadow: 0 0 20px var(--item-color); border-color: var(--item-color); }
        100% { box-shadow: 0 0 50px var(--item-color), inset 0 0 20px var(--item-color); border-color: #fff; }
    }

    @keyframes legendary-glow {
        0% { filter: blur(20px) hue-rotate(0deg); }
        100% { filter: blur(25px) hue-rotate(360deg); }
    }

    .rarity-badge {
        position: absolute;
        top: 12px;
        right: -32px;
        width: 120px;
        background: var(--item-color);
        color: #000;
        font-weight: 900;
        font-size: 0.7rem;
        transform: rotate(45deg);
        text-align: center;
        padding: 4px 0;
        font-family: 'Chakra Petch', monospace;
        letter-spacing: 0.1em;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        z-index: 2;
    }

    .rarity-badge.legendary {
        background: linear-gradient(90deg, #bd00ff, #00f3ff);
        color: #fff;
        text-shadow: 0 1px 2px #000;
        animation: shimmer 2s infinite linear;
        background-size: 200% 100%;
    }

    @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }

    .result-footer {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 1rem;
        border-top: 1px solid rgba(255,255,255,0.1);
        padding-top: 1.5rem;
    }

    .calculation-box {
        background: rgba(0, 0, 0, 0.4);
        padding: 1rem 3rem;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.1);
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
    }

    .calculation-box::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: 16px;
        background: linear-gradient(90deg, transparent, var(--cyber-yellow), transparent);
        opacity: 0.3;
        z-index: -1;
    }

    .calc-label {
        color: #888;
        font-size: 0.9rem;
        letter-spacing: 0.2em;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
    }

    .calc-val {
        font-size: 4rem;
        font-weight: 900;
        color: #fff;
        text-shadow: 0 0 30px var(--cyber-yellow);
        line-height: 1;
        font-family: 'Chakra Petch', monospace;
    }

    @media (max-width: 768px) {
        .synthesis-panel {
            padding: 1.5rem 1rem;
            max-height: 85vh;
        }

        .cards-row {
            flex-direction: column;
            gap: 1rem;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .artifact-card-wrapper {
            width: 100%;
            max-width: 320px;
        }

        .artifact-card {
            min-height: auto;
            flex-direction: row;
            padding: 1rem;
            text-align: left;
            align-items: center;
        }

        .icon {
            font-size: 2.5rem;
            margin-bottom: 0;
            margin-right: 1rem;
            flex-shrink: 0;
        }

        .info {
            text-align: left;
        }

        .name {
            font-size: 1rem;
            margin-bottom: 0.2rem;
        }

        .separator {
            width: 30px;
            margin: 0.3rem 0;
            height: 2px;
        }

        .desc {
            font-size: 0.75rem;
        }

        .rarity-badge {
            top: auto;
            bottom: 5px;
            right: -25px;
            width: 100px;
            font-size: 0.6rem;
            padding: 2px 0;
        }

        .unstable-core {
            width: 100px;
            height: 100px;
        }

        .r1 { width: 160px; height: 160px; }
        .r2 { width: 220px; height: 220px; }
        .r3 { width: 280px; height: 280px; }

        .calc-val {
            font-size: 2.5rem;
        }
        .calculation-box {
            padding: 1rem 2rem;
            width: 100%;
        }
    }
</style>