<script lang="ts">
    import { userStore } from '$lib/stores';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { onMount, onDestroy } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { Howl } from 'howler';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';
    import { scale, fade } from 'svelte/transition';
    import GlitchOverlay from '$lib/components/casino/GlitchOverlay.svelte';
    import ArtifactSynthesis from '$lib/components/casino/ArtifactSynthesis.svelte';

    const translate = (key: string) => get(t)(key);
    const MAX_BET = 1000;

    let betAmount = 10;
    let isGlobalSpinning = false;

    let reelStates = ['stopped', 'stopped', 'stopped'];
    let reels: string[] = ['protomap_logo', 'protomap_logo', 'protomap_logo'];

    let winAmount = 0;
    let winTier = 0;
    let currentGlitchLevel = 0;

    let glitchShards = 0;
    let showSynthesisModal = false;
    let synthesisResult: { runes: string[], totalWin: number } | null = null;

    // Переменная для таймера звука вращения (вынесена сюда, чтобы очистить при выходе)
    let spinSoundInterval: any;

    $: if (betAmount > MAX_BET) betAmount = MAX_BET;
    $: if (betAmount < 0) betAmount = 1;

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500, easing: quintOut });

    // СИНХРОНИЗАЦИЯ
    $: if ($userStore.user && !isGlobalSpinning) {
        displayedCredits.set($userStore.user.casino_credits);
        glitchShards = $userStore.user.glitch_shards || 0;
    }

    let audioContext: AudioContext;
    let sounds: { [key: string]: Howl } = {};

    function createSynthSound(type: 'reel_spin' | 'reel_stop') {
        if (!audioContext) return;
        // Проверка состояния контекста, чтобы не было ошибок при быстром переходе
        if (audioContext.state === 'closed') return;

        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        if (type === 'reel_spin') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(100, audioContext.currentTime);
            osc.frequency.linearRampToValueAtTime(600, audioContext.currentTime + 0.1);
            gain.gain.setValueAtTime(0.05, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        } else {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
        }
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.15);
    }

    onMount(() => {
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.3, autoplay: true });
            sounds.suspense = new Howl({ src: ['/sounds/suspense_music.mp3'], loop: true, volume: 0.7 });
            sounds.win1 = new Howl({ src: ['/sounds/win1.mp3'], volume: 0.6 });
            sounds.win2 = new Howl({ src: ['/sounds/win2.mp3'], volume: 0.7 });
            sounds.win3 = new Howl({ src: ['/sounds/win3.mp3'], volume: 0.8 });
            sounds.jackpot = new Howl({ src: ['/sounds/main_jackpot.mp3'], volume: 1.0 });
            sounds.glitchJackpot = new Howl({ src: ['/sounds/glitch_jackpot.mp3'], volume: 0.9 });
            sounds.click = new Howl({ src: ['/sounds/click.mp3'], volume: 0.5 });
            sounds.synthesis = new Howl({ src: ['/sounds/purchase.mp3'], volume: 1.0 });
        } catch (e) { console.error("Audio init failed", e); }
    });

    // ВАЖНО: ОЧИСТКА ПАМЯТИ ПРИ УХОДЕ СО СТРАНИЦЫ
    onDestroy(() => {
        // 1. Останавливаем таймер звука вращения
        if (spinSoundInterval) clearInterval(spinSoundInterval);

        // 2. Выгружаем все звуки Howler из памяти
        if (sounds) {
            Object.values(sounds).forEach(s => {
                s.stop();
                s.unload();
            });
        }

        // 3. Закрываем AudioContext
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
    });

    async function spinReels() {
        if (isGlobalSpinning || !$userStore.user) return;

        const currentBet = Number(betAmount);
        if (isNaN(currentBet) || currentBet <= 0 || currentBet > $userStore.user.casino_credits) {
            modal.error(translate('slots.modal_invalid_title'), translate('slots.modal_invalid_text'));
            return;
        }
        if (currentBet > MAX_BET) { betAmount = MAX_BET; return; }

        isGlobalSpinning = true;
        winAmount = 0;
        winTier = 0;
        reelStates = ['spinning', 'spinning', 'spinning'];

        sounds.ambient?.fade(0.3, 0.1, 500);
        sounds.suspense?.play();

        // Запускаем звук вращения
        spinSoundInterval = setInterval(() => createSynthSound('reel_spin'), 150);

        try {
            const functions = getFunctions();
            const playSlotMachineFunc = httpsCallable(functions, 'playSlotMachine');

            const response = await playSlotMachineFunc({ bet: currentBet });
            const gameResult = (response.data as any).data;

            // Ждем завершения спина (1с)
            await new Promise(r => setTimeout(r, 1000));

            clearInterval(spinSoundInterval);
            reels[0] = gameResult.reels[0];
            reelStates[0] = 'stopped';
            createSynthSound('reel_stop');

            await new Promise(r => setTimeout(r, 500));
            reels[1] = gameResult.reels[1];
            reelStates[1] = 'stopped';
            createSynthSound('reel_stop');

            await new Promise(r => setTimeout(r, 600));
            reels[2] = gameResult.reels[2];
            reelStates[2] = 'stopped';
            createSynthSound('reel_stop');

            // === ФИНАЛ СПИНА ===
            sounds.suspense?.stop();
            sounds.ambient?.fade(0.1, 0.3, 500);

            winAmount = gameResult.winAmount;

            // 1. Обновляем визуально осколки
            if (gameResult.shards !== undefined) {
                glitchShards = gameResult.shards;
            }

            // 2. Обработка победы
            if (winAmount > 0) {
                const winRatio = winAmount / currentBet;
                if (winRatio >= 100) { winTier = 4; sounds.jackpot?.play(); }
                else if (winRatio >= 25) { winTier = 3; sounds.win3?.play(); }
                else if (winRatio >= 10) { winTier = 2; sounds.win2?.play(); }
                else { winTier = 1; sounds.win1?.play(); }
            } else {
                if (gameResult.shardsAdded > 0) {
                    sounds.glitchJackpot?.play();
                }
            }

            // 3. Обновляем UserStore
            userStore.update(store => {
                if (store.user) {
                    store.user.casino_credits = gameResult.newBalance;
                    store.user.glitch_shards = gameResult.shards;
                }
                return store;
            });

            setTimeout(() => {
                isGlobalSpinning = false;
                winTier = 0;
            }, 2000);

        } catch (error: any) {
            clearInterval(spinSoundInterval);
            sounds.suspense?.stop();
            reelStates = ['stopped', 'stopped', 'stopped'];
            modal.error(translate('slots.modal_error_title'), error.message || "Error.");
            isGlobalSpinning = false;
        }
    }

    async function handleSynthesis() {
        if (glitchShards < 10 || isGlobalSpinning) return;

        isGlobalSpinning = true;
        sounds.click?.play();

        try {
            const functions = getFunctions();
            const synthFunc = httpsCallable(functions, 'synthesizeArtifact');

            const res = await synthFunc();
            const data = (res.data as any).data;

            sounds.synthesis?.play();
            synthesisResult = data;
            showSynthesisModal = true;

            userStore.update(s => {
                if (s.user) {
                    s.user.casino_credits = data.newBalance;
                    s.user.glitch_shards = 0;
                }
                return s;
            });
            glitchShards = 0;

        } catch (e: any) {
            modal.error(translate('ui.error'), e.message);
        } finally {
            isGlobalSpinning = false;
        }
    }
</script>

<svelte:head>
    <title>{$t('slots.title')} | The Glitch Pit</title>
</svelte:head>

<div class="page-container"
    class:win-tier-1={winTier === 1}
    class:win-tier-2={winTier === 2}
    class:win-tier-3={winTier === 3}
    class:win-tier-4={winTier === 4}
    class:win-tier-negative={winTier === -1}
>
    <!-- 1. МОДАЛКА СИНТЕЗА (НОВОЕ) -->
    {#if showSynthesisModal && synthesisResult}
        <ArtifactSynthesis
            artifactIds={synthesisResult.runes}
            totalWin={synthesisResult.totalWin}
            on:close={() => showSynthesisModal = false}
        />
    {/if}

    <!-- ЭФФЕКТЫ ФОНА -->
    <GlitchOverlay
        level={currentGlitchLevel}
        on:stopMusic={() => {
            sounds.ambient?.stop();
            sounds.suspense?.stop();
        }}
        on:restoreMusic={() => {
            if (!sounds.ambient?.playing()) sounds.ambient?.play();
        }}
    />

    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <!-- ЧАСТИЦЫ ПОБЕДЫ -->
    <div class="win-effects">
        {#each Array(20) as _, i}
            <div class="particle" style="--i: {i}"></div>
        {/each}
        <div class="jackpot-flash"></div>
    </div>

    <!-- ИГРОВОЙ АВТОМАТ -->
    <div class="slot-machine-container">
        <div class="machine-frame">

            <!-- ШАПКА -->
            <div class="machine-header">
                <h1 class="machine-title glitch" data-text="PROTO-SLOTS">PROTO-SLOTS</h1>
                <div class="jackpot-ticker">
                    {$t('slots.jackpot')}
                </div>
            </div>

            <!-- БАРАБАНЫ -->
            <div class="reels-window-rim">
                <div class="reels-window">
                    <div class="payline"></div>

                    <!-- REEL 1 -->
                    <div class="reel-col">
                        <div class="reel-viewport">
                            {#if reelStates[0] === 'spinning'}
                                <div class="reel-strip spinning">
                                    <img src="/casino/paw.svg" alt="" class="blur-icon">
                                    <img src="/casino/ram.svg" alt="" class="blur-icon">
                                    <img src="/casino/heart.svg" alt="" class="blur-icon">
                                    <img src="/casino/protomap_logo.svg" alt="" class="blur-icon">
                                    <img src="/casino/glitch-6.svg" alt="" class="blur-icon">
                                </div>
                            {:else}
                                <div class="static-symbol bounce">
                                    <img src="/casino/{reels[0]}.svg" alt={reels[0]} class="symbol" style="--glow-color: var(--color-{reels[0]})" />
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- REEL 2 -->
                    <div class="reel-col">
                        <div class="reel-viewport">
                            {#if reelStates[1] === 'spinning'}
                                <div class="reel-strip spinning delay-1">
                                    <img src="/casino/ram.svg" alt="" class="blur-icon">
                                    <img src="/casino/heart.svg" alt="" class="blur-icon">
                                    <img src="/casino/protomap_logo.svg" alt="" class="blur-icon">
                                    <img src="/casino/glitch-6.svg" alt="" class="blur-icon">
                                    <img src="/casino/paw.svg" alt="" class="blur-icon">
                                </div>
                            {:else}
                                <div class="static-symbol bounce">
                                    <img src="/casino/{reels[1]}.svg" alt={reels[1]} class="symbol" style="--glow-color: var(--color-{reels[1]})" />
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- REEL 3 -->
                    <div class="reel-col">
                        <div class="reel-viewport">
                            {#if reelStates[2] === 'spinning'}
                                <div class="reel-strip spinning delay-2">
                                    <img src="/casino/heart.svg" alt="" class="blur-icon">
                                    <img src="/casino/protomap_logo.svg" alt="" class="blur-icon">
                                    <img src="/casino/glitch-6.svg" alt="" class="blur-icon">
                                    <img src="/casino/paw.svg" alt="" class="blur-icon">
                                    <img src="/casino/ram.svg" alt="" class="blur-icon">
                                </div>
                            {:else}
                                <div class="static-symbol bounce">
                                    <img src="/casino/{reels[2]}.svg" alt={reels[2]} class="symbol" style="--glow-color: var(--color-{reels[2]})" />
                                </div>
                            {/if}
                        </div>
                    </div>

                </div>
            </div>

            <!-- 2. ШКАЛА ХАОСА (НОВОЕ) -->
            <div class="chaos-meter-container">
                <div class="meter-label">
                    <span>CHAOS CHARGE</span>
                    <span class="count" class:ready={glitchShards >= 10}>{glitchShards} / 10</span>
                </div>

                <div class="meter-track">
                    <div class="meter-fill" style="width: {(glitchShards / 10) * 100}%" class:full={glitchShards >= 10}></div>
                    {#each Array(9) as _, i}
                        <div class="meter-tick" style="left: {(i + 1) * 10}%"></div>
                    {/each}
                </div>

                {#if glitchShards >= 10}
                    <button class="synthesize-btn" on:click={handleSynthesis} transition:scale>
                        ⚠️ SYNTHESIZE ARTIFACT ⚠️
                    </button>
                {/if}
            </div>

            <!-- ВЫИГРЫШ -->
            <div class="win-display" class:visible={(winAmount > 0) && !isGlobalSpinning}>
                {$t('slots.win')}: <span class="win-amount">+{winAmount} PC</span>
            </div>

            <!-- ПАНЕЛЬ УПРАВЛЕНИЯ -->
            <div class="control-panel-rim">
                <div class="control-panel">
                    <div class="panel-display balance">
                        <span class="label">{$t('ui.balance')}</span>
                        <span class="value">{Math.floor($displayedCredits)}</span>
                    </div>

                    <div class="bet-control">
                        <label for="bet-amount">{$t('slots.bet_label')}</label>
                        <div class="bet-input-wrapper">
                            <button class="bet-adjust" on:click={() => betAmount = Math.max(10, betAmount - 10)} disabled={isGlobalSpinning}>-</button>
                            <input id="bet-amount" type="number" bind:value={betAmount} min="1" max={MAX_BET} disabled={isGlobalSpinning} />
                            <button class="bet-adjust" on:click={() => betAmount = Math.min(MAX_BET, betAmount + 10)} disabled={isGlobalSpinning}>+</button>
                        </div>
                    </div>

                    <button class="spin-button" on:click={spinReels} disabled={isGlobalSpinning || (glitchShards >= 10)}>
                        <div class="spin-text">{isGlobalSpinning ? $t('slots.spinning') : $t('slots.spin')}</div>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- ТАБЛИЦА ВЫПЛАТ (ОБНОВЛЕННАЯ) -->
    <div class="paytable-container">
        <h4 class="paytable-title font-display">{$t('slots.combinations')}</h4>
        <div class="paytable-grid">
            <div class="combo">
                <div class="icons"><img src="/casino/paw.svg" alt="paw"><img src="/casino/paw.svg" alt="paw"><img src="/casino/paw.svg" alt="paw"></div>
                <div class="multiplier">x2</div>
            </div>
            <div class="combo">
                <div class="icons"><img src="/casino/ram.svg" alt="ram"><img src="/casino/ram.svg" alt="ram"><img src="/casino/ram.svg" alt="ram"></div>
                <div class="multiplier">x5</div>
            </div>
            <div class="combo">
                <div class="icons"><img src="/casino/heart.svg" alt="heart"><img src="/casino/heart.svg" alt="heart"><img src="/casino/heart.svg" alt="heart"></div>
                <div class="multiplier">x10</div>
            </div>
            <div class="combo jackpot">
                <div class="icons"><img src="/casino/protomap_logo.svg" alt="logo"><img src="/casino/protomap_logo.svg" alt="logo"><img src="/casino/protomap_logo.svg" alt="logo"></div>
                <div class="multiplier">x100</div>
            </div>
            <!-- Обновил описание для Глитча -->
            <div class="combo">
                <div class="icons"><img src="/casino/glitch-6.svg" alt="glitch"><img src="/casino/glitch-6.svg" alt="glitch"><img src="/casino/glitch-6.svg" alt="glitch"></div>
                <div class="multiplier text-xs" style="color: #bd00ff; text-shadow: 0 0 10px #bd00ff; font-weight: 900;">
                    FULL CHARGE
                </div>
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

    @keyframes spin-loop {
        0% { transform: translateY(0); }
        100% { transform: translateY(-83.33%); }
    }

    @keyframes bounce-stop {
        0% { transform: translateY(-50px) scaleY(1.2); filter: blur(2px); }
        60% { transform: translateY(10px) scaleY(0.9); filter: blur(0); }
        100% { transform: translateY(0) scaleY(1); }
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
    .bg-blur-1, .bg-blur-2 { position: absolute; width: 400px; height: 400px; border-radius: 50%; filter: blur(150px); pointer-events: none; z-index: 0; }
    .bg-blur-1 { background: #bd00ff; top: 10%; left: 10%; animation: float-blur-1 20s infinite ease-in-out; }
    .bg-blur-2 { background: #fcee0a; bottom: 10%; right: 10%; animation: float-blur-2 25s infinite ease-in-out; }

    .win-effects { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100; }
    .particle { position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; border-radius: 50%; opacity: 0; }
    .win-tier-1 .particle { background: #fcee0a; animation: particle-anim 1s ease-out forwards; --x: calc(cos(var(--i) * 18deg) * 100px); --y: calc(sin(var(--i) * 18deg) * 100px); }
    .win-tier-2 .machine-frame { animation: win-pulse 0.5s 2; }
    .win-tier-3::before { content: ''; position: absolute; top: 50%; left: 50%; width: 2px; height: 2px; border-radius: 50%; box-shadow: 0 0 200px 100px #fcee0a; animation: god-rays 1.5s ease-out; }
    .jackpot-flash { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle, white, #fcee0a, transparent 70%); opacity: 0; }
    .win-tier-4 .jackpot-flash { animation: jackpot-flash-anim 1s ease-in-out; }
    .page-container.win-tier-negative { animation: screen-flicker 0.2s 5; }

    .slot-machine-container { position: relative; z-index: 2; width: 100%; max-width: 900px; }
    .machine-frame { background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1.5rem; padding: 2rem; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); }
    .machine-header { text-align: center; margin-bottom: 2rem; }
    .machine-title { font-size: 3rem; color: #fff; margin: 0; animation: glitch-text 0.2s infinite; }
    .jackpot-ticker { font-family: 'Chakra Petch', monospace; color: #ff003c; display: inline-block; padding: 0.2rem 1rem; border: 1px solid #ff003c; box-shadow: 0 0 10px #ff003c; margin-top: 0.5rem; }

    .reels-window-rim { padding: 10px; background: rgba(0,0,0,0.3); border-radius: 1rem; box-shadow: inset 0 0 20px #000; margin-bottom: 2rem; }
    .reels-window { display: flex; gap: 10px; height: 250px; background: rgba(0,0,0,0.5); border-radius: 0.5rem; overflow: hidden; position: relative; box-shadow: inset 0 0 50px rgba(0,0,0,0.8); }
    .payline { position: absolute; top: 50%; left: 0; width: 100%; height: 2px; background: #ff003c; z-index: 10; transform: translateY(-50%); pointer-events: none; box-shadow: 0 0 10px #ff003c; }

    .reel-col { flex: 1; position: relative; overflow: hidden; height: 100%; }
    .reel-viewport { height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; }

    .reel-strip { position: absolute; top: 0; left: 0; width: 100%; display: flex; flex-direction: column; filter: blur(0px); }
    .reel-strip.spinning { animation: spin-loop 0.2s linear infinite; filter: blur(3px); }
    .blur-icon { width: 100%; height: 250px; object-fit: contain; padding: 20px; opacity: 0.8; }

    .static-symbol { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .static-symbol.bounce { animation: bounce-stop 0.4s ease-out; }

    .symbol { width: 70%; height: 70%; object-fit: contain; filter: drop-shadow(0 0 10px var(--glow-color)) drop-shadow(0 0 20px var(--glow-color)); opacity: 1; transform: scale(1); }
    .placeholder-symbol { font-size: 5rem; color: #333; font-family: 'Chakra Petch', monospace; }

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

    .spin-button { width: 100px; height: 100px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #ff5500, #cc3300); border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.5), 0 0 40px rgba(255, 102, 0, 0.4); cursor: pointer; position: relative; transition: transform 0.1s, box-shadow 0.1s; }
    .spin-button:active:not(:disabled) { transform: scale(0.95); box-shadow: 0 5px 10px rgba(0,0,0,0.5); }
    .spin-button:disabled { filter: grayscale(1) brightness(0.5); cursor: not-allowed; }
    .spin-text { font-family: 'Chakra Petch', monospace; font-weight: bold; font-size: 1.8rem; color: #fff; text-shadow: 0 2px 5px rgba(0,0,0,0.5); }

    .paytable-container { width: 100%; max-width: 900px; margin-top: 2rem; position: relative; z-index: 2; color: #fff; }
    .paytable-title { text-align: center; text-transform: uppercase; letter-spacing: 0.2em; color: #888; margin-bottom: 1rem; }
    .paytable-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; background: rgba(20, 20, 25, 0.4); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; padding: 1rem; }
    .combo { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .icons { display: flex; gap: 0.25rem; }
    .icons img { width: 24px; height: 24px; }
    .multiplier { font-family: 'Chakra Petch', monospace; font-size: 1.2rem; color: #fff; font-weight: bold; }
    .combo.jackpot .multiplier { color: #fcee0a; animation: win-pulse 2s infinite; }
    .combo.loss .multiplier { color: #ff003c; }

    /* CHAOS METER */
    .chaos-meter-container {
        width: 100%; margin: 1rem 0; padding: 0 1rem;
    }
    .meter-label {
        display: flex; justify-content: space-between; font-family: 'Chakra Petch', monospace;
        font-size: 0.8rem; color: #666; margin-bottom: 4px; font-weight: bold;
    }
    .meter-label .count.ready { color: #bd00ff; text-shadow: 0 0 5px #bd00ff; animation: pulse-text 1s infinite; }

    .meter-track {
        height: 12px; background: #111; border: 1px solid #333;
        border-radius: 6px; position: relative; overflow: hidden;
    }
    .meter-fill {
        height: 100%; background: linear-gradient(90deg, #5500aa, #bd00ff);
        width: 0%; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 10px #bd00ff;
    }
    .meter-fill.full { background: #fff; box-shadow: 0 0 15px #fff, 0 0 30px #bd00ff; animation: pulse-bar 0.5s infinite alternate; }

    .meter-tick {
        position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(0,0,0,0.5);
    }

    .synthesize-btn {
        width: 100%; margin-top: 10px; padding: 0.8rem;
        background: #bd00ff; color: #fff; font-weight: 900;
        font-family: 'Chakra Petch', monospace; border: 2px solid #fff;
        border-radius: 4px; cursor: pointer;
        animation: glitch-skew 2s infinite; /* Твоя существующая анимация глитча */
        box-shadow: 0 0 20px #bd00ff;
        text-transform: uppercase; letter-spacing: 0.1em;
    }
    .synthesize-btn:hover { background: #fff; color: #bd00ff; }

    @keyframes pulse-text { 0% { opacity: 0.7; } 50% { opacity: 1; } 100% { opacity: 0.7; } }
    @keyframes pulse-bar { from { opacity: 0.8; } to { opacity: 1; filter: brightness(1.2); } }

    @media (max-width: 768px) {
        .page-container { padding: 1rem; }
        .machine-frame { padding: 1rem; }
        .control-panel { flex-direction: column; align-items: stretch; gap: 1.5rem; }
        .spin-button { width: 100%; height: 80px; border-radius: 10px; }
        .reels-window { height: 150px; }
        .paytable-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
        .icons img { width: 20px; height: 20px; }
        .reel-strip.spinning { animation: spin-loop 0.15s linear infinite; }
        .blur-icon { height: 150px; }
    }
</style>