<script lang="ts">
    import { userStore } from '$lib/stores';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { onMount, onDestroy } from 'svelte';
    import { cubicOut, quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { Howl } from 'howler';

    const SPIN_DURATION = 3000;
    const REEL_SYMBOLS = ['paw', 'ram', 'heart', 'protomap_logo', 'glitch-6'];

    let betAmount = 10;
    let isSpinning = false;
    let reels: (string | null)[] = [null, null, null];
    let finalReels: string[] = [];
    let winAmount = 0;
    let lossAmount = 0;
    let winTier = 0;

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500, easing: quintOut });
    $: $userStore.user?.casino_credits && displayedCredits.set($userStore.user.casino_credits);

    let audioContext: AudioContext;
    let sounds: { [key: string]: Howl } = {};

    function createSynthSound(type: 'reel_spin' | 'reel_stop') {
        if (!audioContext) return;

        if (type === 'reel_spin') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.05);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.05);
        }
        if (type === 'reel_stop') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
        }
    }

    onMount(() => {
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

            sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.3 });
            sounds.suspense = new Howl({ src: ['/sounds/suspense_music.mp3'], loop: true, volume: 0.7 });
            sounds.win1 = new Howl({ src: ['/sounds/win1.mp3'], volume: 0.6 });
            sounds.win2 = new Howl({ src: ['/sounds/win2.mp3'], volume: 0.7 });
            sounds.win3 = new Howl({ src: ['/sounds/win3.mp3'], volume: 0.8 });
            sounds.jackpot = new Howl({ src: ['/sounds/main_jackpot.mp3'], volume: 1.0 });
            sounds.glitchJackpot = new Howl({ src: ['/sounds/glitch_jackpot.mp3'], volume: 0.9 });

            const letsGo = new Howl({
                src: ['/sounds/lets-go-gambling.mp3'],
                volume: 0.1,
                onend: () => sounds.ambient?.play()
            });
            letsGo.play();
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }

        return () => {
            Object.values(sounds).forEach(sound => sound.stop());
            audioContext?.close();
        };
    });

    async function spinReels() {
        if (isSpinning || !$userStore.user) return;

        const currentBet = Number(betAmount);
        if (isNaN(currentBet) || currentBet <= 0 || currentBet > $userStore.user.casino_credits) {
            modal.error("Неверная ставка", "Введите корректную ставку (не больше вашего баланса).");
            return;
        }

        isSpinning = true;
        winAmount = 0;
        lossAmount = 0;
        winTier = 0;

        sounds.ambient?.fade(0.3, 0.1, 500);
        sounds.suspense?.play();
        const spinSoundInterval = setInterval(() => createSynthSound('reel_spin'), 100);
        const symbolAnimInterval = setInterval(() => {
            reels = [
                REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
                REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
                REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
            ];
        }, 75);

        try {
            const functions = getFunctions();
            const playSlotMachineFunc = httpsCallable(functions, 'playSlotMachine');
            const response = await playSlotMachineFunc({ bet: currentBet });
            const gameResult = (response.data as any).data;

            finalReels = gameResult.reels;

            setTimeout(() => {
                clearInterval(spinSoundInterval);
                clearInterval(symbolAnimInterval);

                sounds.suspense?.stop();
                sounds.ambient?.fade(0.1, 0.3, 500);

                reels = finalReels;
                winAmount = gameResult.winAmount;
                lossAmount = gameResult.lossAmount;

                createSynthSound('reel_stop');
                setTimeout(() => createSynthSound('reel_stop'), 200);
                setTimeout(() => {
                    createSynthSound('reel_stop');
                    if (lossAmount > 0) {
                        winTier = -1;
                        sounds.glitchJackpot?.play();
                    } else if (winAmount > 0) {
                        const winRatio = winAmount / currentBet;
                        if (winRatio >= 100) {
                            winTier = 4;
                            sounds.jackpot?.play();
                        } else if (winRatio >= 25) {
                            winTier = 3;
                            sounds.win3?.play();
                        } else if (winRatio >= 10) {
                            winTier = 2;
                            sounds.win2?.play();
                        } else {
                            winTier = 1;
                            sounds.win1?.play();
                        }
                    }
                }, 400);

                userStore.update(store => {
                    if (store.user) store.user.casino_credits = gameResult.newBalance;
                    return store;
                });

                setTimeout(() => {
                    isSpinning = false;
                    winTier = 0;
                }, 2500);

            }, SPIN_DURATION);

        } catch (error: any) {
            clearInterval(spinSoundInterval);
            clearInterval(symbolAnimInterval);
            sounds.suspense?.stop();
            sounds.ambient?.fade(0.1, 0.3, 500);
            modal.error("Ошибка игры", error.message || "Сбой соединения с игровым сервером.");
            isSpinning = false;
        }
    }
</script>

<svelte:head>
    <title>ПРОТО-СЛОТ | The Glitch Pit</title>
</svelte:head>

<div class="page-container"
    class:win-tier-1={winTier === 1}
    class:win-tier-2={winTier === 2}
    class:win-tier-3={winTier === 3}
    class:win-tier-4={winTier === 4}
    class:win-tier-negative={winTier === -1}
>
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>
    <div class="win-effects">
        {#each Array(20) as _, i}
            <div class="particle" style="--i: {i}"></div>
        {/each}
        <div class="jackpot-flash"></div>
    </div>

    <div class="slot-machine-container">
        <div class="machine-frame">
            <div class="machine-header">
                <h1 class="machine-title glitch" data-text="PROTO-SLOTS">PROTO-SLOTS</h1>
                <div class="jackpot-ticker">
                    ДЖЕКПОТ: <span class="jackpot-amount">999,999 PC</span>
                </div>
            </div>

            <div class="reels-window-rim">
                <div class="reels-window">
                    <div class="payline"></div>

                    <div class="reel-container">
                        <div class="reel" class:spinning={isSpinning}>
                            {#if reels[0]}
                                <img src="/casino/{reels[0]}.svg" alt={reels[0]} class="symbol" style="--glow-color: var(--color-{reels[0]})" />
                            {:else}
                                <span class="placeholder-symbol">?</span>
                            {/if}
                        </div>
                    </div>

                    <div class="reel-container">
                        <div class="reel" class:spinning={isSpinning}>
                             {#if reels[1]}
                                 <img src="/casino/{reels[1]}.svg" alt={reels[1]} class="symbol" style="--glow-color: var(--color-{reels[1]})" />
                             {:else}
                                <span class="placeholder-symbol">?</span>
                            {/if}
                        </div>
                    </div>

                    <div class="reel-container">
                        <div class="reel" class:spinning={isSpinning}>
                             {#if reels[2]}
                                 <img src="/casino/{reels[2]}.svg" alt={reels[2]} class="symbol" style="--glow-color: var(--color-{reels[2]})" />
                             {:else}
                                <span class="placeholder-symbol">?</span>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            <div class="win-display" class:visible={(winAmount > 0 || lossAmount > 0) && !isSpinning} class:loss={lossAmount > 0}>
                {#if lossAmount > 0}
                    ПОТЕРЯ: <span class="win-amount">-{lossAmount} PC</span>
                {:else}
                    ВЫИГРЫШ: <span class="win-amount">+{winAmount} PC</span>
                {/if}
            </div>

            <div class="control-panel-rim">
                <div class="control-panel">
                    <div class="panel-display balance">
                        <span class="label">ПРОТОКОИНЫ</span>
                        <span class="value">{Math.floor($displayedCredits)}</span>
                    </div>

                    <div class="bet-control">
                        <label for="bet-amount">СТАВКА</label>
                        <div class="bet-input-wrapper">
                            <button class="bet-adjust" on:click={() => betAmount = Math.max(10, betAmount - 10)} disabled={isSpinning}>-</button>
                            <input id="bet-amount" type="number" bind:value={betAmount} min="1" disabled={isSpinning} />
                            <button class="bet-adjust" on:click={() => betAmount += 10} disabled={isSpinning}>+</button>
                        </div>
                    </div>

                    <button class="spin-button" on:click={spinReels} disabled={isSpinning}>
                        <div class="spin-text">{isSpinning ? '...' : 'SPIN'}</div>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="paytable-container">
        <h4 class="paytable-title font-display">//: КОМБИНАЦИИ</h4>
        <div class="paytable-grid">
            <div class="combo">
                <div class="icons"><img src="/casino/paw.svg" alt="paw"><img src="/casino/paw.svg" alt="paw"><img src="/casino/paw.svg" alt="paw"></div>
                <div class="multiplier">x5</div>
            </div>
            <div class="combo">
                <div class="icons"><img src="/casino/ram.svg" alt="ram"><img src="/casino/ram.svg" alt="ram"><img src="/casino/ram.svg" alt="ram"></div>
                <div class="multiplier">x10</div>
            </div>
            <div class="combo">
                <div class="icons"><img src="/casino/heart.svg" alt="heart"><img src="/casino/heart.svg" alt="heart"><img src="/casino/heart.svg" alt="heart"></div>
                <div class="multiplier">x25</div>
            </div>
            <div class="combo jackpot">
                <div class="icons"><img src="/casino/protomap_logo.svg" alt="protomap_logo"><img src="/casino/protomap_logo.svg" alt="protomap_logo"><img src="/casino/protomap_logo.svg" alt="protomap_logo"></div>
                <div class="multiplier">x100</div>
            </div>
            <div class="combo loss">
                <div class="icons"><img src="/casino/glitch-6.svg" alt="glitch-6"><img src="/casino/glitch-6.svg" alt="glitch-6"><img src="/casino/glitch-6.svg" alt="glitch-6"></div>
                <div class="multiplier">-666</div>
            </div>
        </div>
    </div>
</div>

<style>
    :root {
        --color-paw: #00f0ff;
        --color-ram: #39ff14;
        --color-heart: #bd00ff;
        --color-protomap_logo: #fcee0a;
        --color-glitch-6: #ff003c;
    }

    @keyframes win-pulse { 0%, 100% { text-shadow: 0 0 10px #fcee0a, 0 0 20px #fcee0a; transform: scale(1); } 50% { text-shadow: 0 0 30px #fcee0a, 0 0 50px #fff; transform: scale(1.1); } }
    @keyframes glitch-text { 0% { text-shadow: 2px 0 #ff00c1, -2px 0 #01ffff; } 25% { text-shadow: -2px 0 #ff00c1, 2px 0 #01ffff; } 50% { text-shadow: 2px 0 #01ffff, -2px 0 #ff00c1; } 100% { text-shadow: 2px 0 #ff00c1, -2px 0 #01ffff; } }
    @keyframes float-blur-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(100px, 50px); } }
    @keyframes float-blur-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-80px, -60px); } }
    @keyframes particle-anim { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(var(--x), var(--y)); opacity: 0; } }
    @keyframes god-rays { 0% { opacity: 0; } 50% { opacity: 0.3; } 100% { opacity: 0; transform: scale(2); } }
    @keyframes jackpot-flash-anim { 0%, 100% { opacity: 0; } 10%, 30% { opacity: 1; } }
    @keyframes screen-flicker { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(0.5) contrast(2); } }

    .page-container {
        min-height: calc(100vh - 64px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        background: #0a0a0a;
        padding: 2rem;
    }
    .bg-blur-1, .bg-blur-2 {
        position: absolute;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        filter: blur(150px);
        pointer-events: none;
        z-index: 0;
    }
    .bg-blur-1 {
        background: #bd00ff;
        top: 10%;
        left: 10%;
        animation: float-blur-1 20s infinite ease-in-out;
    }
    .bg-blur-2 {
        background: #fcee0a;
        bottom: 10%;
        right: 10%;
        animation: float-blur-2 25s infinite ease-in-out;
    }

    .win-effects { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100; }
    .particle { position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; border-radius: 50%; opacity: 0; }
    .win-tier-1 .particle {
        background: #fcee0a;
        animation: particle-anim 1s ease-out forwards;
        --x: calc(cos(var(--i) * 18deg) * 100px);
        --y: calc(sin(var(--i) * 18deg) * 100px);
    }
    .win-tier-2 .machine-frame { animation: win-pulse 0.5s 2; }
    .win-tier-3::before {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        width: 2px; height: 2px;
        border-radius: 50%;
        box-shadow: 0 0 200px 100px #fcee0a;
        animation: god-rays 1.5s ease-out;
    }
    .jackpot-flash { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle, white, #fcee0a, transparent 70%); opacity: 0; }
    .win-tier-4 .jackpot-flash { animation: jackpot-flash-anim 1s ease-in-out; }
    .page-container.win-tier-negative { animation: screen-flicker 0.2s 5; }

    .slot-machine-container { position: relative; z-index: 2; width: 100%; max-width: 900px; }
    .machine-frame {
        background: rgba(20, 20, 25, 0.6);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 1.5rem;
        padding: 2rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }
    .machine-header { text-align: center; margin-bottom: 2rem; }
    .machine-title { font-size: 3rem; color: #fff; margin: 0; animation: glitch-text 0.2s infinite; }
    .jackpot-ticker {
        font-family: 'Chakra Petch', monospace; color: #ff003c;
        display: inline-block; padding: 0.2rem 1rem;
        border: 1px solid #ff003c;
        box-shadow: 0 0 10px #ff003c; margin-top: 0.5rem;
    }
    .reels-window-rim {
        padding: 10px;
        background: rgba(0,0,0,0.3);
        border-radius: 1rem;
        box-shadow: inset 0 0 20px #000;
        margin-bottom: 2rem;
    }
    .reels-window {
        display: flex; gap: 10px; height: 250px;
        background: rgba(0,0,0,0.5);
        border-radius: 0.5rem;
        overflow: hidden; position: relative;
        box-shadow: inset 0 0 50px rgba(0,0,0,0.8);
    }
    .payline {
        position: absolute; top: 50%; left: 0; width: 100%; height: 2px;
        background: #ff003c;
        z-index: 10; transform: translateY(-50%); pointer-events: none;
        box-shadow: 0 0 10px #ff003c;
    }
    .reel-container { flex: 1; position: relative; overflow: hidden; }
    .reel {
        height: 100%; display: flex; align-items: center; justify-content: center;
        transition: filter 0.3s ease-out;
    }
    .symbol {
        width: 70%; height: 70%; object-fit: contain;
        filter: drop-shadow(0 0 10px var(--glow-color)) drop-shadow(0 0 20px var(--glow-color));
        transition: transform 0.3s, opacity 0.3s;
        opacity: 1;
        transform: scale(1);
    }
    .placeholder-symbol {
        font-size: 5rem;
        color: #333;
        font-family: 'Chakra Petch', monospace;
        transition: opacity 0.3s;
    }
    .reel.spinning .symbol {
        filter: blur(8px) drop-shadow(0 0 10px var(--glow-color));
        opacity: 0.5;
        transform: scale(0.9);
    }
    .win-display { text-align: center; font-family: 'Chakra Petch', monospace; font-size: 2.5rem; color: #fcee0a; margin-bottom: 2rem; opacity: 0; height: 3.5rem; transition: opacity 0.3s; }
    .win-display.visible { opacity: 1; animation: win-pulse 1s infinite; }
    .win-display.loss { color: #ff003c; animation-name: none; }
    .control-panel-rim { background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 1rem; }
    .control-panel { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .panel-display { text-align: center; }
    .panel-display .label { display: block; font-size: 0.8rem; color: #888; text-transform: uppercase; }
    .panel-display .value { display: block; font-size: 1.8rem; color: #fff; text-shadow: 0 0 5px #00f0ff; font-family: 'Chakra Petch', monospace; }

    .bet-control { text-align: center; font-family: 'Chakra Petch', monospace; }
    .bet-control label { display: block; color: #888; font-size: 0.8rem; margin-bottom: 0.5rem; }
    .bet-input-wrapper { display: flex; justify-content: center; }
    .bet-input-wrapper input { background: transparent; border: none; color: #fff; text-align: center; font-size: 1.8rem; width: 100px; font-family: inherit; }
    .bet-input-wrapper input:focus { outline: none; }
    .bet-adjust { background: transparent; color: #fff; border: 1px solid #444; width: 40px; height: 40px; font-size: 1.5rem; cursor: pointer; transition: all 0.2s; border-radius: 50%; }
    .bet-adjust:hover:not(:disabled) { background: #00f0ff; color: #000; }
    .bet-adjust:disabled { opacity: 0.3; }

    .spin-button {
        width: 100px; height: 100px; border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #ff5500, #cc3300);
        border: 2px solid rgba(255,255,255,0.2);
        box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.5), 0 0 40px rgba(255, 102, 0, 0.4);
        cursor: pointer; position: relative; transition: transform 0.1s, box-shadow 0.1s;
    }
    .spin-button:active:not(:disabled) { transform: scale(0.95); box-shadow: 0 5px 10px rgba(0,0,0,0.5); }
    .spin-button:disabled { filter: grayscale(1) brightness(0.5); cursor: not-allowed; }
    .spin-text { font-family: 'Chakra Petch', monospace; font-weight: bold; font-size: 1.8rem; color: #fff; text-shadow: 0 2px 5px rgba(0,0,0,0.5); }

    .paytable-container {
        width: 100%; max-width: 900px;
        margin-top: 2rem;
        position: relative;
        z-index: 2;
        color: #fff;
    }
    .paytable-title {
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: #888;
        margin-bottom: 1rem;
    }
    .paytable-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
        background: rgba(20, 20, 25, 0.4);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        padding: 1rem;
    }
    .combo {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }
    .icons { display: flex; gap: 0.25rem; }
    .icons img { width: 24px; height: 24px; }
    .multiplier {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.2rem;
        color: #fff;
        font-weight: bold;
    }
    .combo.jackpot .multiplier {
        color: #fcee0a;
        animation: win-pulse 2s infinite;
    }
    .combo.loss .multiplier {
        color: #ff003c;
    }

    @media (max-width: 768px) {
        .page-container { padding: 1rem; }
        .machine-frame { padding: 1rem; }
        .control-panel { flex-direction: column; align-items: stretch; gap: 1.5rem; }
        .spin-button { width: 100%; height: 80px; border-radius: 10px; }
        .reels-window { height: 150px; }
        .paytable-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
        .icons img { width: 20px; height: 20px; }
    }
</style>