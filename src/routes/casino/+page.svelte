<script lang="ts">
    import { userStore } from '$lib/stores';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { fade, slide } from 'svelte/transition';
    import { Howl } from 'howler';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';

    let loadingBonus = false;
    let loadingLeaderboard = true;

    type LeaderboardEntry = {
        username: string;
        avatar_url: string;
        casino_credits: number;
        equipped_frame: string | null;
    };

    let leaderboard: LeaderboardEntry[] = [];
    $: isVerified = $userStore.user?.emailVerified ?? false;

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, {
        duration: 700,
        easing: quintOut
    });
    $: if ($userStore.user) {
        displayedCredits.set($userStore.user.casino_credits);
    }

    let sounds: { [key: string]: Howl } = {};

    const translate = (key: string) => get(t)(key);

    $: currentStreak = $userStore.user?.daily_streak || 0;

    $: lastBonusTime = $userStore.user?.last_daily_bonus ? new Date($userStore.user.last_daily_bonus).getTime() : 0;
    $: hoursSinceLast = lastBonusTime > 0 ? (Date.now() - lastBonusTime) / (1000 * 60 * 60) : 0;

    $: isAvailable = lastBonusTime === 0 || hoursSinceLast >= 20;
    $: isReset = lastBonusTime > 0 && hoursSinceLast > 48 && currentStreak > 0;

    $: nextDayIndex = isReset ? 1 : (currentStreak >= 30 ? 1 : currentStreak + 1);

    function getRewardAmount(day: number) {
        if (day === 30) return 1000;
        if (day % 5 === 0) return 250;
        return 50 + (Math.floor((day - 1) / 5) * 10);
    }

    function getWaitTimeStr(hoursPassed: number) {
        const totalHoursCooldown = 20;
        const hoursRemaining = totalHoursCooldown - hoursPassed;

        if (hoursRemaining <= 0) return translate('casino.status_ready');

        const h = Math.floor(hoursRemaining);
        const m = Math.floor((hoursRemaining - h) * 60);

        const hStr = translate('casino.time_h');
        const mStr = translate('casino.time_m');

        if (h > 0) {
            return `${h}${hStr} ${m}${mStr}`;
        } else {
            return `${m} ${mStr}`;
        }
    }

    onMount(() => {
        sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.3, autoplay: true });
        loadLeaderboard();
        return () => {
            sounds.ambient?.stop();
        };
    });

    async function loadLeaderboard() {
        loadingLeaderboard = true;
        try {
            const functions = getFunctions();
            const getLeaderboardFunc = httpsCallable(functions, 'getLeaderboard');
            const result = await getLeaderboardFunc();
            leaderboard = (result.data as any).data;
        } catch (error) {
            console.error(error);
        } finally {
            loadingLeaderboard = false;
        }
    }

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
                    store.user.daily_streak = data.streak;
                    if (data.special_reward) {
                        store.user.owned_items = [...(store.user.owned_items || []), data.special_reward];
                    }
                }
                return store;
            });

            modal.success(translate('casino.bonus_success'), data.message);
            loadLeaderboard();

        } catch (error: any) {
            if (error.message && error.message.includes('Ждите')) {
                 modal.info("Cooldown", error.message);
            } else {
                 modal.error(translate('ui.error'), error.message || "Error claiming bonus.");
            }
        } finally {
            loadingBonus = false;
        }
    }
</script>

<svelte:head>
    <title>{$t('nav.casino')} | ProtoMap</title>
</svelte:head>

<div class="page-container">
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <div class="header">
        <h1 class="title font-display glitch" data-text={$t('nav.casino')}>{$t('nav.casino')}</h1>
        <p class="subtitle">//: {$t('news_page.subtitle')}</p>
    </div>

    {#if $userStore.user}
        <div class="user-panel">
            <div class="balance-display">
                <span class="label font-display">{$t('casino.balance')}</span>
                <span class="amount font-display">{Math.floor($displayedCredits)} PC</span>
            </div>

            <div class="actions-group">
                <a href="/casino/shop" class="panel-btn shop">{$t('casino.shop')}</a>
                <a href="/casino/inventory" class="panel-btn inventory">{$t('casino.inventory')}</a>
            </div>
        </div>

        <div class="calendar-wrapper">
            <div class="calendar-header">
                <h3 class="cal-title">{$t('casino.calendar_title')}</h3>
                {#if isReset}
                    <span class="status-badge reset">{$t('casino.status_reset')}</span>
                {:else if !isAvailable}
                    <span class="status-badge wait">{$t('casino.status_wait')} {getWaitTimeStr(hoursSinceLast)}</span>
                {:else}
                    <span class="status-badge ready">{$t('casino.status_ready')}</span>
                {/if}
            </div>

            <div class="calendar-grid">
                {#each Array(30) as _, i}
                    {@const dayNum = i + 1}
                    {@const amount = getRewardAmount(dayNum)}
                    {@const isClaimed = !isReset && dayNum <= currentStreak}
                    {@const isActive = dayNum === nextDayIndex}
                    {@const hasFrame = $userStore.user.owned_items?.includes('frame_ludoman')}

                    <button
                        class="day-cell"
                        class:claimed={isClaimed}
                        class:active={isActive}
                        class:big-reward={dayNum === 30}
                        class:milestone={dayNum % 5 === 0 && dayNum !== 30}
                        disabled={dayNum !== nextDayIndex || !isAvailable || loadingBonus}
                        on:click={() => { if (dayNum === nextDayIndex) claimDailyBonus(); }}
                    >
                        <div class="day-num">{$t('casino.day_short')} {dayNum}</div>

                        {#if isClaimed}
                            <div class="check-icon">✔</div>
                        {:else}
                            {#if dayNum !== 30}
                                <div class="reward-val">{amount}</div>
                            {:else}
                                <div class="final-reward-content" class:only-credits={hasFrame}>
                                    <div class="reward-text">
                                        <div class="val">{amount} PC</div>
                                        {#if !hasFrame}
                                            <div class="label">TRUE GAMBLER</div>
                                        {:else}
                                            <div class="label">JACKPOT</div>
                                        {/if}
                                    </div>
                                    {#if !hasFrame}
                                        <div class="reward-visual">
                                            <div class="avatar-wrapper-popup frame_ludoman" style="transform: scale(1.3);">
                                                <img
                                                    src={$userStore.user.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$userStore.user.username}`}
                                                    alt="Reward Preview"
                                                    class="popup-avatar"
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        {/if}

                        {#if isActive && isAvailable}
                            <div class="pulse-border"></div>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>

        <div class="games-grid">
            <a href="/casino/coin-flip" class="game-card">
                <div class="game-art">
                    <img src="/casino/OaR.png" alt="Coin Flip" class="art-img">
                    <div class="art-overlay"></div>
                </div>
                <div class="game-info">
                    <h3 class="game-title font-display">{$t('casino.game_coin_title')}</h3>
                    <p class="game-desc">{$t('casino.game_coin_desc')}</p>
                    <span class="play-indicator font-display">{$t('casino.play')}</span>
                </div>
            </a>

            <a href="/casino/slot-machine" class="game-card">
                <div class="game-art">
                     <img src="/casino/slots.png" alt="Slots" class="art-img">
                     <div class="art-overlay"></div>
                </div>
                <div class="game-info">
                    <h3 class="game-title font-display">{$t('casino.game_slots_title')}</h3>
                    <p class="game-desc">{$t('casino.game_slots_desc')}</p>
                    <span class="play-indicator font-display">{$t('casino.play')}</span>
                </div>
            </a>
        </div>

        <div class="leaderboard-section mt-12 max-w-3xl w-full mx-auto">
            <div class="leaderboard-header">
                <h2 class="font-display text-2xl text-cyber-yellow">{$t('casino.leaderboard_title')}</h2>
                <button class="refresh-btn" on:click={loadLeaderboard} disabled={loadingLeaderboard} title="Refresh">
                    <svg class:animate-spin={loadingLeaderboard} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                </button>
            </div>

            <div class="leaderboard-list cyber-panel">
                {#if loadingLeaderboard && leaderboard.length === 0}
                    <div class="p-8 text-center text-gray-500 animate-pulse">
                        {$t('casino.leaderboard_loading')}
                    </div>
                {:else}
                    {#each leaderboard as player, i (player.username)}
                        <div class="leader-row" class:top-1={i===0} class:top-2={i===1} class:top-3={i===2} transition:slide|local>
                            <div class="rank font-display">#{i + 1}</div>

                            <div class="player-info">
                                <div class="avatar-wrapper-popup {player.equipped_frame || ''} mr-3">
                                    <img
                                        src={player.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${player.username}`}
                                        alt={player.username}
                                        class="popup-avatar"
                                    />
                                </div>
                                <a href="/profile/{player.username}" class="username hover:underline">{player.username}</a>
                            </div>

                            <div class="credits font-display">
                                {player.casino_credits.toLocaleString()} PC
                            </div>
                        </div>
                    {/each}
                    {#if leaderboard.length === 0 && !loadingLeaderboard}
                         <div class="p-8 text-center text-gray-500">{$t('casino.leaderboard_empty')}</div>
                    {/if}
                {/if}
            </div>
        </div>

    {:else}
        <div class="guest-panel" in:fade>
            <p class="guest-text">{$t('casino.guest_text')}</p>
            <a href="/login" class="login-btn font-display">{$t('casino.guest_btn')}</a>
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
    @keyframes pulse-border-anim {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.1); }
    }
    @keyframes pulse-green { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

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
        display: flex; justify-content: space-between; align-items: flex-start;
        background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem;
        padding: 1rem 1.5rem; margin-bottom: 3rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); z-index: 2;
        gap: 1rem;
    }
    .balance-display { font-size: 1.5rem; flex-shrink: 0; margin-top: 0.5rem; }
    .balance-display .label { color: var(--text-muted-color); margin-right: 0.5rem; }
    .balance-display .amount { color: var(--cyber-yellow); letter-spacing: 0.1em; }

    .actions-group { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: flex-end; width: 100%; }
    .panel-btn {
        padding: 0.75rem 1.5rem;
        font-family: 'Chakra Petch', monospace;
        font-weight: bold;
        color: rgba(255, 255, 255, 0.8); text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none; text-align: center;
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 0.75rem;
        box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease-in-out; white-space: nowrap;
        height: fit-content;
    }
    .panel-btn:hover:not(:disabled) { color: #fff; transform: translateY(-2px); }
    .panel-btn:active:not(:disabled) { transform: translateY(1px); box-shadow: inset 2px 2px 5px rgba(0,0,0,0.5); }
    .panel-btn.shop:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-yellow); }
    .panel-btn.inventory:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-cyan); }
    .panel-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

    .calendar-wrapper {
        width: 100%; max-width: 900px;
        background: rgba(10, 15, 20, 0.8);
        border: 1px solid rgba(0, 243, 255, 0.2);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 2rem;
        position: relative; z-index: 5;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }

    .calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .cal-title { font-family: 'Chakra Petch', monospace; font-weight: bold; color: #fff; letter-spacing: 0.1em; }

    .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-family: 'Inter', sans-serif; }
    .status-badge.ready { background: rgba(57, 255, 20, 0.2); color: #39ff14; border: 1px solid #39ff14; animation: pulse-green 2s infinite; }
    .status-badge.wait { background: rgba(255, 255, 255, 0.1); color: #aaa; border: 1px solid #555; }
    .status-badge.reset { background: rgba(255, 0, 60, 0.2); color: #ff003c; border: 1px solid #ff003c; }

    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 0.5rem;
    }

    .day-cell {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        height: 70px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        position: relative;
        transition: all 0.2s;
        cursor: default;
        overflow: hidden;
    }

    .day-num { font-size: 0.6rem; color: #555; position: absolute; top: 4px; left: 6px; font-family: 'Chakra Petch', monospace; z-index: 20; }
    .reward-val { font-size: 0.9rem; font-weight: bold; color: #ccc; }

    .day-cell.claimed {
        background: rgba(0, 243, 255, 0.1);
        border-color: rgba(0, 243, 255, 0.3);
        color: #00f3ff;
    }
    .check-icon { color: #00f3ff; font-size: 1.2rem; }

    .day-cell.active {
        background: rgba(255,255,255,0.1);
        border-color: #fff;
        cursor: pointer;
    }
    .day-cell.active:hover { transform: translateY(-2px); background: rgba(255,255,255,0.15); }
    .day-cell.active .reward-val { color: #fff; }

    .day-cell:disabled { pointer-events: none; }
    .day-cell.active:not(:disabled) { cursor: pointer; pointer-events: auto; }

    .day-cell.milestone { border-color: var(--cyber-yellow); }
    .day-cell.milestone .reward-val { color: var(--cyber-yellow); }

    .day-cell.big-reward {
        grid-column: span 2;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.1), transparent);
        border: 1px solid #ffd700;
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 4px 8px; /* Добавили отступы для воздуха */
        justify-content: space-between;
    }

    .final-reward-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        height: 100%;
    }

    .final-reward-content.only-credits {
        justify-content: center;
        text-align: center;
    }

    .reward-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        z-index: 10;
        min-width: 0;
        padding-top: 8px; /* Чуть отодвинем текст от верхнего "DAY 30" */
    }

    .final-reward-content.only-credits .reward-text {
        align-items: center;
    }

    .reward-text .val {
        font-size: 0.9rem; /* Уменьшили */
        color: #ffd700;
        font-weight: 800;
        line-height: 1.1;
        text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
        white-space: nowrap;
    }

    .reward-text .label {
        font-size: 0.55rem; /* Уменьшили */
        font-weight: bold;
        color: #fff;
        margin-top: 2px;
    }

    .reward-visual {
        flex-shrink: 0;
        margin-left: 2px; /* Уменьшили отступ */
        z-index: 10;
    }

    .pulse-border {
        position: absolute; inset: -1px; border-radius: 6px;
        border: 2px solid #39ff14;
        animation: pulse-border-anim 1.5s infinite;
        pointer-events: none;
    }

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
    .game-card:hover { transform: translateY(-10px); --glow-color: var(--cyber-yellow); animation: card-hover-glow 0.5s forwards; }
    .game-card.disabled { pointer-events: none; filter: grayscale(0.8) brightness(0.5); }

    .game-art { height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
    .art-img { width: 100%; height: 100%; object-fit: cover; }
    .art-overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(to top, rgba(10,10,10,0.8) 0%, transparent 50%); transition: background 0.3s;
    }
    .game-card:hover .art-overlay { background: linear-gradient(to top, rgba(20,20,25,1) 0%, transparent 70%); }

    .game-info { padding: 1.5rem; display: flex; flex-direction: column; flex-grow: 1; }
    .game-title { font-size: 1.75rem; color: #fff; margin-bottom: 0.5rem; }
    .game-desc { color: var(--text-muted-color); line-height: 1.6; margin-bottom: 1.5rem; flex-grow: 1; }
    .play-indicator { display: block; text-align: right; color: var(--cyber-yellow); font-weight: bold; transition: letter-spacing 0.3s; }
    .game-card:hover .play-indicator { letter-spacing: 0.1em; }

    .guest-panel { text-align: center; padding: 4rem 2rem; background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem; z-index: 2; }
    .guest-text { margin-bottom: 1.5rem; font-size: 1.2rem; }
    .login-btn { display: inline-block; padding: 0.75rem 2rem; background: var(--cyber-yellow); color: #000; text-decoration: none; }
    .glitch { position: relative; }
    .glitch::before, .glitch::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
    .glitch::before { text-shadow: -2px 0 #ff00c1; left: 2px; animation: glitch-text 2s infinite linear alternate-reverse; }
    .glitch::after { text-shadow: 2px 0 var(--cyber-cyan); left: -2px; animation: glitch-text 2s 0.2s infinite linear alternate-reverse; }

    .leaderboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .refresh-btn { color: var(--text-muted-color); transition: color 0.2s; }
    .refresh-btn:hover { color: #fff; }

    .leaderboard-list {
        background: rgba(10, 10, 15, 0.6) !important;
        max-height: 500px;
        overflow-y: auto;
        border-radius: 0.5rem;
    }

    .leader-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        transition: background 0.2s;
    }
    .leader-row:hover { background: rgba(255,255,255,0.05); }

    .rank { width: 40px; font-size: 1.2rem; color: #666; font-weight: bold; }
    .player-info { display: flex; align-items: center; flex-grow: 1; }
    .username { color: #eee; font-weight: 500; }
    .credits { color: var(--cyber-cyan); font-weight: bold; }

    .top-1 .rank { color: #ffd700; text-shadow: 0 0 10px #ffd700; font-size: 1.5rem; }
    .top-1 .username { color: #ffd700; }
    .top-1 .popup-avatar { border: 2px solid #ffd700; }

    .top-2 .rank { color: #c0c0c0; text-shadow: 0 0 8px #c0c0c0; font-size: 1.4rem; }
    .top-2 .username { color: #c0c0c0; }

    .top-3 .rank { color: #cd7f32; text-shadow: 0 0 8px #cd7f32; font-size: 1.3rem; }
    .top-3 .username { color: #cd7f32; }

    @media (max-width: 920px) {
        .games-grid { grid-template-columns: 1fr; max-width: 450px; }
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
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.5rem;
        }
        .panel-btn {
            font-size: 0.8rem;
            padding: 0.6rem 0.5rem;
            flex: 1 1 auto;
            min-width: 90px;
        }
    }

    @media (max-width: 640px) {
        .calendar-grid { grid-template-columns: repeat(5, 1fr); }
        .day-cell { height: 60px; }
        .day-cell.big-reward { grid-column: span 5; }
    }
</style>