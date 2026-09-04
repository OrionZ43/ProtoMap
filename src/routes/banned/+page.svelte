<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    export let data: PageData;

    let displayedReason = "";
    // Причина всегда приходит непустой: +page.server.ts подставляет
    // 'Protocol Violation.' при отсутствии banReason.
    const fullReason = data.reason;

    onMount(() => {
        let i = 0;
        const interval = setInterval(() => {
            displayedReason += fullReason[i];
            i++;
            if (i >= fullReason.length) clearInterval(interval);
        }, 50);
        return () => clearInterval(interval);
    });
</script>

<svelte:head>
    <title>ДОСТУП ЗАБЛОКИРОВАН | ProtoMap</title>
</svelte:head>

<div class="jail-cell">
    <div class="scanlines"></div>
    <div class="red-overlay"></div>

    <div class="content">
        <!-- Lucide «lock» -->
        <svg
            class="icon-lock"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <h1 class="glitch-text" data-text="CRITICAL ERROR">CRITICAL ERROR</h1>
        <h2 class="sub-title">ВАШ АККАУНТ ЗАМОРОЖЕН</h2>

        <div class="terminal-box">
            <p class="terminal-line">> Идентификатор субъекта: <span class="uid">{data.uid}</span></p>
            <p class="terminal-line">> Статус: <span class="red">ИСКЛЮЧЕН ИЗ СЕТИ</span></p>
            <p class="terminal-line">> Причина: <span class="reason">{displayedReason}</span><span class="cursor">_</span></p>
            {#if data.bannedUntil}
                <p class="terminal-line">> Дата амнистии: <span class="yellow">{new Date(data.bannedUntil.seconds * 1000).toLocaleDateString()}</span></p>
            {:else}
                <p class="terminal-line">> Дата амнистии: <span class="red">НИКОГДА</span></p>
            {/if}
        </div>

        <div class="appeal-section">
            {#if data.appealable}
                <p class="appeal-text">Считаете это ошибкой? Ваши мольбы могут быть услышаны здесь:</p>
                <a href="https://t.me/Orion_Z43" class="appeal-btn">ПОДАТЬ АПЕЛЛЯЦИЮ</a>
            {:else}
                <!--
                    Блокировка по пункту 2.3 Соглашения (безопасность детей).
                    Решение окончательное, процедура обжалования по пункту 2.9
                    на такие случаи не распространяется — кнопку не показываем.
                -->
                <p class="appeal-text final">
                    Блокировка применена по пункту 2.3 Пользовательского соглашения
                    (безопасность детей). Решение является окончательным и обжалованию
                    не подлежит.
                </p>
            {/if}
        </div>
    </div>
</div>

<style>
    .jail-cell {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: #000; color: #ff003c;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Chakra Petch', monospace; overflow: hidden;
    }

    .scanlines {
        position: absolute; inset: 0; pointer-events: none; z-index: 1;
        background: linear-gradient(to bottom, rgba(255,0,0,0), rgba(255,0,0,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
        background-size: 100% 4px; animation: scan 10s linear infinite;
    }
    .red-overlay {
        position: absolute; inset: 0; pointer-events: none; z-index: 2;
        background: radial-gradient(circle, transparent 50%, rgba(255, 0, 60, 0.2) 90%);
        animation: pulse-red 2s infinite;
    }

    .content { z-index: 10; text-align: center; max-width: 600px; width: 90%; }

    .icon-lock {
        width: 4rem; height: 4rem; margin-bottom: 1rem;
        color: #ff003c; animation: shake 0.5s infinite;
        filter: drop-shadow(0 0 8px rgba(255, 0, 60, 0.5));
    }

    .glitch-text {
        font-size: 3rem; font-weight: 900; color: #fff; position: relative;
        text-shadow: 2px 2px #ff003c, -2px -2px #00f3ff;
    }
    .sub-title { color: #ff003c; margin-bottom: 2rem; letter-spacing: 0.2em; }

    .terminal-box {
        background: rgba(20, 0, 0, 0.8); border: 1px solid #ff003c;
        padding: 1.5rem; text-align: left; margin-bottom: 2rem;
        box-shadow: 0 0 20px rgba(255, 0, 60, 0.2);
    }
    .terminal-line { margin-bottom: 0.5rem; color: #aaa; font-size: 0.9rem; }
    .uid { color: #fff; }
    .red { color: #ff003c; font-weight: bold; }
    .yellow { color: #ffd700; font-weight: bold; }
    .reason { color: #fff; }
    .cursor { animation: blink 1s infinite; }

    .appeal-text { color: #666; font-size: 0.8rem; margin-bottom: 1rem; }
    .appeal-text.final {
        color: #8a5560; max-width: 34rem; margin: 0 auto;
        line-height: 1.6; border-top: 1px solid rgba(255, 0, 60, 0.2); padding-top: 1rem;
    }
    .appeal-btn {
        display: inline-block; padding: 0.8rem 2rem;
        border: 1px solid #ff003c; color: #ff003c; text-decoration: none;
        font-weight: bold; transition: all 0.2s;
    }
    .appeal-btn:hover { background: #ff003c; color: #000; box-shadow: 0 0 20px #ff003c; }

    @keyframes scan { from { background-position: 0 0; } to { background-position: 0 100%; } }
    @keyframes pulse-red { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    @keyframes shake { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(5deg); } 75% { transform: rotate(-5deg); } }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
</style>