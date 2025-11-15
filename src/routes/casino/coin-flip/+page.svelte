<script lang="ts">
    import { userStore } from '$lib/stores';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { cubicOut, quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { onMount, onDestroy } from 'svelte';
    import { Howl } from 'howler';

    const dealerPhrases = {
        greeting: ["> За столом никаких резких движений."],
        idle: ["> Ставки сделаны? Выбирай.", "> Не заставляй меня ждать.", "> Удача любит смелых... и богатых.", "> Решайся уже."],
        thinking: ["> Считываю траекторию...", "> Анализ вероятностей...", "> Протоколы удачи запущены..."],
        win: ["> Хмф. Новичкам везет.", "> Ладно, твоя взяла. На этот раз.", "> Не зазнавайся. Сеть переменчива."],
        lose: ["> Как предсказуемо.", "> Сигнал потерян. Как и твои Протокоины.", "> Может, попробуешь что-то попроще?"],
        no_credits: ["> Пустые карманы? Возвращайся, когда сможешь себе это позволить.", "> Кредиты закончились. Сеанс окончен."]
    };

    let betAmount = 10;
    let isPlaying = false;
    let result: 'heads' | 'tails' | null = null;
    let lastWin = false;
    let dealerMessage = dealerPhrases.greeting[0];

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500, easing: quintOut });
    $: $userStore.user?.casino_credits && displayedCredits.set($userStore.user.casino_credits);

    let sounds: { [key: string]: Howl } = {};
    onMount(() => {
        sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.15, autoplay: true });
        sounds.coin_flip = new Howl({ src: ['/sounds/coin_flip.mp3'], volume: 0.7 });
        sounds.coin_win = new Howl({ src: ['/sounds/coin_win.mp3'], volume: 0.8 });
        sounds.coin_lose = new Howl({ src: ['/sounds/coin_lose.mp3'], volume: 0.7 });

        return () => {
            sounds.ambient?.stop();
        };
    });

    function setDealerMessage(state: keyof typeof dealerPhrases) {
        const phrases = dealerPhrases[state];
        dealerMessage = phrases[Math.floor(Math.random() * phrases.length)];
    }

    async function playGame(playerChoice: 'heads' | 'tails') {
        if (isPlaying || !$userStore.user) return;

        const currentBet = Number(betAmount);
        if ($userStore.user.casino_credits < currentBet) {
            setDealerMessage('no_credits');
            modal.error("Недостаточно средств", "На вашем балансе не хватает Протокоинов для такой ставки.");
            return;
        }
        if (isNaN(currentBet) || currentBet <= 0) {
            modal.error("Неверная ставка", "Ставка должна быть положительным числом.");
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
            modal.error("Ошибка игры", error.message || "Не удалось соединиться с игровым сервером.");
            isPlaying = false;
            setDealerMessage('idle');
        }
    }
</script>

<svelte:head>
    <title>Стол Ориона | The Glitch Pit</title>
</svelte:head>

<div class="page-container">
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <div class="dealer-container">
        <img src="/casino/orioncasino.png" alt="Крупье Орион" class="dealer-art" />
        <div class="dealer-dialogue">
            <p>{dealerMessage}</p>
        </div>
    </div>

    <div class="coin-zone">
        <div class="coin" class:flipping={isPlaying} class:heads={result === 'heads'} class:tails={result === 'tails'}>
            <div class="face front">
                <img src="/casino/orel.png" alt="Орел" />
            </div>
            <div class="face back">
                <img src="/casino/reshka.png" alt="Решка" />
            </div>
        </div>

        {#if result !== null}
            <div class="result-feedback" class:win={lastWin} class:loss={!lastWin}>
                {lastWin ? 'ВЫИГРЫШ' : 'ПРОВАЛ'}
            </div>
        {/if}
    </div>

    <div class="controls-container">
        <div class="balance-display">
            <span class="label">БАЛАНС</span>
            <span class="value">{Math.floor($displayedCredits)} PC</span>
        </div>
        <div class="bet-control">
            <button class="bet-adjust" on:click={() => betAmount = Math.max(10, betAmount - 10)} disabled={isPlaying}>-</button>
            <input id="bet-amount" type="number" bind:value={betAmount} min="1" max={$userStore.user?.casino_credits} disabled={isPlaying} />
            <button class="bet-adjust" on:click={() => betAmount += 10} disabled={isPlaying}>+</button>
        </div>
        <div class="choices">
            <button class="choice-btn heads" on:click={() => playGame('heads')} disabled={isPlaying}>
                <img src="/casino/orel.png" alt="Орел" class="btn-icon"/>
                <span>ОРЕЛ</span>
            </button>
            <button class="choice-btn tails" on:click={() => playGame('tails')} disabled={isPlaying}>
                <img src="/casino/reshka.png" alt="Решка" class="btn-icon"/>
                <span>РЕШКА</span>
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
        grid-template-rows: auto 1fr auto;
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
            grid-template-rows: auto 1fr auto;
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