<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { getApp } from 'firebase/app';
	import { getFunctions, httpsCallable } from 'firebase/functions';
	import {
		rouletteState,
		rouletteLoading,
		rouletteGameId,
		subscribeToGame,
		unsubscribeFromGame,
		getCurrentGameId
	} from '$lib/stores/rouletteStore';
	import { userStore } from '$lib/stores';
	import type { Items } from '$lib/types/roulette';
	import { ITEM_META } from '$lib/types/roulette';
	import { browser } from '$app/environment';

	/* ── Cloud Functions ────────────────────────────────── */
	const fns         = getFunctions(getApp(), 'us-central1');
	const startFn     = httpsCallable(fns, 'startRoulette');
	const actionFn    = httpsCallable(fns, 'makeRouletteAction');
	const abandonFn   = httpsCallable(fns, 'abandonRoulette');

	/* ── UI state ────────────────────────────────────────── */
	let phase: 'lobby' | 'playing' | 'result' = 'lobby';
	let resultWon   = false;
	let isStarting  = false;
	let isActing    = false;
	let errorMsg    = '';
	let logHistory: string[] = [];
	let logEl: HTMLElement;

	/* ── Реактивные данные из RTDB store ─────────────────── */
	$: gs        = $rouletteState;
	$: isMyTurn  = gs?.turn === 'p' && gs?.st === 'a';
	$: orionEmo  = gs ? getOrionEmotion(gs.ohp, gs.mhp) : null;

	/* ── Следим за логом и добавляем в историю ─────────── */
	$: if (gs?.log) {
		addLog(gs.log);
	}

	/* ── Если стейт пропал (игра завершена на бэке) ─────── */
	$: if (phase === 'playing' && gs === null && !$rouletteLoading) {
		// onValue вернул null — бэкенд удалил узел
		// Значит игра завершена внешне (например, дубль)
		phase = 'lobby';
	}

	/* ─────────────────────────────────────────────────────── */

	function addLog(entry: string) {
		// Разбиваем составной лог (может содержать " | ")
		const parts = entry.split(' | ').map(p => p.trim()).filter(Boolean);
		logHistory = [...logHistory, ...parts].slice(-20); // хранить макс 20 записей
		tick().then(() => {
			if (logEl) logEl.scrollTop = logEl.scrollHeight;
		});
	}

	function getOrionEmotion(ohp: number, mhp: number): { label: string; face: string; color: string } {
		const pct = ohp / mhp;
		if (pct > 0.75) return { label: 'DOMINANT',    face: '◉◉', color: '#00f0ff' };
		if (pct > 0.50) return { label: 'CALCULATING', face: '◐◑', color: '#fcee0a' };
		if (pct > 0.25) return { label: 'PRESSURED',   face: '◌◌', color: '#ff6a00' };
		return                 { label: 'CRITICAL',     face: '✕✕', color: '#ff003c' };
	}

	function hpDots(current: number, max: number, color: string): string {
		// возвращаем dots как строку для рендера
		return ''; // используется в шаблоне напрямую
	}

	/* ── ACTIONS ─────────────────────────────────────────── */

	async function startGame() {
		if (isStarting) return;
		isStarting = true;
		errorMsg   = '';
		logHistory = [];
		try {
			const res   = await startFn({});
			const data  = res.data as { gameId: string };
			subscribeToGame(data.gameId);
			phase = 'playing';
		} catch (e: any) {
			errorMsg = e?.message ?? 'Неизвестная ошибка';
		} finally {
			isStarting = false;
		}
	}

	async function doAction(action: string) {
		const gid = getCurrentGameId();
		if (!gid || isActing || !isMyTurn) return;
		isActing = true;
		errorMsg = '';
		try {
			const res  = await actionFn({ gameId: gid, action });
			const data = res.data as { st: string };

			if (data.st !== 'a') {
				// Игра завершена
				resultWon = data.st === 'p';
				phase     = 'result';
				unsubscribeFromGame();
				// Авто-возврат в лобби через 4 сек
				setTimeout(() => { phase = 'lobby'; }, 4000);
			}
		} catch (e: any) {
			errorMsg = e?.message ?? 'Ошибка действия';
		} finally {
			isActing = false;
		}
	}

	async function leaveGame() {
		const gid = getCurrentGameId();
		if (gid && gs?.st === 'a') {
			try { await abandonFn({ gameId: gid }); } catch (_) {}
		}
		unsubscribeFromGame();
		phase = 'lobby';
	}

	/* ── CLEANUP при уходе со страницы ──────────────────── */
	onDestroy(async () => {
		const gid = getCurrentGameId();
		if (gid && $rouletteState?.st === 'a') {
			try { await abandonFn({ gameId: gid }); } catch (_) {}
		}
		unsubscribeFromGame();
	});
</script>

<!-- ════════════════════════════════════════════════════════
     ПОЛНОЭКРАННЫЙ ОВЕРЛЕЙ — перекрывает навбар
════════════════════════════════════════════════════════ -->
<div class="volt-root">

	<!-- ╔══════════════════════════════════╗
	     ║  LOBBY — экран входа             ║
	     ╚══════════════════════════════════╝ -->
	{#if phase === 'lobby'}
		<div class="lobby-screen">
			<div class="lobby-card">
				<!-- Заголовок -->
				<div class="title-block">
					<span class="title-tag">[ CASINO SYSTEM v4.1 ]</span>
					<h1 class="game-title">VOLT<br/>DEADLOCK</h1>
					<p class="game-sub">Плазменная рулетка · Один на один с Орионом</p>
				</div>

				<!-- Правила -->
				<div class="rules-grid">
					<div class="rule-item">
						<span class="rule-icon">⚡</span>
						<div>
							<p class="rule-label">Боевой патрон</p>
							<p class="rule-val">−1 HP (или −2 с Overdrive)</p>
						</div>
					</div>
					<div class="rule-item">
						<span class="rule-icon" style="color:#444">○</span>
						<div>
							<p class="rule-label">Холостой (в себя)</p>
							<p class="rule-val">Бесплатный доп. ход</p>
						</div>
					</div>
					<div class="rule-item">
						<span class="rule-icon">🏆</span>
						<div>
							<p class="rule-label">Победа</p>
							<p class="rule-val">+1000 PC</p>
						</div>
					</div>
					<div class="rule-item">
						<span class="rule-icon">💀</span>
						<div>
							<p class="rule-label">Поражение / Побег</p>
							<p class="rule-val">−500 PC (ставка сгорает)</p>
						</div>
					</div>
				</div>

				<!-- Предметы -->
				<div class="items-legend">
					{#each Object.entries(ITEM_META) as [key, meta]}
						<div class="item-legend-row" style="--clr:{meta.color}">
							<span class="item-icon-lg">{meta.icon}</span>
							<div>
								<p class="item-lname">{meta.label}</p>
								<p class="item-ldesc">{meta.desc}</p>
							</div>
						</div>
					{/each}
				</div>

				{#if errorMsg}
					<p class="error-msg">{errorMsg}</p>
				{/if}

				<!-- CTA -->
				<div class="lobby-cta">
					<p class="entry-cost">Стоимость входа: <strong>500 PC</strong></p>
					<p class="balance-note">
						Баланс: <strong>{$userStore.user?.casino_credits ?? '—'} PC</strong>
					</p>
					<button
						class="btn-enter"
						disabled={isStarting || !$userStore.user}
						on:click={startGame}
					>
						{isStarting ? 'ПОДКЛЮЧЕНИЕ...' : 'ВОЙТИ В СИСТЕМУ'}
					</button>
				</div>
			</div>
		</div>

	<!-- ╔══════════════════════════════════╗
	     ║  PLAYING — основная игровая зона ║
	     ╚══════════════════════════════════╝ -->
	{:else if phase === 'playing'}
		<div class="game-screen">

			<!-- ХЕДЕР -->
			<header class="game-header">
				<span class="hdr-tag">VOLT DEADLOCK</span>
				<span class="hdr-turn {isMyTurn ? 'turn-player' : 'turn-orion'}">
					{isMyTurn ? '▶ ВАШ ХОД' : '⏳ ХОД ОРИОНА'}
				</span>
				<button class="btn-escape" on:click={leaveGame} title="Покинуть (ставка сгорает)">
					⏏ ПОБЕГ
				</button>
			</header>

			<!-- ── ЗОНА ОРИОНА ── -->
			<section class="zone orion-zone">
				<!-- Эмоция -->
				{#if orionEmo}
					<div class="orion-face" style="color:{orionEmo.color}; border-color:{orionEmo.color}40">
						<span class="face-eyes {orionEmo.label === 'CRITICAL' ? 'blink-red' : ''}">{orionEmo.face}</span>
						<span class="face-label" style="color:{orionEmo.color}">{orionEmo.label}</span>
					</div>
				{/if}

				<div class="entity-info">
					<p class="entity-name">ОРИОН <span class="entity-sub">/ AI DEALER</span></p>

					<!-- HP bar -->
					{#if gs}
						<div class="hp-bar-wrap">
							{#each Array(gs.mhp) as _, i}
								<div
									class="hp-dot {i < gs.ohp ? 'hp-dot-on' : 'hp-dot-off'}"
									style={i < gs.ohp ? 'background:#ff003c; box-shadow:0 0 6px #ff003c' : ''}
								/>
							{/each}
							<span class="hp-num">{gs.ohp}/{gs.mhp}</span>
						</div>

						<!-- Предметы Ориона (количество, не тип!) -->
						<div class="orion-items">
							{#each Object.entries(gs.oit) as [k, v]}
								{#if (v as number) > 0}
									<span
										class="oitem-badge"
										style="color:{ITEM_META[k as keyof Items].color}"
									>
										{ITEM_META[k as keyof Items].icon} ×{v}
									</span>
								{/if}
							{/each}
						</div>

						<!-- Статус баффов Ориона -->
						<div class="buff-row">
							{#if gs.odbl}<span class="buff-tag" style="color:#fcee0a">⚡ OVERDRIVE</span>{/if}
							{#if gs.oskip}<span class="buff-tag" style="color:#ff00c1">⌁ EMP LOCK</span>{/if}
						</div>
					{/if}
				</div>
			</section>

			<!-- ── СТОЛ (центр) ── -->
			<section class="table-zone">
				<!-- Плазмоган -->
				<div class="gun-block">
					<div class="gun-icon {isMyTurn ? 'gun-player' : 'gun-orion'}">
						⊹ ПЛАЗМОГАН ⊹
					</div>
					<!-- Патронник: показываем кол-во и результат сканера -->
					<div class="shells-row">
						{#if gs}
							{#each Array(gs.sl) as _, i}
								<div class="shell {i === 0 && gs.scan != null ? (gs.scan === 1 ? 'shell-live' : 'shell-blank') : 'shell-unknown'}" />
							{/each}
						{/if}
					</div>
					{#if gs}
						<p class="shells-count">
							Патронов в магазине: <strong>{gs.sl}</strong>
							{#if gs.scan != null}
								· Сканер: <span style="color:{gs.scan===1?'#ff003c':'#888'}">
									{gs.scan === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}
								</span>
							{/if}
						</p>
					{/if}
				</div>

				<!-- Лог действий -->
				<div class="log-panel" bind:this={logEl}>
					{#each logHistory as entry, i}
						<p class="log-line" style="opacity:{0.4 + (i / logHistory.length) * 0.6}">
							<span class="log-arrow">▸</span> {entry}
						</p>
					{/each}
				</div>
			</section>

			<!-- ── ЗОНА ИГРОКА ── -->
			<section class="zone player-zone">
				<div class="entity-info">
					<p class="entity-name">ОПЕРАТОР <span class="entity-sub">/ YOU</span></p>

					{#if gs}
						<!-- HP bar -->
						<div class="hp-bar-wrap">
							{#each Array(gs.mhp) as _, i}
								<div
									class="hp-dot {i < gs.php ? 'hp-dot-on' : 'hp-dot-off'}"
									style={i < gs.php ? 'background:#00f0ff; box-shadow:0 0 6px #00f0ff' : ''}
								/>
							{/each}
							<span class="hp-num">{gs.php}/{gs.mhp}</span>
						</div>

						<!-- Баффы игрока -->
						<div class="buff-row">
							{#if gs.pdbl}<span class="buff-tag" style="color:#fcee0a">⚡ OVERDRIVE</span>{/if}
							{#if gs.pskip}<span class="buff-tag" style="color:#ff00c1">⌁ EMP LOCK</span>{/if}
						</div>

						<!-- Предметы игрока -->
						<div class="player-items">
							{#each Object.entries(gs.pit) as [k, v]}
								{#if (v as number) > 0}
									{@const meta = ITEM_META[k as keyof Items]}
									<button
										class="item-btn"
										style="--c:{meta.color}"
										disabled={!isMyTurn || isActing}
										on:click={() => doAction('item_' + k)}
										title={meta.desc}
									>
										<span class="item-icon">{meta.icon}</span>
										<span class="item-name">{meta.label}</span>
										<span class="item-count">×{v}</span>
									</button>
								{/if}
							{/each}
						</div>
					{/if}
				</div>

				<!-- Кнопки выстрела -->
				<div class="shoot-row">
					<button
						class="btn-shoot btn-self"
						disabled={!isMyTurn || isActing}
						on:click={() => doAction('shoot_self')}
					>
						<span>▼</span> В СЕБЯ
					</button>
					<button
						class="btn-shoot btn-enemy"
						disabled={!isMyTurn || isActing}
						on:click={() => doAction('shoot_enemy')}
					>
						<span>▲</span> В ОРИОНА
					</button>
				</div>

				{#if errorMsg}
					<p class="error-msg">{errorMsg}</p>
				{/if}

				{#if isActing}
					<p class="processing">⏳ Обработка...</p>
				{/if}
			</section>
		</div>

	<!-- ╔══════════════════════════════════╗
	     ║  RESULT — экран результата       ║
	     ╚══════════════════════════════════╝ -->
	{:else if phase === 'result'}
		<div class="result-screen">
			<div class="result-card {resultWon ? 'res-win' : 'res-lose'}">
				{#if resultWon}
					<div class="res-icon">🏆</div>
					<h2 class="res-title" style="color:#00f0ff">ПРОТОКОЛ ВЫПОЛНЕН</h2>
					<p class="res-sub">Орион уничтожен. Вы получаете <strong>+1000 PC</strong>.</p>
				{:else}
					<div class="res-icon">💀</div>
					<h2 class="res-title" style="color:#ff003c">СИСТЕМА ОТКАЗАЛА</h2>
					<p class="res-sub">Орион победил. Ставка <strong>−500 PC</strong> сгорела.</p>
				{/if}
				<p class="res-timer">Возврат в лобби...</p>
			</div>
		</div>
	{/if}
</div>

<!-- ════════════════════════════════════════════════════════
     СТИЛИ
════════════════════════════════════════════════════════ -->
<style>
	/* ── Root overlay ────────────────────────────────────── */
	.volt-root {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: #050508;
		background-image:
			radial-gradient(ellipse at 50% 0%, rgba(0,240,255,0.04) 0%, transparent 60%),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Cpath fill='%23ffffff' fill-opacity='0.015' d='M0 2h2v2H0zM2 0h2v2H2z'/%3E%3C/svg%3E");
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: 'Chakra Petch', 'Inter', monospace;
		color: #e0e0e0;
	}

	/* ── LOBBY ───────────────────────────────────────────── */
	.lobby-screen {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow-y: auto;
		padding: 2rem 1rem;
	}
	.lobby-card {
		width: 100%;
		max-width: 560px;
		border: 1px solid rgba(0,240,255,0.2);
		border-radius: 12px;
		background: rgba(10,10,20,0.9);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.title-block { text-align: center; }
	.title-tag {
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		color: rgba(0,240,255,0.5);
		text-transform: uppercase;
	}
	.game-title {
		font-family: 'Russo One', sans-serif;
		font-size: clamp(2.5rem, 10vw, 4rem);
		line-height: 1;
		color: #00f0ff;
		text-shadow: 0 0 30px rgba(0,240,255,0.5), 0 0 60px rgba(0,240,255,0.2);
		margin: 0.25rem 0;
		letter-spacing: 0.05em;
	}
	.game-sub {
		font-size: 0.75rem;
		color: rgba(255,255,255,0.4);
		letter-spacing: 0.1em;
	}

	.rules-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.rule-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 8px;
		padding: 0.6rem 0.8rem;
	}
	.rule-icon { font-size: 1.2rem; flex-shrink: 0; color: #00f0ff; }
	.rule-label { font-size: 0.7rem; color: rgba(255,255,255,0.5); margin: 0; }
	.rule-val   { font-size: 0.8rem; font-weight: 700; margin: 0; }

	.items-legend {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.item-legend-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-left: 2px solid var(--clr);
		background: rgba(255,255,255,0.02);
		border-radius: 0 6px 6px 0;
	}
	.item-icon-lg { font-size: 1rem; color: var(--clr); min-width: 1.2rem; text-align: center; }
	.item-lname { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; color: var(--clr); margin: 0; }
	.item-ldesc { font-size: 0.6rem; color: rgba(255,255,255,0.4); margin: 0; }

	.lobby-cta { text-align: center; display: flex; flex-direction: column; gap: 0.4rem; align-items: center; }
	.entry-cost { font-size: 0.85rem; color: rgba(255,255,255,0.6); margin: 0; }
	.balance-note { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin: 0; }

	.btn-enter {
		margin-top: 0.5rem;
		padding: 0.9rem 2.5rem;
		background: transparent;
		border: 1px solid #00f0ff;
		color: #00f0ff;
		font-family: 'Russo One', sans-serif;
		font-size: 1rem;
		letter-spacing: 0.15em;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s;
		text-shadow: 0 0 10px rgba(0,240,255,0.6);
		box-shadow: 0 0 20px rgba(0,240,255,0.1), inset 0 0 20px rgba(0,240,255,0.03);
	}
	.btn-enter:hover:not(:disabled) {
		background: rgba(0,240,255,0.1);
		box-shadow: 0 0 40px rgba(0,240,255,0.3), inset 0 0 20px rgba(0,240,255,0.08);
	}
	.btn-enter:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── GAME SCREEN ─────────────────────────────────────── */
	.game-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.game-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid rgba(0,240,255,0.1);
		background: rgba(0,0,0,0.5);
		flex-shrink: 0;
	}
	.hdr-tag {
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		color: rgba(0,240,255,0.5);
	}
	.hdr-turn {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
	}
	.turn-player { color: #00f0ff; border: 1px solid rgba(0,240,255,0.4); background: rgba(0,240,255,0.05); }
	.turn-orion  { color: #ff003c; border: 1px solid rgba(255,0,60,0.4);  background: rgba(255,0,60,0.05); animation: pulse-red 1s infinite; }

	@keyframes pulse-red {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.btn-escape {
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: rgba(255,255,255,0.3);
		background: transparent;
		border: 1px solid rgba(255,255,255,0.1);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-escape:hover { color: #ff003c; border-color: rgba(255,0,60,0.4); }

	/* ── ZONES ───────────────────────────────────────────── */
	.zone {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		overflow: hidden;
	}
	.orion-zone {
		border-bottom: 1px solid rgba(255,0,60,0.1);
		background: linear-gradient(to bottom, rgba(255,0,60,0.03), transparent);
		flex: 1.2;
	}
	.player-zone {
		border-top: 1px solid rgba(0,240,255,0.1);
		background: linear-gradient(to top, rgba(0,240,255,0.03), transparent);
		flex: 1.5;
		flex-direction: column;
		align-items: stretch;
	}

	/* ── ORION FACE ──────────────────────────────────────── */
	.orion-face {
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		border: 1px solid;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		background: rgba(0,0,0,0.5);
	}
	.face-eyes {
		font-size: 1.5rem;
		letter-spacing: 4px;
		font-family: monospace;
	}
	.face-label {
		font-size: 0.45rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.blink-red { animation: blink 0.5s infinite; }
	@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

	/* ── ENTITY INFO ─────────────────────────────────────── */
	.entity-info { flex: 1; min-width: 0; }
	.entity-name {
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		font-weight: 700;
		margin: 0 0 0.4rem;
		color: rgba(255,255,255,0.8);
	}
	.entity-sub { color: rgba(255,255,255,0.3); font-weight: 400; }

	.hp-bar-wrap {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.hp-dot {
		width: 14px;
		height: 14px;
		border-radius: 2px;
		transition: all 0.3s;
	}
	.hp-dot-on  { }
	.hp-dot-off { background: rgba(255,255,255,0.08); }
	.hp-num {
		font-size: 0.7rem;
		color: rgba(255,255,255,0.4);
		margin-left: 4px;
		font-family: monospace;
	}

	.buff-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
	.buff-tag {
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		padding: 1px 6px;
		border-radius: 3px;
		border: 1px solid currentColor;
		background: rgba(0,0,0,0.4);
		animation: buff-pulse 1s infinite;
	}
	@keyframes buff-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

	.orion-items { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.oitem-badge { font-size: 0.65rem; opacity: 0.7; }

	/* ── TABLE ZONE ──────────────────────────────────────── */
	.table-zone {
		flex-shrink: 0;
		padding: 0.5rem 1.25rem;
		border-top: 1px solid rgba(255,255,255,0.05);
		border-bottom: 1px solid rgba(255,255,255,0.05);
		background: rgba(255,255,255,0.01);
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		max-height: 160px;
	}

	.gun-block { flex-shrink: 0; }
	.gun-icon {
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		padding: 0.4rem 0.8rem;
		border-radius: 4px;
		font-weight: 700;
		text-align: center;
		margin-bottom: 0.4rem;
	}
	.gun-player { color: #00f0ff; border: 1px solid rgba(0,240,255,0.3); background: rgba(0,240,255,0.04); }
	.gun-orion  { color: #ff003c; border: 1px solid rgba(255,0,60,0.3);  background: rgba(255,0,60,0.04);  }

	.shells-row { display: flex; gap: 4px; flex-wrap: wrap; max-width: 160px; }
	.shell {
		width: 12px;
		height: 20px;
		border-radius: 3px;
		transition: all 0.3s;
	}
	.shell-unknown { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1); }
	.shell-live    { background: #ff003c; box-shadow: 0 0 6px #ff003c; }
	.shell-blank   { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
	.shells-count { font-size: 0.6rem; color: rgba(255,255,255,0.35); margin-top: 0.3rem; }

	.log-panel {
		flex: 1;
		overflow-y: auto;
		max-height: 140px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		scrollbar-width: none;
	}
	.log-panel::-webkit-scrollbar { display: none; }
	.log-line {
		font-size: 0.65rem;
		color: rgba(255,255,255,0.7);
		font-family: 'Chakra Petch', monospace;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.6;
		transition: opacity 0.3s;
	}
	.log-arrow { color: rgba(0,240,255,0.4); margin-right: 4px; }

	/* ── PLAYER ITEMS ────────────────────────────────────── */
	.player-items {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0.4rem 0;
	}
	.item-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 0.4rem 0.5rem;
		background: rgba(0,0,0,0.5);
		border: 1px solid var(--c);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		min-width: 52px;
		color: var(--c);
		box-shadow: 0 0 8px rgba(0,0,0,0.5);
	}
	.item-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--c) 12%, transparent);
		box-shadow: 0 0 16px color-mix(in srgb, var(--c) 40%, transparent);
		transform: translateY(-1px);
	}
	.item-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
	.item-icon  { font-size: 1rem; }
	.item-name  { font-size: 0.48rem; letter-spacing: 0.08em; font-weight: 700; text-transform: uppercase; }
	.item-count { font-size: 0.6rem; opacity: 0.7; font-family: monospace; }

	/* ── SHOOT BUTTONS ───────────────────────────────────── */
	.shoot-row {
		display: flex;
		gap: 0.75rem;
	}
	.btn-shoot {
		flex: 1;
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-family: 'Russo One', sans-serif;
		font-size: 0.85rem;
		letter-spacing: 0.15em;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
	}
	.btn-self {
		background: rgba(0,0,0,0.5);
		border: 1px solid rgba(255,255,255,0.2);
		color: rgba(255,255,255,0.7);
	}
	.btn-self:hover:not(:disabled) {
		background: rgba(255,255,255,0.05);
		border-color: rgba(255,255,255,0.4);
		box-shadow: 0 0 20px rgba(255,255,255,0.05);
	}
	.btn-enemy {
		background: rgba(255,0,60,0.08);
		border: 1px solid rgba(255,0,60,0.5);
		color: #ff003c;
		text-shadow: 0 0 10px rgba(255,0,60,0.5);
	}
	.btn-enemy:hover:not(:disabled) {
		background: rgba(255,0,60,0.15);
		box-shadow: 0 0 30px rgba(255,0,60,0.2);
		transform: translateY(-1px);
	}
	.btn-shoot:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

	/* ── RESULT ──────────────────────────────────────────── */
	.result-screen {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.result-card {
		text-align: center;
		padding: 3rem 2rem;
		border-radius: 12px;
		border: 1px solid;
		background: rgba(0,0,0,0.8);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		animation: result-in 0.4s ease-out;
	}
	@keyframes result-in {
		from { transform: scale(0.85); opacity: 0; }
		to   { transform: scale(1);    opacity: 1; }
	}
	.res-win  { border-color: rgba(0,240,255,0.5); box-shadow: 0 0 60px rgba(0,240,255,0.15); }
	.res-lose { border-color: rgba(255,0,60,0.5);  box-shadow: 0 0 60px rgba(255,0,60,0.15); }
	.res-icon  { font-size: 3rem; }
	.res-title { font-family: 'Russo One', sans-serif; font-size: 2rem; margin: 0; letter-spacing: 0.05em; }
	.res-sub   { color: rgba(255,255,255,0.6); margin: 0; font-size: 0.9rem; }
	.res-timer { font-size: 0.65rem; color: rgba(255,255,255,0.3); letter-spacing: 0.2em; margin: 0; animation: blink 1s infinite; }

	/* ── UTILS ───────────────────────────────────────────── */
	.error-msg  { font-size: 0.7rem; color: #ff003c; margin: 0.25rem 0 0; }
	.processing { font-size: 0.65rem; color: rgba(0,240,255,0.5); margin: 0.25rem 0 0; letter-spacing: 0.1em; animation: pulse-red 0.8s infinite; }
</style>
