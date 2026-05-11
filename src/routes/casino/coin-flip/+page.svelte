<script lang="ts">
    import { userStore } from '$lib/stores';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { cubicOut, quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { onMount, onDestroy } from 'svelte';
    import { Howl } from 'howler';

    // Локализация
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';
    import { renderMarkdown } from '$lib/utils/markdown';

    // Хелпер для перевода в JS
    const translate = (key: string) => get(t)(key);

    function getRandomQuote(category: 'greeting' | 'idle' | 'thinking' | 'win' | 'lose' | 'no_credits'): string {
        const quotes = get(t)(`coin.quotes.${category}`, { returnObjects: true }) as string[];
        if (Array.isArray(quotes) && quotes.length > 0) {
            return quotes[Math.floor(Math.random() * quotes.length)];
        }
        return "> ...";
    }

    let betAmount = 10;
    let isPlaying = false;
    let result: 'heads' | 'tails' | null = null;
    let lastWin = false;

    // ⬅️ НОВОЕ: Состояние тултипа
    let isMechanicsOpen = false;
    let tooltipElement: HTMLElement;
    let buttonElement: HTMLElement;

    let dealerMessage = "> ...";

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500, easing: quintOut });
    $: if ($userStore.user) {
        displayedCredits.set($userStore.user.casino_credits);
    }

    let sounds: { [key: string]: Howl } = {};

    onMount(() => {
        sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.15, autoplay: true });
        sounds.coin_flip = new Howl({ src: ['/sounds/coin_flip.mp3'], volume: 0.7 });
        sounds.coin_win = new Howl({ src: ['/sounds/coin_win.mp3'], volume: 0.8 });
        sounds.coin_lose = new Howl({ src: ['/sounds/coin_lose.mp3'], volume: 0.7 });

        dealerMessage = getRandomQuote('greeting');

        return () => {
            sounds.ambient?.stop();
        };
    });

    function setDealerMessage(state: 'greeting' | 'idle' | 'thinking' | 'win' | 'lose' | 'no_credits') {
        dealerMessage = getRandomQuote(state);
    }

    // ⬅️ НОВОЕ: Переключение тултипа с позиционированием
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

    async function playGame(playerChoice: 'heads' | 'tails') {
        if (isPlaying || !$userStore.user) return;

        betAmount = Math.floor(betAmount);
        const currentBet = betAmount;

        if ($userStore.user.casino_credits < currentBet) {
            setDealerMessage('no_credits');
            modal.error(translate('coin.modal_poor_title'), translate('coin.modal_poor_text'));
            return;
        }
        if (isNaN(currentBet) || currentBet <= 0) {
            modal.error(translate('coin.modal_invalid_title'), translate('coin.modal_invalid_text'));
            return;
        }

        isPlaying = true;
        result = null;
        setDealerMessage('thinking');
        sounds.coin_flip?.play();

        try {
            const functions = getFunctions();
            const playCoinFlipFunc = httpsCallable(functions, 'playCoinFlip');

            const response = await playCoinFlipFunc({ bet: currentBet, choice: playerChoice });
            const gameResult = (response.data as any).data;

            setTimeout(() => {
                result = gameResult.outcome;
                lastWin = gameResult.hasWon;

                if (gameResult.hasWon) {
                    setDealerMessage('win');
                    sounds.coin_win?.play();
                } else {
                    setDealerMessage('lose');
                    sounds.coin_lose?.play();
                }

                userStore.update(store => {
                    if (store.user) store.user.casino_credits = gameResult.newBalance;
                    return store;
                });

                setTimeout(() => {
                    isPlaying = false;
                    if (!document.hidden) setDealerMessage('idle');
                }, 3000);

            }, 2800);

        } catch (error: any) {
            modal.error(translate('coin.modal_error_title'), error.message || "Connection error.");
            isPlaying = false;
            setDealerMessage('idle');
        }
    }
</script>

<svelte:head>
    <title>{$t('coin.title')} | The Glitch Pit</title>
</svelte:head>

<!-- ⬅️ НОВОЕ: Закрываем тултип по клику на фон -->
<svelte:window on:click={closeMechanics} />

<div class="page-container">
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <!-- ⬅️ НОВОЕ: Инфо-кнопка -->
    <div class="game-header">
        <h1 class="game-title">{$t('coin.title')}</h1>
        <button
            bind:this={buttonElement}
            class="info-tooltip-wrapper"
            on:click|stopPropagation={toggleMechanics}
        >
            <div class="info-icon">?</div>

            <div bind:this={tooltipElement} class="custom-tooltip" class:mobile-visible={isMechanicsOpen}>
                <h5 class="tooltip-title">{$t('coin.mechanics_title')}</h5>
                <div class="tooltip-body">
                    {@html renderMarkdown($t('coin.mechanics_text'))}
                </div>
            </div>
        </button>
    </div>

    <div class="dealer-container">
        <img src="/casino/orioncasino.png" alt="Dealer Orion" class="dealer-art" />
        <div class="dealer-dialogue">
            <p>{dealerMessage}</p>
        </div>
    </div>

    <div class="coin-zone">
        <div class="coin" class:flipping={isPlaying} class:heads={result === 'heads'} class:tails={result === 'tails'}>
            <div class="face front">
                <img src="/casino/orel.png" alt="Heads" />
            </div>
            <div class="face back">
                <img src="/casino/reshka.png" alt="Tails" />
            </div>
        </div>

        {#if result !== null}
            <div class="result-feedback" class:win={lastWin} class:loss={!lastWin}>
                {lastWin ? $t('coin.win_label') : $t('coin.loss_label')}
            </div>
        {/if}
    </div>

    <div class="controls-container">
        <div class="balance-display">
            <span class="label">{$t('ui.balance')}</span>
            <span class="value">{Math.floor($displayedCredits)} PC</span>
        </div>
        <div class="bet-control">
            <button class="bet-adjust" on:click={() => betAmount = Math.max(10, betAmount - 10)} disabled={isPlaying}>-</button>
            <input
                id="bet-amount"
                type="number"
                bind:value={betAmount}
                min="1"
                max={$userStore.user?.casino_credits}
                step="1"
                on:input={() => betAmount = Math.floor(betAmount)}
                disabled={isPlaying}
            />
            <button class="bet-adjust" on:click={() => betAmount += 10} disabled={isPlaying}>+</button>
        </div>
        <div class="choices">
            <button class="choice-btn heads" on:click={() => playGame('heads')} disabled={isPlaying}>
                <img src="/casino/orel.png" alt="Heads" class="btn-icon"/>
                <span>{$t('coin.heads')}</span>
            </button>
            <button class="choice-btn tails" on:click={() => playGame('tails')} disabled={isPlaying}>
                <img src="/casino/reshka.png" alt="Tails" class="btn-icon"/>
                <span>{$t('coin.tails')}</span>
            </button>
        </div>
    </div>
</div>

<style>
    @keyframes coin-flip-3d {
        0% { transform: translateY(0) rotateX(0) rotateY(0) scale(1); }
        50% { transform: translateY(-50px) rotateX(2880deg) rotateY(360deg) scale(1.5); }
        100% { transform: translateY(0) rotateX(5760deg) rotateY(720deg) scale(1); }
    }
    @keyframes result-show {
        0% { opacity: 0; transform: scale(0.5); filter: blur(10px); }
        20% { opacity: 1; transform: scale(1.2); filter: blur(0); }
        80% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; }
    }
    @keyframes float-blur-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(100px, 50px); } }
    @keyframes float-blur-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-80px, -60px); } }

    .page-container {
        min-height: calc(100vh - 64px);
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        max-width: 1000px;
        margin: 0 auto;
        padding: 1rem;
        position: relative;
        overflow: hidden;
    }
    .bg-blur-1, .bg-blur-2 {
        position: fixed; width: 400px; height: 400px; border-radius: 50%;
        filter: blur(150px); pointer-events: none; z-index: -1;
    }
    .bg-blur-1 { background: var(--cyber-cyan); top: 10%; left: 10%; animation: float-blur-1 20s infinite ease-in-out; }
    .bg-blur-2 { background: var(--cyber-yellow); bottom: 10%; right: 10%; animation: float-blur-2 25s infinite ease-in-out; }

    /* ⬅️ НОВОЕ: Заголовок с кнопкой */
    .game-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin-bottom: 1rem;
        position: relative;
        z-index: 20;
    }
    .game-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 2rem;
        color: var(--cyber-yellow);
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
        width: 20px; height: 20px;
        border-radius: 50%;
        border: 1px solid #555;
        color: #777;
        background: rgba(255, 255, 255, 0.05);
        font-family: monospace;
        font-size: 13px;
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
        width: 320px;
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
        color: #ccc; font-size: 0.8rem; line-height: 1.5; text-align: left;
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
            font-size: 1.5rem;
        }
    }

    .dealer-container { position: relative; text-align: center; z-index: 10; }
    .dealer-art { max-width: 350px; max-height: 220px; margin: 0 auto; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5)); }
    .dealer-dialogue {
        background: rgba(10,10,10,0.8); backdrop-filter: blur(5px);
        border: 1px solid rgba(255,255,255,0.1); padding: 0.5rem 1.5rem;
        display: inline-block; margin-top: -2.5rem; position: relative;
        font-family: 'Chakra Petch', monospace; border-radius: 4px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    }
    .coin-zone { display: flex; align-items: center; justify-content: center; perspective: 1200px; position: relative; }
    .coin {
        width: 180px; height: 180px; position: relative;
        transform-style: preserve-3d;
        transition: transform 1.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .coin.flipping { animation: coin-flip-3d 2.8s cubic-bezier(0.3, 0.9, 0.7, 1.1); }
    .coin.heads { transform: rotateY(0deg); }
    .coin.tails { transform: rotateY(180deg); }

    .face {
        position: absolute; width: 100%; height: 100%;
        backface-visibility: hidden;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
    }
    .face img { width: 100%; height: 100%; filter: drop-shadow(0 0 20px rgba(255,255,255,0.3)); }
    .back { transform: rotateY(180deg); }

    .result-feedback {
        position: absolute; font-family: 'Chakra Petch', monospace;
        font-size: 5rem; font-weight: bold; opacity: 0;
        animation: result-show 2s ease-out forwards;
        text-transform: uppercase; pointer-events: none;
    }
    .result-feedback.win { color: var(--cyber-yellow); text-shadow: 0 0 25px var(--cyber-yellow), 0 0 50px #fff; }
    .result-feedback.loss { color: var(--cyber-red); text-shadow: 0 0 25px var(--cyber-red); }

    .controls-container {
        display: flex; align-items: center; justify-content: space-around;
        padding: 1.5rem; z-index: 10;
        background: rgba(10,10,10,0.6); backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .balance-display { text-align: center; }
    .balance-display .label { display: block; font-size: 0.8rem; color: #888; text-transform: uppercase; }
    .balance-display .value { display: block; font-size: 1.8rem; color: #fff; text-shadow: 0 0 5px var(--cyber-yellow); font-family: 'Chakra Petch', monospace; }

    .bet-control { display: flex; align-items: center; gap: 0.5rem; }
    .bet-control input {
        width: 100px; background: rgba(0,0,0,0.5); border: 1px solid #444; color: #fff;
        padding: 0.75rem; font-size: 1.5rem; text-align: center; border-radius: 4px;
    }
    .bet-control input:focus { outline: none; border-color: var(--cyber-yellow); }
    .bet-control input:disabled { opacity: 0.5; }
    .bet-adjust {
        background: transparent; color: #888; border: 1px solid #444; width: 48px; height: 48px;
        font-size: 1.8rem; cursor: pointer; transition: all 0.2s; border-radius: 50%;
    }
    .bet-adjust:hover:not(:disabled) { background: #444; color: #fff; }
    .bet-adjust:disabled { opacity: 0.3; }

    .choices { display: flex; gap: 1.5rem; }
    .choice-btn {
        padding: 1rem 2.5rem; font-family: 'Chakra Petch', monospace;
        font-size: 1.5rem; font-weight: bold; border: 2px solid;
        background: transparent; color: #fff; transition: all 0.2s;
        cursor: pointer; display: flex; align-items: center; gap: 0.5rem;
    }
    .btn-icon { width: 32px; height: 32px; }
    .choice-btn.heads { border-color: var(--cyber-yellow); }
    .choice-btn.tails { border-color: var(--cyber-cyan); }
    .choice-btn:hover:not(:disabled) { color: #000; }
    .choice-btn.heads:hover:not(:disabled) { background: var(--cyber-yellow); box-shadow: 0 0 20px var(--cyber-yellow); }
    .choice-btn.tails:hover:not(:disabled) { background: var(--cyber-cyan); box-shadow: 0 0 20px var(--cyber-cyan); }
    .choice-btn:disabled { opacity: 0.5; cursor: wait; filter: grayscale(1); }
    @media (max-width: 768px) {
        .page-container {
            padding: 0.5rem;
            grid-template-rows: auto auto 1fr auto;
        }
        .dealer-art {
            max-height: 150px;
        }
        .dealer-dialogue {
            font-size: 0.8rem;
            margin-top: -1.5rem;
            padding: 0.5rem 1rem;
        }

        .coin {
            width: 120px;
            height: 120px;
        }

        .result-feedback {
            font-size: 3rem;
        }

        .controls-container {
            flex-direction: column;
            gap: 1.5rem;
            padding: 1rem;
        }

        .choices {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        .choice-btn {
            padding: 1rem;
            font-size: 1.2rem;
            justify-content: center;
        }
    }
</style>