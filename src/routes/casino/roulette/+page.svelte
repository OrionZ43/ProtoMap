<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { userStore } from '$lib/stores';
    import { functions } from '$lib/firebase';
    import { httpsCallable } from 'firebase/functions';
    import { rouletteStore, subscribeToGame, unsubscribeFromGame } from '$lib/stores/rouletteStore';
    import { ITEMS_META } from '$lib/types/roulette';

    let loading = false;
    let error = '';
    let isGameActive = false;

    const startRouletteCall = httpsCallable(functions, 'startRoulette');
    const makeActionCall = httpsCallable(functions, 'makeRouletteAction');
    const abandonCall = httpsCallable(functions, 'abandonRoulette');

    onMount(() => {
        // If we want to reconnect, we could check if user has a game, but
        // to simplify, game is created on Start and abandoned on destroy.
    });

    onDestroy(() => {
        if (isGameActive && $rouletteStore && $rouletteStore.st !== 'result') {
            abandonCall().catch(console.error);
        }
        unsubscribeFromGame();
    });

    async function startGame() {
        if (!$userStore) return;
        loading = true;
        error = '';
        try {
            const res = await startRouletteCall();
            const data = res.data as { gameId: string };
            subscribeToGame(data.gameId);
            isGameActive = true;
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            loading = false;
        }
    }

    async function makeAction(action: string, itemIndex?: number) {
        if (loading || !$rouletteStore || $rouletteStore.turn !== 'player') return;
        loading = true;
        error = '';
        try {
            await makeActionCall({ action, itemIndex });
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            loading = false;
        }
    }

    async function leaveGame() {
        if ($rouletteStore && $rouletteStore.st !== 'result') {
            await abandonCall();
        }
        isGameActive = false;
        unsubscribeFromGame();
    }

    // Orion face calculation
    $: orionHpPercent = $rouletteStore ? ($rouletteStore.ohp / $rouletteStore.mhp) : 1;
    $: orionColor = orionHpPercent > 0.6 ? 'text-cyan-400' : (orionHpPercent > 0.3 ? 'text-yellow-400' : 'text-red-500');

</script>

<svelte:head>
    <title>The Glitch Pit - Volt Deadlock</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 text-white font-mono p-4 flex flex-col items-center justify-center">
    {#if error}
        <div class="bg-red-900/50 border border-red-500 text-red-200 p-3 mb-4 rounded w-full max-w-2xl text-center">
            {error}
            <button class="ml-4 text-white underline hover:text-red-300" on:click={() => error = ''}>✕</button>
        </div>
    {/if}

    {#if !isGameActive || !$rouletteStore}
        <!-- LOBBY -->
        <div class="max-w-xl w-full bg-gray-800 p-8 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)] text-center">
            <h1 class="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                VOLT DEADLOCK
            </h1>
            <p class="text-gray-400 mb-6">Киберпанк-рулетка с плазмоганом.</p>
            <div class="mb-8 text-left bg-gray-900 p-4 rounded text-sm text-gray-300 space-y-2 border border-gray-700">
                <p><span class="text-red-400 font-bold">Ставка:</span> 500 PC</p>
                <p><span class="text-green-400 font-bold">Выигрыш:</span> 1000 PC</p>
                <p>Сразитесь с ИИ дилером Орионом. Используйте предметы, чтобы выжить.</p>
            </div>

            <button
                class="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                on:click={startGame}
                disabled={loading || !$userStore}
            >
                {loading ? 'ПОДКЛЮЧЕНИЕ...' : 'ИГРАТЬ (500 PC)'}
            </button>
            {#if !$userStore}
                <p class="mt-4 text-red-400 text-sm">Требуется авторизация</p>
            {/if}
        </div>

    {:else}
        <!-- PLAYING / RESULT -->
        <div class="max-w-4xl w-full flex flex-col gap-6">

            <!-- HEADER -->
            <div class="flex justify-between items-center bg-gray-800 p-4 rounded border border-gray-700">
                <h2 class="text-xl font-bold text-cyan-400">VOLT DEADLOCK</h2>
                <button class="text-red-400 hover:text-red-300 text-sm font-bold" on:click={leaveGame}>ПОКИНУТЬ СТОЛ</button>
            </div>

            <!-- ORION BLOCK -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center relative overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <div class="absolute inset-0 bg-gradient-to-b from-transparent to-red-900/10 pointer-events-none"></div>
                <h3 class="text-lg text-gray-400 font-bold mb-2">ДИЛЕР: ОРИОН</h3>

                <div class={`text-6xl mb-4 transition-colors ${orionColor}`}>
                    {#if $rouletteStore.ohp <= 0}
                        💀
                    {:else if $rouletteStore.ohp < $rouletteStore.mhp / 2}
                        🤖💢
                    {:else}
                        🤖
                    {/if}
                </div>

                <div class="flex gap-1 mb-2">
                    {#each Array($rouletteStore.mhp) as _, i}
                        <div class={`h-3 w-8 rounded ${i < $rouletteStore.ohp ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 'bg-gray-700'}`}></div>
                    {/each}
                </div>
                <div class="text-sm text-gray-500 mb-4">HP: {$rouletteStore.ohp} / {$rouletteStore.mhp}</div>

                <div class="flex gap-2 opacity-70">
                    {#each $rouletteStore.oit as item}
                        <div class="w-8 h-8 flex items-center justify-center bg-gray-900 border border-gray-600 rounded text-xs" title="Скрытый предмет">📦</div>
                    {/each}
                </div>
                {#if $rouletteStore.turn === 'orion' && $rouletteStore.st === 'playing'}
                    <div class="mt-4 text-red-400 animate-pulse text-sm font-bold">ОРИОН ДУМАЕТ...</div>
                {/if}
            </div>

            <!-- TABLE BLOCK -->
            <div class="bg-gray-900 p-6 rounded-xl border-t-2 border-b-2 border-cyan-800 flex flex-col items-center">
                <div class="text-3xl mb-4">🔫</div>
                <div class="text-cyan-300 font-bold mb-2">ОСТАЛОСЬ ПАТРОНОВ: {$rouletteStore.sl}</div>

                <div class="w-full max-w-lg mt-4 bg-black/50 rounded p-4 border border-gray-800 h-48 overflow-y-auto flex flex-col-reverse text-sm">
                    {#each [...$rouletteStore.log].reverse() as logEntry, i}
                        <div class={`mb-1 ${i === 0 ? 'text-white font-bold' : 'text-gray-500'}`}>
                            > {logEntry}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- PLAYER BLOCK -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 relative shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h3 class="text-lg text-cyan-400 font-bold mb-2">ВЫ (HP: {$rouletteStore.php} / {$rouletteStore.mhp})</h3>
                        <div class="flex gap-1">
                            {#each Array($rouletteStore.mhp) as _, i}
                                <div class={`h-3 w-8 rounded ${i < $rouletteStore.php ? 'bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'bg-gray-700'}`}></div>
                            {/each}
                        </div>
                    </div>

                    {#if $rouletteStore.scan}
                        <div class="bg-gray-900 border border-blue-500/50 p-2 rounded text-xs text-blue-300 text-right">
                            <div class="text-[10px] text-gray-500">СКАНЕР РЕЗУЛЬТАТ:</div>
                            <div class="font-bold text-sm">{$rouletteStore.scan === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}</div>
                        </div>
                    {/if}
                </div>

                <!-- ITEMS -->
                <div class="mb-6">
                    <div class="text-xs text-gray-500 mb-2">ПРЕДМЕТЫ</div>
                    <div class="flex flex-wrap gap-2">
                        {#each $rouletteStore.pit as itemCode, i}
                            {@const meta = ITEMS_META[itemCode]}
                            <button
                                class="w-12 h-12 flex flex-col items-center justify-center bg-gray-900 border border-gray-600 rounded hover:border-cyan-400 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group relative"
                                on:click={() => makeAction('item', i)}
                                disabled={$rouletteStore.turn !== 'player' || $rouletteStore.st !== 'playing' || loading}
                            >
                                <span class="text-xl">{meta.icon}</span>
                                <!-- Tooltip -->
                                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black text-xs border border-gray-600 rounded opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                                    <span class={`font-bold ${meta.color}`}>{meta.name}</span><br>
                                    <span class="text-gray-400">{meta.desc}</span>
                                </div>
                            </button>
                        {/each}
                        {#if $rouletteStore.pit.length === 0}
                            <div class="text-gray-600 text-sm italic">Пусто</div>
                        {/if}
                    </div>
                </div>

                <!-- ACTION BUTTONS -->
                {#if $rouletteStore.st === 'playing'}
                    <div class="flex gap-4">
                        <button
                            class="flex-1 py-4 bg-gray-700 hover:bg-gray-600 border border-gray-500 rounded-lg text-white font-bold disabled:opacity-50 transition-colors"
                            on:click={() => makeAction('shoot_self')}
                            disabled={$rouletteStore.turn !== 'player' || loading}
                        >
                            ВЫСТРЕЛ В СЕБЯ
                        </button>
                        <button
                            class="flex-1 py-4 bg-red-900 hover:bg-red-800 border border-red-700 rounded-lg text-white font-bold disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                            on:click={() => makeAction('shoot_enemy')}
                            disabled={$rouletteStore.turn !== 'player' || loading}
                        >
                            ВЫСТРЕЛ В ОРИОНА
                        </button>
                    </div>
                {:else}
                    <div class="text-center py-6 border-t border-gray-700 mt-4">
                        <h2 class={`text-3xl font-bold mb-4 ${$rouletteStore.php > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {$rouletteStore.php > 0 ? 'ВЫ ПОБЕДИЛИ!' : 'ВЫ ПРОИГРАЛИ!'}
                        </h2>
                        <button
                            class="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg"
                            on:click={leaveGame}
                        >
                            ЗАКРЫТЬ
                        </button>
                    </div>
                {/if}
            </div>

        </div>
    {/if}
</div>
