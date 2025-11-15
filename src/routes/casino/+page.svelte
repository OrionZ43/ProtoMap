<script lang="ts">
    import { userStore } from '$lib/stores';
    import { onMount, onDestroy } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { fade } from 'svelte/transition';
    import { Howl } from 'howler';

    let loadingBonus = false;

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, {
        duration: 700,
        easing: quintOut
    });
    $: $userStore.user?.casino_credits && displayedCredits.set($userStore.user.casino_credits);

    let sounds: { [key: string]: Howl } = {};
    onMount(() => {
        sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.3, autoplay: true });
        return () => {
            sounds.ambient?.stop();
        };
    });

    async function claimDailyBonus() {
        loadingBonus = true;
        try {
            const functions = getFunctions();
            const getDailyBonusFunc = httpsCallable(functions, 'getDailyBonus');
            const result = await getDailyBonusFunc();
            const data = (result.data as any).data;

            userStore.update(store => {
                if (store.user) {
                    store.user.casino_credits = data.new_balance;
                    store.user.last_daily_bonus = new Date();
                }
                return store;
            });

            modal.success("Бонус получен!", data.message);

        } catch (error: any) {
            modal.error("Ошибка", error.message || "Не удалось получить бонус. Попробуйте позже.");
        } finally {
            loadingBonus = false;
        }
    }
</script>

<svelte:head>
    <title>Казино "The Glitch Pit" | ProtoMap</title>
</svelte:head>

<div class="page-container">
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <div class="header">
        <h1 class="title font-display glitch" data-text="The Glitch Pit">The Glitch Pit</h1>
        <p class="subtitle">//: Делай ставки, выигрывай кастомизацию, не теряй голову ://</p>
    </div>

    {#if $userStore.user}
        <div class="user-panel">
            <div class="balance-display">
                <span class="label font-display">Баланс</span>
                <span class="amount font-display">{Math.floor($displayedCredits)} PC</span>
            </div>
            <div class="actions-group">
                <a href="/casino/shop" class="panel-btn shop">Магазин</a>
                <a href="/casino/inventory" class="panel-btn inventory">Инвентарь</a>
                <button class="panel-btn bonus" on:click={claimDailyBonus} disabled={loadingBonus}>
                    {loadingBonus ? '...' : 'Бонус'}
                </button>
            </div>
        </div>

        <div class="games-grid">
            <a href="/casino/coin-flip" class="game-card">
                <div class="game-art">
                    <img src="/casino/OaR.png" alt="Орел и Решка" class="art-img">
                    <div class="art-overlay"></div>
                </div>
                <div class="game-info">
                    <h3 class="game-title font-display">Стол Ориона</h3>
                    <p class="game-desc">Классическая игра "Орел или Решка". Удвой свою ставку или потеряй все.</p>
                    <span class="play-indicator font-display">Играть</span>
                </div>
            </a>

            <a href="/casino/slot-machine" class="game-card">
                <div class="game-art">
                     <img src="/casino/slots.png" alt="Прото-Слот" class="art-img">
                     <div class="art-overlay"></div>
                </div>
                <div class="game-info">
                    <h3 class="game-title font-display">Прото-Слот</h3>
                    <p class="game-desc">Испытай удачу на классическом слототроне. Сорви джекпот из трех лого ProtoMap!</p>
                    <span class="play-indicator font-display">Играть</span>
                </div>
            </a>
        </div>

    {:else}
        <div class="guest-panel" in:fade>
            <p class="guest-text">Для доступа в "The Glitch Pit" требуется идентификация.</p>
            <a href="/login" class="login-btn font-display">Подключиться к сети</a>
        </div>
    {/if}
</div>

<style>
    @keyframes float-blur-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(100px, 50px); } }
    @keyframes float-blur-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-80px, -60px); } }
    @keyframes glitch-text { 0% { text-shadow: 2px 0 #ff00c1, -2px 0 #01ffff; } 25% { text-shadow: -2px 0 #ff00c1, 2px 0 #01ffff; } 50% { text-shadow: 2px 0 #01ffff, -2px 0 #ff00c1; } 100% { text-shadow: 2px 0 #ff00c1, -2px 0 #01ffff; } }
    @keyframes card-hover-glow {
        from { box-shadow: 0 0 20px rgba(255, 255, 255, 0); border-color: rgba(255, 255, 255, 0.2); }
        to { box-shadow: 0 0 40px var(--glow-color, #fff); border-color: var(--glow-color, #fff); }
    }

    .page-container {
        min-height: calc(100vh - 64px);
        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        position: relative; overflow: hidden; background: #0a0a0a; padding: 2rem;
    }
    .bg-blur-1, .bg-blur-2 { position: absolute; width: 400px; height: 400px; border-radius: 50%; filter: blur(150px); pointer-events: none; z-index: 0; }
    .bg-blur-1 { background: var(--cyber-purple); top: 10%; left: 10%; animation: float-blur-1 20s infinite ease-in-out; }
    .bg-blur-2 { background: var(--cyber-yellow); bottom: 10%; right: 10%; animation: float-blur-2 25s infinite ease-in-out; }

    .header { text-align: center; margin-bottom: 3rem; position: relative; z-index: 2; }
    .title { font-size: 4rem; color: #fff; text-shadow: 0 0 15px #fff; }
    .subtitle { color: var(--text-muted-color); font-family: 'Chakra Petch', monospace; }

    .user-panel {
        width: 100%; max-width: 900px;
        display: flex; justify-content: space-between; align-items: center;
        background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem;
        padding: 1rem 1.5rem; margin-bottom: 3rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); z-index: 2;
        gap: 1rem;
    }
    .balance-display { font-size: 1.5rem; flex-shrink: 0; }
    .balance-display .label { color: var(--text-muted-color); margin-right: 0.5rem; }
    .balance-display .amount { color: var(--cyber-yellow); letter-spacing: 0.1em; }

    .actions-group {
        display: flex;
        gap: 1rem;
    }
    .panel-btn {
        padding: 0.75rem 1.5rem;
        font-family: 'Chakra Petch', monospace;
        font-weight: bold;
        color: rgba(255, 255, 255, 0.8);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        text-decoration: none;
        text-align: center;
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 0.75rem;
        box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease-in-out;
        white-space: nowrap;
    }
    .panel-btn:hover:not(:disabled) {
        color: #fff;
        transform: translateY(-2px);
    }
    .panel-btn:active:not(:disabled) {
        transform: translateY(1px);
        box-shadow: inset 2px 2px 5px rgba(0,0,0,0.5);
    }
    .panel-btn.shop:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-yellow); }
    .panel-btn.inventory:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-cyan); }
    .panel-btn.bonus:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-green); }
    .panel-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

    .games-grid {
        width: 100%; max-width: 900px;
        display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 2rem; z-index: 2;
    }
    .game-card {
        background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        display: flex; flex-direction: column; overflow: hidden;
        text-decoration: none; color: inherit;
        transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
    }
    .game-card:hover {
        transform: translateY(-10px);
        --glow-color: var(--cyber-yellow);
        animation: card-hover-glow 0.5s forwards;
    }
    .game-card.disabled { pointer-events: none; filter: grayscale(0.8) brightness(0.5); }

    .game-art { height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
    .art-img { width: 100%; height: 100%; object-fit: cover; }
    .art-icon { width: 80px; height: 80px; color: var(--cyber-yellow); opacity: 0.7; }
    .art-overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(to top, rgba(10,10,10,0.8) 0%, transparent 50%);
        transition: background 0.3s;
    }
    .game-card:hover .art-overlay { background: linear-gradient(to top, rgba(20,20,25,1) 0%, transparent 70%); }

    .game-info { padding: 1.5rem; display: flex; flex-direction: column; flex-grow: 1; }
    .game-title { font-size: 1.75rem; color: #fff; margin-bottom: 0.5rem; }
    .game-desc { color: var(--text-muted-color); line-height: 1.6; margin-bottom: 1.5rem; flex-grow: 1; }
    .play-indicator {
        display: block; text-align: right;
        color: var(--cyber-yellow); font-weight: bold;
        transition: letter-spacing 0.3s;
    }
    .game-card:hover .play-indicator { letter-spacing: 0.1em; }

    .guest-panel { text-align: center; padding: 4rem 2rem; background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem; z-index: 2; }
    .guest-text { margin-bottom: 1.5rem; font-size: 1.2rem; }
    .login-btn { display: inline-block; padding: 0.75rem 2rem; background: var(--cyber-yellow); color: #000; text-decoration: none; }
    .glitch { position: relative; }
    .glitch::before, .glitch::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
    .glitch::before { text-shadow: -2px 0 #ff00c1; left: 2px; animation: glitch-text 2s infinite linear alternate-reverse; }
    .glitch::after { text-shadow: 2px 0 var(--cyber-cyan); left: -2px; animation: glitch-text 2s 0.2s infinite linear alternate-reverse; }

    @media (max-width: 920px) {
        .games-grid {
            grid-template-columns: 1fr;
            max-width: 450px;
        }
    }

    @media (max-width: 768px) {
        .title { font-size: 3rem; }
        .user-panel {
            flex-direction: column;
            gap: 1.5rem;
            align-items: stretch;
            text-align: center;
        }
        .actions-group {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
        }
        .panel-btn { font-size: 0.9rem; padding: 0.8rem; }
    }
</style>