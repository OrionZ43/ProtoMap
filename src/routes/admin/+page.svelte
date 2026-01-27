<script lang="ts">
    import { onMount } from 'svelte';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';
    import type { PageData } from './$types';

    export let data: PageData;

    // Анимированные значения
    const animatedBank = tweened(0, { duration: 2000, easing: cubicOut });
    const animatedUsers = tweened(0, { duration: 1500, easing: cubicOut });

    onMount(() => {
        animatedBank.set(data.bankBalance);
        animatedUsers.set(data.totalUsers);
    });

    // Логи можно оставить фейковыми или прикрутить реальные, если есть коллекция логов
    const logs = [
        { type: 'info', text: "Система охлаждения: НОРМА" },
        { type: 'warn', text: "Нагрузка на ядро: 12%" },
        { type: 'success', text: "Банк успешно инициализирован." }
    ];
</script>

<svelte:head>
    <title>Dashboard | God Mode</title>
</svelte:head>

<div class="dashboard-header">
    <h2 class="page-title">SYSTEM_OVERVIEW</h2>
    <div class="date-badge">{new Date().toLocaleDateString()}</div>
</div>

<div class="dashboard-grid">

    <!-- STAT 1: USERS -->
    <div class="glass-card">
        <div class="card-icon text-green-400">👥</div>
        <div class="card-content">
            <div class="label">ПОЛЬЗОВАТЕЛИ</div>
            <div class="value">{Math.floor($animatedUsers)}</div>
        </div>
        <div class="decor-line green"></div>
    </div>

    <!-- STAT 2: BANKROLL -->
    <div class="glass-card">
        <div class="card-icon text-cyber-yellow">💰</div>
        <div class="card-content">
            <div class="label">КАЗНА (БАНК)</div>
            <div class="value">{Math.floor($animatedBank).toLocaleString()} PC</div>
        </div>
        <div class="decor-line yellow"></div>
    </div>

    <!-- STAT 3: HEALTH (Фейк для атмосферы) -->
    <div class="glass-card wide">
        <div class="card-header">
            <span class="label">SYSTEM_INTEGRITY</span>
            <span class="value-sm text-blue-400">100%</span>
        </div>
        <div class="progress-track">
            <div class="progress-fill" style="width: 100%; background: #3b82f6; box-shadow: 0 0 15px #3b82f6;"></div>
        </div>
    </div>

    <!-- LOGS -->
    <div class="glass-card col-span-full logs-panel">
        <div class="card-header mb-4">
            <span class="label">// SYSTEM_LOGS</span>
        </div>
        <div class="logs-container">
            {#each logs as log}
                <div class="log-row">
                    <span class="log-type {log.type}">[{log.type.toUpperCase()}]</span>
                    <span class="log-text">{log.text}</span>
                </div>
            {/each}
        </div>
    </div>

</div>

<!-- ... (стили те же) ... -->
<style>
/* ... копируй стили из прошлого ответа, они хорошие ... */
    .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .page-title { font-family: 'Chakra Petch', monospace; font-size: 1.5rem; font-weight: bold; color: #fff; letter-spacing: 0.1em; }
    .date-badge { background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 8px; font-family: 'Chakra Petch', monospace; font-size: 0.8rem; color: #888; border: 1px solid rgba(255,255,255,0.1); }

    .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
    }

    .glass-card {
        background: rgba(20, 25, 35, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1rem;
        padding: 1.5rem;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .glass-card.wide { grid-column: span 2; }
    @media (max-width: 768px) { .glass-card.wide { grid-column: span 1; } }

    .card-icon { font-size: 2rem; margin-bottom: 0.5rem; }
    .label { font-family: 'Chakra Petch', monospace; font-size: 0.75rem; color: #64748b; font-weight: bold; letter-spacing: 0.1em; margin-bottom: 0.5rem; }
    .value { font-size: 2rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
    .value-sm { font-size: 1.2rem; font-weight: bold; font-family: 'Chakra Petch', monospace; }

    .decor-line { position: absolute; bottom: 0; left: 0; height: 3px; width: 100%; opacity: 0.5; }
    .decor-line.green { background: #39ff14; box-shadow: 0 0 10px #39ff14; }
    .decor-line.yellow { background: #00f3ff; box-shadow: 0 0 10px #00f3ff; }

    .card-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }

    /* PROGRESS BAR */
    .progress-track { width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #ff003c, #ff5e00); box-shadow: 0 0 15px #ff003c; }

    /* LOGS */
    .col-span-full { grid-column: 1 / -1; }
    .logs-panel { min-height: 300px; justify-content: flex-start; }
    .logs-container { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.8rem; }
    .log-row { display: flex; gap: 1rem; align-items: baseline; }
    .log-type { font-weight: bold; width: 80px; }
    .log-type.info { color: #00f3ff; }
    .log-type.warn { color: #ffd700; }
    .log-type.crit { color: #ff003c; }
    .log-type.success { color: #39ff14; }
    .log-text { color: #cbd5e1; }
</style>