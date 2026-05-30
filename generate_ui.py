import re

content = """<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { AudioManager } from '$lib/client/audioManager';
  import {
    rouletteState, rouletteLoading, rouletteGameId,
    actionQueue, isPlayingQueue, currentOrionSprite,
    subscribeToGame, unsubscribeFromGame,
    type GamePublicState, getCurrentGameId
  } from '$lib/stores/rouletteStore';
  import { ITEM_META } from '$lib/types/roulette';
  import type { GameEvent } from '$lib/types/roulette';
  import type { OrionSprite } from '$lib/stores/rouletteStore';
  import { getApp } from 'firebase/app';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { browser } from '$app/environment';

  // ── Утилиты ──────────────────────────────────────────────
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ── Спрайты Ориона ───────────────────────────────────────
  const SPRITES: Record<OrionSprite, string> = {
    idle:           '/casino/orion/idle.png',
    holding_gun:    '/casino/orion/holding_gun.png',
    aiming_viewer:  '/casino/orion/aiming_viewer.png',
    aiming_self:    '/casino/orion/aiming_self.png',
  };

  const fns = getFunctions(getApp(), 'us-central1');
  const makeAction = httpsCallable(fns, 'makeRouletteAction');
  const startFn = httpsCallable(fns, 'startRoulette');
  const abandonFn = httpsCallable(fns, 'abandonRoulette');

  // ── Состояния UI ──────────────────────────────────────────
  let actionsBlocked = false;
  let displayedLog = '';
  let showResult: 'player' | 'orion' | null = null;

  let visualPhp = 0;
  let visualOhp = 0;
  let visualSl = 0;
  let visualScan: number | null | undefined = null;

  // ── Главная функция: воспроизвести очередь событий ───────
  async function playEventQueue(events: GameEvent[]) {
    if (get(isPlayingQueue)) return;
    isPlayingQueue.set(true);
    actionsBlocked = true;

    for (const event of events) {
      await processEvent(event);
      await sleep(200);
    }

    currentOrionSprite.set('idle');
    isPlayingQueue.set(false);
    actionsBlocked = false;
    actionQueue.set([]);
  }

  // ── Обработка одного события ──────────────────────────────
  async function processEvent(event: GameEvent): Promise<void> {
    displayedLog = event.log;

    switch (event.type) {
      case 'item_used': {
        if (event.actor === 'orion') {
          currentOrionSprite.set('holding_gun');
          await sleep(400);
        }

        if (event.item === 'sc') AudioManager.play('vd_item_scanner');
        else if (event.item === 'ew') AudioManager.play('vd_item_emp');
        else AudioManager.play('vd_item_generic');

        if (event.item === 'co') {
            if (event.actor === 'player') visualPhp = Math.min(visualPhp + 1, $rouletteState?.mhp || 0);
            else visualOhp = Math.min(visualOhp + 1, $rouletteState?.mhp || 0);
        } else if (event.item === 'sc') {
            visualScan = $rouletteState?.scan;
        } else if (event.item === 'ad') {
            visualSl = Math.max(0, visualSl - 1);
            visualScan = null;
        }

        await sleep(700);
        if (event.actor === 'orion') currentOrionSprite.set('idle');
        break;
      }

      case 'shoot': {
        const isOrion = event.actor === 'orion';
        const aimSprite: OrionSprite = isOrion
          ? (event.target === 'enemy' ? 'aiming_viewer' : 'aiming_self')
          : 'holding_gun';

        if (isOrion) {
          currentOrionSprite.set('holding_gun');
          await sleep(500);
          currentOrionSprite.set(aimSprite);
          await sleep(800);
        }

        if (event.isLive) {
          AudioManager.play('vd_shot_live');
          flashScreen(event.target === 'enemy' && isOrion ? 'red' : 'cyan');
          await sleep(300);
          animateHpChange(event.target === 'enemy' ? 'player' : 'orion', event.damage ?? 1);
        } else {
          AudioManager.play('vd_shot_blank');
          await sleep(200);
        }

        visualSl = Math.max(0, visualSl - 1);
        visualScan = null;

        await sleep(600);
        if (isOrion) currentOrionSprite.set('idle');
        break;
      }

      case 'reload': {
        AudioManager.play('vd_reload');
        visualSl = event.shellCount ?? 0;
        await sleep(900);
        break;
      }

      case 'skip_turn': {
        AudioManager.play('vd_item_emp');
        await sleep(500);
        break;
      }

      case 'game_over': {
        await sleep(400);
        if (event.winner === 'player') AudioManager.play('vd_win');
        else AudioManager.play('vd_lose');
        showResult = event.winner ?? null;
        break;
      }
    }
  }

  // ── Вспомогательные анимации ──────────────────────────────
  let flashTimeout: ReturnType<typeof setTimeout>;
  let screenFlash = '';

  function flashScreen(color: 'red' | 'cyan') {
    screenFlash = color;
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => { screenFlash = ''; }, 400);
  }

  function animateHpChange(target: 'player' | 'orion', damage: number) {
      if (target === 'player') {
          visualPhp = Math.max(0, visualPhp - damage);
      } else {
          visualOhp = Math.max(0, visualOhp - damage);
      }
  }

  // ── Подписка на очередь событий ───────────────────────────
  let queueUnsub: (() => void) | null = null;
  let stateUnsub: (() => void) | null = null;
  let isInitialized = false;

  onMount(() => {
    AudioManager.initialize();

    stateUnsub = rouletteState.subscribe((state) => {
        if (state && !isInitialized) {
            visualPhp = state.php;
            visualOhp = state.ohp;
            visualSl = state.sl;
            visualScan = state.scan;
            displayedLog = state.log;
            isInitialized = true;
        } else if (!state) {
            isInitialized = false;
        }
    });

    queueUnsub = actionQueue.subscribe(async (events) => {
      if (events.length > 0 && !get(isPlayingQueue)) {
        await playEventQueue([...events]);
      }
    });
  });

  onDestroy(async () => {
    queueUnsub?.();
    stateUnsub?.();
    const gid = getCurrentGameId();
    if (gid && $rouletteState?.st === 'a') {
        try { await abandonFn({ gameId: gid }); } catch (_) {}
    }
    unsubscribeFromGame();
  });

  // ── Действия игрока ─────────────────────────────────
  async function sendAction(action: string) {
    if (actionsBlocked || !get(rouletteGameId)) return;
    const gid = get(rouletteGameId)!;
    actionsBlocked = true;
    try {
      await makeAction({ gameId: gid, action });
    } catch (e) {
      console.error('[VoltDeadlock] Ошибка действия:', e);
      actionsBlocked = false;
    }
  }

  async function handleStartGame() {
      if (actionsBlocked) return;
      actionsBlocked = true;
      showResult = null;
      isInitialized = false;
      try {
          const res = await startFn();
          const data = res.data as { gameId: string };
          subscribeToGame(data.gameId);
      } catch (e) {
          console.error('[VoltDeadlock] Ошибка старта:', e);
      } finally {
          actionsBlocked = false;
      }
  }

  function handlePlayAgain() {
      unsubscribeFromGame();
      handleStartGame();
  }
</script>

<style>
/* Базовые переменные темы */
:root {
  --neon-cyan:   #00f0ff;
  --neon-red:    #ff0044;
  --neon-green:  #39ff14;
  --neon-purple: #bd00ff;
  --panel-bg:    rgba(5, 10, 20, 0.75);
  --panel-border: rgba(0, 240, 255, 0.2);
}

#game-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  font-family: 'Courier New', monospace;
  user-select: none;
}

#bg-layer {
  position: absolute;
  inset: 0;
  background-image: url('/casino/roulette_bg.jpg');
  background-size: cover;
  background-position: center;
  /* Добавь виньетку поверх */
}
#bg-layer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%);
}

#orion-sprite {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: clamp(300px, 40vw, 560px);
  height: auto;
  /* Плавная смена спрайтов */
  transition: opacity 0.15s ease;
  image-rendering: pixelated;
  /* Эффект свечения при активном ходе Ориона */
  filter: drop-shadow(0 0 12px rgba(189, 0, 255, 0));
}
#orion-sprite.orion-active {
  filter: drop-shadow(0 0 18px rgba(189, 0, 255, 0.6));
}

.side-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 240px;
  padding: 20px 14px;
  background: var(--panel-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--panel-border);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
#panel-player { left: 0; border-right: 1px solid var(--panel-border); }
#panel-orion  { right: 0; border-left: 1px solid var(--panel-border); }

.hp-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hp-label { color: var(--neon-cyan); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
.hp-pips  { display: flex; gap: 5px; }
.hp-pip {
  width: 18px; height: 18px;
  border: 1px solid var(--neon-cyan);
  border-radius: 2px;
  background: transparent;
  transition: background 0.3s ease;
}
.hp-pip.filled { background: var(--neon-green); box-shadow: 0 0 8px var(--neon-green); }
.hp-pip.empty  { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); }

.items-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.item-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px;
  background: rgba(0,240,255,0.05);
  border: 1px solid rgba(0,240,255,0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  color: white;
  font-family: inherit;
}
.item-btn:hover:not(:disabled) {
  background: rgba(0,240,255,0.15);
  border-color: var(--neon-cyan);
  box-shadow: 0 0 12px rgba(0,240,255,0.3);
}
.item-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.item-icon  { font-size: 20px; }
.item-label { font-size: 9px; letter-spacing: 1px; color: var(--neon-cyan); }
.item-count { font-size: 11px; color: white; font-weight: bold; }

#hud-center {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.shells-row {
  display: flex; gap: 8px; align-items: center;
}
.shell-pip {
  width: 14px; height: 14px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.1);
}
.shell-pip.known-live  { background: var(--neon-red);   border-color: var(--neon-red);   box-shadow: 0 0 8px var(--neon-red); }
.shell-pip.known-blank { background: rgba(255,255,255,0.3); }
.log-text {
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  text-align: center;
  max-width: 360px;
  /* fade при изменении */
  animation: logFade 0.4s ease;
}
@keyframes logFade {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

#action-bar {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
}
.action-btn {
  padding: 12px 28px;
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn.btn-self {
  color: var(--neon-cyan); border-color: var(--neon-cyan); background: rgba(0,240,255,0.08);
}
.action-btn.btn-self:hover:not(:disabled) { background: rgba(0,240,255,0.2); box-shadow: 0 0 16px rgba(0,240,255,0.4); }
.action-btn.btn-enemy {
  color: var(--neon-red); border-color: var(--neon-red); background: rgba(255,0,68,0.08);
}
.action-btn.btn-enemy:hover:not(:disabled) { background: rgba(255,0,68,0.2); box-shadow: 0 0 16px rgba(255,0,68,0.4); }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* Overlay для экрана победы/поражения */
.result-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.75);
  z-index: 100;
}
.result-box {
  text-align: center;
  padding: 40px 60px;
  border: 1px solid;
  backdrop-filter: blur(12px);
}
.result-box.win  { border-color: var(--neon-green); box-shadow: 0 0 40px rgba(57,255,20,0.3); }
.result-box.lose { border-color: var(--neon-red);   box-shadow: 0 0 40px rgba(255,0,68,0.3); }
.result-title { font-size: 36px; letter-spacing: 6px; margin-bottom: 16px; }
.result-subtitle { font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 30px; }

.flash-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  animation: flashFade 0.4s ease forwards;
}
.flash-red  { background: rgba(255, 0, 68, 0.35); }
.flash-cyan { background: rgba(0, 240, 255, 0.25); }
@keyframes flashFade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

.turn-indicator {
  font-size: 11px;
  letter-spacing: 3px;
  padding: 4px 12px;
  border: 1px solid;
}
.turn-indicator.player-turn { color: var(--neon-cyan); border-color: var(--neon-cyan); }
.turn-indicator.orion-turn  { color: var(--neon-purple); border-color: var(--neon-purple); }

.status-badge {
  font-size: 10px;
  letter-spacing: 2px;
  padding: 3px 8px;
  border: 1px solid;
}
.status-badge.overdrive { color: var(--neon-red);    border-color: var(--neon-red); }
.status-badge.emp       { color: var(--neon-purple); border-color: var(--neon-purple); }

.panel-title {
  font-size: 11px;
  letter-spacing: 4px;
  color: rgba(255,255,255,0.4);
  margin-bottom: 4px;
}

.orion-items {
  opacity: 0.5;
  pointer-events: none;
}
.item-pip-orion {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: 1px solid rgba(189,0,255,0.3);
  border-radius: 4px;
  color: rgba(189,0,255,0.6);
  font-size: 16px;
}

.loading-screen, .start-screen {
  display: flex; align-items: center; justify-content: center;
  height: 100vh;
  font-family: 'Courier New', monospace;
  font-size: 20px;
  letter-spacing: 4px;
  color: var(--neon-cyan);
  background-color: black;
  position: fixed;
  inset: 0;
}
</style>

<div id="game-root">
{#if $rouletteState}
  <!-- Flash overlay -->
  {#if screenFlash}
    <div class="flash-overlay flash-{screenFlash}"></div>
  {/if}

  <!-- Фон -->
  <div id="bg-layer"></div>

  <!-- Спрайт Ориона -->
  <img
    id="orion-sprite"
    src={SPRITES[$currentOrionSprite]}
    alt="Orion"
    class:orion-active={$rouletteState.turn === 'o'}
  />

  <!-- Панель игрока (левая) -->
  <div class="side-panel" id="panel-player">
    <div class="panel-title">ОПЕРАТОР</div>
    <div class="hp-bar-wrap">
      <div class="hp-label">HP</div>
      <div class="hp-pips">
        {#each Array($rouletteState.mhp) as _, i}
          <div class="hp-pip" class:filled={i < visualPhp} class:empty={i >= visualPhp}></div>
        {/each}
      </div>
    </div>
    {#if $rouletteState.pdbl}
      <div class="status-badge overdrive">⚡ OVERDRIVE</div>
    {/if}
    {#if $rouletteState.pskip}
      <div class="status-badge emp">⌁ EMP — ОЖИДАНИЕ</div>
    {/if}
    <div class="items-grid">
      {#each Object.entries(ITEM_META) as [key, meta]}
        {@const count = $rouletteState.pit[key as keyof typeof ITEM_META]}
        {#if count > 0}
          <button
            class="item-btn"
            disabled={actionsBlocked || $rouletteState.turn !== 'p'}
            on:click={() => sendAction(`item_${key}`)}
            title={meta.desc}
          >
            <span class="item-icon">{meta.icon}</span>
            <span class="item-label">{meta.label}</span>
            <span class="item-count">×{count}</span>
          </button>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Панель Ориона (правая) -->
  <div class="side-panel" id="panel-orion">
    <div class="panel-title">ORION</div>
    <div class="hp-bar-wrap">
      <div class="hp-label">HP</div>
      <div class="hp-pips">
        {#each Array($rouletteState.mhp) as _, i}
          <div class="hp-pip" class:filled={i < visualOhp} class:empty={i >= visualOhp}></div>
        {/each}
      </div>
    </div>
    {#if $rouletteState.odbl}
      <div class="status-badge overdrive">⚡ OVERDRIVE</div>
    {/if}
    {#if $rouletteState.oskip}
      <div class="status-badge emp">⌁ EMP — ОЖИДАНИЕ</div>
    {/if}
    <!-- Предметы Ориона -->
    <div class="items-grid orion-items">
      {#each Object.entries($rouletteState.oit) as [key, count]}
        {#each Array(count) as _}
          <div class="item-pip-orion" title="Предмет Ориона">⬡</div>
        {/each}
      {/each}
    </div>
  </div>

  <!-- HUD центр -->
  <div id="hud-center">
    <div class="shells-row">
      {#each Array(visualSl) as _, i}
        <div
          class="shell-pip"
          class:known-live={i === 0 && visualScan === 1}
          class:known-blank={i === 0 && visualScan === 0}
        ></div>
      {/each}
    </div>
    {#key displayedLog}
      <div class="log-text">{displayedLog || $rouletteState.log}</div>
    {/key}
    <div class="turn-indicator" class:player-turn={$rouletteState.turn === 'p'} class:orion-turn={$rouletteState.turn === 'o'}>
      {$rouletteState.turn === 'p' ? '▶ ТВОЙ ХОД' : '◀ ХОД ОРИОНА'}
    </div>
  </div>

  <!-- Action bar -->
  {#if $rouletteState.turn === 'p' && $rouletteState.st === 'a'}
    <div id="action-bar">
      <button
        class="action-btn btn-self"
        disabled={actionsBlocked}
        on:click={() => sendAction('shoot_self')}
      >🔫 В СЕБЯ</button>
      <button
        class="action-btn btn-enemy"
        disabled={actionsBlocked}
        on:click={() => sendAction('shoot_enemy')}
      >🎯 В ОРИОНА</button>
    </div>
  {/if}

  <!-- Экран результата -->
  {#if showResult || $rouletteState.st !== 'a'}
    {@const win = (showResult ?? ($rouletteState.st === 'p' ? 'player' : 'orion')) === 'player'}
    <div class="result-overlay">
      <div class="result-box" class:win class:lose={!win}>
        <div class="result-title" style="color: {win ? 'var(--neon-green)' : 'var(--neon-red)'}">
          {win ? 'СИСТЕМА СЛОМАНА' : 'НЕЙТРАЛИЗОВАН'}
        </div>
        <div class="result-subtitle">
          {win ? '+1000 PC зачислено на счёт' : 'Орион победил. Ставка потеряна.'}
        </div>
        <button class="action-btn btn-self" on:click={handlePlayAgain}>НОВАЯ ИГРА</button>
      </div>
    </div>
  {/if}
{:else if $rouletteLoading}
  <div class="loading-screen">ИНИЦИАЛИЗАЦИЯ VOLT DEADLOCK...</div>
{:else}
  <div class="start-screen">
    <button class="action-btn btn-enemy" on:click={handleStartGame} disabled={actionsBlocked}>НАЧАТЬ (500 PC)</button>
  </div>
{/if}
</div>
"""

with open('src/routes/casino/roulette/+page.svelte', 'w') as f:
    f.write(content)
