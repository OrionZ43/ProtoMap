<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';
    import { get } from 'svelte/store';
    import { httpsCallable } from 'firebase/functions';
    import { Howl } from 'howler';
    import { t, locale } from 'svelte-i18n';
    import { userStore } from '$lib/stores';
    import { modal } from '$lib/stores/modalStore';
    import { functions } from '$lib/firebase';
    import { renderMarkdown } from '$lib/utils/markdown';
    import { createPlinkoBoard, type PlinkoBoard } from '$lib/client/plinkoBoard';
    import {
        PLINKO_ROWS,
        PLINKO_PAYOUT_TENTHS,
        PLINKO_MIN_BET,
        PLINKO_MAX_BET_CAP,
        PLINKO_MAX_BALLS,
        PLINKO_PRIZE_SLOTS
    } from '$lib/games/plinko';
    import type { PageData } from './$types';

    export let data: PageData;

    type Drop = { path: number[]; slot: number; payout: number; prize?: boolean };
    type PlayResult = { drops: Drop[]; stake: number; win: number; newBalance: number; maxBet: number };

    const translate = (key: string, values?: Record<string, string | number>) => get(t)(key, { values });

    const BALL_OPTIONS = [1, 5, PLINKO_MAX_BALLS];
    const STAGGER_MS = 250; // шарики падают медленно — между ними нужен зазор побольше
    const HISTORY_SIZE = 14;

    const multiplierOf = (slot: number) => PLINKO_PAYOUT_TENTHS[slot] / 10;
    // Яркость лунки и фишки в истории: середина тусклая, края горят.
    const tierOf = (m: number) => (m < 1 ? 0 : m < 2 ? 1 : m < 5 ? 2 : m < 10 ? 3 : 4);

    let host: HTMLDivElement;
    let board: PlinkoBoard | null = null;
    let sounds: Record<string, Howl> = {};
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Лимит ставки зависит от банка, поэтому меняется, только когда долетел последний
    // шарик: иначе он раскрыл бы исход заранее. Если банк не прочитался, лимит проверит сервер.
    let maxBet: number | null = data.maxBet;
    let maxBetAfterFlight: number | null = null;
    $: limit = maxBet ?? PLINKO_MAX_BET_CAP;
    $: closed = maxBet !== null && maxBet < PLINKO_MIN_BET;

    let bet = PLINKO_MIN_BET;
    let balls = 1;
    let waiting = false; // ждём ответ сервера
    let airborne = 0; // шарики на доске и в очереди на запуск
    let history: { slot: number; key: number }[] = [];
    let historyKey = 0;
    let lastNet: number | null = null;

    $: nf = new Intl.NumberFormat($locale || 'ru', { maximumFractionDigits: 1 });
    $: stake = (bet || 0) * balls;
    $: if (bet > limit && limit >= PLINKO_MIN_BET) bet = limit;

    // Баланс на экране идёт за шариками: ставка списывается при броске, выигрыш —
    // когда шарик лёг в лунку. userStore получает новый баланс снимком сразу после
    // ответа сервера и раскрыл бы исход раньше, чем шарики долетят.
    $: storeBalance = $userStore.user?.casino_credits ?? 0;
    let shownBalance = 0;
    $: if (!waiting && airborne === 0) shownBalance = storeBalance;
    const displayed = tweened($userStore.user?.casino_credits ?? 0, { duration: 400, easing: cubicOut });
    $: displayed.set(shownBalance);

    function clampBet(value: number) {
        const v = Math.floor(Number(value));
        bet = Math.max(PLINKO_MIN_BET, Math.min(limit, Number.isFinite(v) ? v : PLINKO_MIN_BET));
    }

    onMount(() => {
        board = createPlinkoBoard(host, {
            rows: PLINKO_ROWS,
            labels: PLINKO_PAYOUT_TENTHS.map((m) => nf.format(m / 10)),
            tiers: PLINKO_PAYOUT_TENTHS.map((m) => tierOf(m / 10)),
            prizeSlots: prizeAvailable ? PLINKO_PRIZE_SLOTS : []
        });
        sounds = {
            drop: new Howl({ src: ['/sounds/click.mp3'], volume: 0.35 }),
            win: new Howl({ src: ['/sounds/coin_win.mp3'], volume: 0.6 }),
            big: new Howl({ src: ['/sounds/win2.mp3'], volume: 0.7 }),
            jackpot: new Howl({ src: ['/sounds/main_jackpot.mp3'], volume: 0.8 })
        };
    });

    onDestroy(() => {
        timers.forEach(clearTimeout);
        board?.destroy();
        Object.values(sounds).forEach((sound) => sound.unload());
    });

    async function dropBalls() {
        if (waiting || closed || !board || !$userStore.user) return;
        clampBet(bet);
        const perBall = bet;
        if (storeBalance < perBall * balls) {
            modal.error(translate('plinko.modal_poor_title'), translate('plinko.modal_poor_text'));
            return;
        }

        waiting = true;
        sounds.drop?.play();
        try {
            const play = httpsCallable(functions, 'playPlinko');
            const response = await play({ bet: perBall, balls });
            const result = (response.data as { data: PlayResult }).data;

            shownBalance -= result.stake;
            maxBetAfterFlight = result.maxBet;
            airborne += result.drops.length;
            let left = result.drops.length;
            result.drops.forEach((drop, i) => {
                const timer = setTimeout(() => {
                    launch(drop, perBall, () => {
                        left -= 1;
                        if (left === 0) lastNet = result.win - result.stake;
                    });
                }, i * STAGGER_MS);
                timers.push(timer);
            });
        } catch (error: any) {
            modal.error(translate('plinko.modal_error_title'), error?.message || 'Connection error.');
        } finally {
            waiting = false;
        }
    }

    // Приз ивента (Тыквенная рамка) виден, пока он не выигран; выдаёт его сервер
    let prizeAvailable: boolean = data.prizeAvailable;

    function launch(drop: Drop, perBall: number, done: () => void) {
        const m = multiplierOf(drop.slot);
        board?.drop(drop.path, { text: `+${drop.payout}`, win: drop.payout > perBall }, () => {
            shownBalance += drop.payout;
            history = [{ slot: drop.slot, key: historyKey++ }, ...history].slice(0, HISTORY_SIZE);
            if (m >= 50) sounds.jackpot?.play();
            else if (m >= 12) sounds.big?.play();
            else if (drop.payout > perBall) sounds.win?.play();
            if (drop.prize) {
                prizeAvailable = false;
                board?.setPrizeSlots([]);
                sounds.jackpot?.play();
                modal.success(translate('plinko.prize_title'), translate('plinko.prize_text'));
            }
            done();
            airborne -= 1;
            if (airborne === 0 && maxBetAfterFlight !== null) {
                maxBet = maxBetAfterFlight;
                maxBetAfterFlight = null;
            }
        });
    }
</script>

<svelte:head>
    <title>{$t('plinko.title')} | The Glitch Pit</title>
</svelte:head>

<div class="plinko-page">
    <header class="plinko-head">
        <h1 class="plinko-title">{$t('plinko.title')}</h1>
        {#if closed}
            <p class="bank-line closed">{$t('plinko.bank_closed')}</p>
        {:else if maxBet !== null}
            <p class="bank-line">{$t('plinko.max_bet', { values: { max: maxBet } })}</p>
        {/if}
    </header>

    <div class="board-panel" role="img" aria-label={$t('plinko.board_label')}>
        <div bind:this={host}></div>
    </div>

    <div class="history" aria-label={$t('plinko.history_label')}>
        {#each history as item (item.key)}
            <span class="chip tier-{tierOf(multiplierOf(item.slot))}">×{nf.format(multiplierOf(item.slot))}</span>
        {:else}
            <span class="history-empty">{$t('plinko.history_empty')}</span>
        {/each}
    </div>

    {#if prizeAvailable}
        <p class="prize-hint">{$t('plinko.prize_hint')}</p>
    {/if}

    <div class="controls">
        <div class="balance">
            <span class="label">{$t('ui.balance')}</span>
            <span class="value">{nf.format(Math.floor($displayed))} PC</span>
            <span class="net" aria-live="polite">
                {#if lastNet !== null}
                    <span class:plus={lastNet > 0}>{lastNet > 0 ? '+' : ''}{nf.format(lastNet)} PC</span>
                {/if}
            </span>
        </div>

        <div class="field">
            <label class="label" for="plinko-bet">{$t('plinko.bet_label')}</label>
            <div class="stepper">
                <button type="button" on:click={() => clampBet(bet - 10)} disabled={waiting} aria-label={$t('plinko.bet_down')}>−</button>
                <input
                    id="plinko-bet"
                    type="number"
                    inputmode="numeric"
                    min={PLINKO_MIN_BET}
                    max={limit}
                    step="1"
                    bind:value={bet}
                    on:change={() => clampBet(bet)}
                    disabled={waiting}
                />
                <button type="button" on:click={() => clampBet(bet + 10)} disabled={waiting} aria-label={$t('plinko.bet_up')}>+</button>
            </div>
        </div>

        <div class="field">
            <span class="label" id="plinko-balls">{$t('plinko.balls_label')}</span>
            <div class="segmented" role="group" aria-labelledby="plinko-balls">
                {#each BALL_OPTIONS as option}
                    <button type="button" class:active={balls === option} aria-pressed={balls === option} on:click={() => (balls = option)}>
                        {option}
                    </button>
                {/each}
            </div>
        </div>

        <button class="drop-btn" on:click={dropBalls} disabled={waiting || closed || !$userStore.user}>
            <span>{$t('plinko.drop')}</span>
            <small>{$t('plinko.stake_label')}: {nf.format(stake)} PC</small>
        </button>
    </div>

    <details class="rules">
        <summary>{$t('plinko.mechanics_title')}</summary>
        <div class="rules-body">{@html renderMarkdown($t('plinko.mechanics_text'))}</div>
    </details>
</div>

<style>
    .plinko-page {
        max-width: 720px;
        margin: 0 auto;
        padding: 1.5rem 1rem 3rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .plinko-head { text-align: center; }
    .plinko-title {
        font-family: var(--font-display);
        font-weight: 400;
        font-size: 2rem;
        color: var(--cyber-yellow);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin: 0;
    }
    .bank-line {
        margin: 0.4rem 0 0;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 0.4rem;
        color: #9a9aa6;
        font-size: 0.9rem;
    }
    .bank-line.closed { color: var(--cyber-red); }

    .board-panel {
        background:
            radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--cyber-yellow) 7%, transparent), transparent 60%),
            #0b0b0f;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 1rem;
        padding: 0.75rem 0.5rem 0.5rem;
    }

    .history {
        display: flex;
        gap: 0.35rem;
        min-height: 1.75rem;
        overflow: hidden;
        align-items: center;
    }
    .chip {
        flex: none;
        font: 700 0.75rem var(--font-tech);
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        background: #16161b;
        color: #8b8b96;
        border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .chip.tier-1 { color: #f2f2f6; border-color: color-mix(in srgb, var(--cyber-yellow) 35%, transparent); }
    .chip.tier-2 { color: var(--cyber-yellow); border-color: color-mix(in srgb, var(--cyber-yellow) 85%, transparent); }
    .chip.tier-3,
    .chip.tier-4 { color: #0b0b0f; background: var(--cyber-yellow); }
    .history-empty { color: #66666f; font-size: 0.85rem; }
    .prize-hint {
        margin: -0.25rem 0 0;
        padding: 0.5rem 0.85rem;
        border-left: 2px solid var(--cyber-yellow);
        background: rgb(var(--cyber-yellow-rgb) / 0.08);
        color: #e8dccf;
        font-size: 0.9rem;
    }

    .controls {
        display: grid;
        grid-template-columns: auto auto auto 1fr;
        align-items: end;
        gap: 1rem 1.5rem;
        padding: 1rem 1.25rem;
        background: rgba(10, 10, 10, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
    }
    .label {
        display: block;
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.35rem;
    }
    .balance .value { display: block; font: 700 1.5rem var(--font-tech); color: #fff; }
    .net { display: block; min-height: 1.1rem; font: 600 0.85rem var(--font-tech); color: #9a9aa6; }
    .net .plus { color: var(--cyber-yellow); }

    .stepper { display: flex; align-items: center; gap: 0.35rem; }
    .stepper button {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 50%;
        border: 1px solid #444;
        background: transparent;
        color: #aaa;
        font-size: 1.2rem;
        cursor: pointer;
    }
    .stepper button:hover:not(:disabled) { background: #333; color: #fff; }
    .stepper button:disabled { opacity: 0.4; }
    .stepper input {
        width: 4.5rem;
        padding: 0.45rem;
        text-align: center;
        font: 700 1.1rem var(--font-tech);
        color: #fff;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid #444;
        border-radius: 0.4rem;
    }
    .stepper input:focus { outline: none; border-color: var(--cyber-yellow); }

    .segmented { display: inline-flex; border: 1px solid #444; border-radius: 0.5rem; overflow: hidden; }
    .segmented button {
        padding: 0.45rem 0.85rem;
        background: transparent;
        color: #aaa;
        font: 700 1rem var(--font-tech);
        border: 0;
        cursor: pointer;
    }
    .segmented button + button { border-left: 1px solid #444; }
    .segmented button.active { background: var(--cyber-yellow); color: #000; }

    .drop-btn {
        justify-self: end;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.65rem 2.25rem;
        background: var(--cyber-yellow);
        color: #000;
        border: 0;
        border-radius: 0.6rem;
        font: 400 1.25rem var(--font-display);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
    }
    .drop-btn small { font: 600 0.7rem var(--font-body); letter-spacing: 0; text-transform: none; opacity: 0.75; }
    .drop-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 0 18px color-mix(in srgb, var(--cyber-yellow) 45%, transparent);
    }
    .drop-btn:disabled { opacity: 0.5; cursor: wait; }

    .rules {
        background: rgba(10, 10, 10, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.75rem;
        padding: 0.75rem 1rem;
        color: #c8c8d0;
        font-size: 0.9rem;
        line-height: 1.55;
    }
    .rules summary {
        cursor: pointer;
        font: 400 0.85rem var(--font-display);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--cyber-yellow);
    }
    .rules-body :global(p) { margin: 0.5rem 0; }
    .rules-body :global(strong) { color: #fff; }

    @media (max-width: 640px) {
        .plinko-page { padding: 1rem 0.5rem 2rem; }
        .plinko-title { font-size: 1.5rem; }
        .controls { grid-template-columns: 1fr 1fr; padding: 1rem; }
        .balance { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 0.75rem; }
        .balance .label { margin: 0; }
        .drop-btn { grid-column: 1 / -1; justify-self: stretch; }
    }
</style>
