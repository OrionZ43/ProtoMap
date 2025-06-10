<script lang="ts">
    import { userStore } from '$lib/stores';
    import type { PageData } from './$types';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';

    export let data: PageData;
    $: isOwner = $userStore.user && $userStore.user.uid === data.profile.uid;

    let loading = true;
    let statusText = "ПОДКЛЮЧЕНИЕ К ХОСТУ...";
    const statusMessages = ["ОБХОД БРАНДМАУЭРА...", "РАСШИФРОВКА ДАННЫХ...", "ДОСТУП К ПРОФИЛЮ...", "СОЕДИНЕНИЕ УСТАНОВЛЕНО"];

    const containerOpacity = tweened(0, { duration: 500, easing: quintOut });

    onMount(() => {
        let messageIndex = 0;
        const interval = setInterval(() => {
            if (messageIndex < statusMessages.length) {
                statusText = statusMessages[messageIndex];
                messageIndex++;
            } else {
                clearInterval(interval);
                loading = false;
                containerOpacity.set(1);
            }
        }, 600);

        return () => clearInterval(interval);
    });
</script>

<svelte:head>
    <title>{loading ? 'Получение доступа...' : `Профиль ${data.profile.username}`} | ProtoMap</title>
</svelte:head>


{#if loading}
    <div class="h-full w-full flex items-center justify-center font-display text-cyber-yellow uppercase tracking-widest">
        <p class="glitch-text" data-text={statusText}>{statusText}</p>
    </div>
{:else}
    <div class="profile-container cyber-panel pb-12" style="opacity: {$containerOpacity}">
        <div class="corner-bg top-left"></div>
        <div class="corner-bg top-right"></div>
        <div class="corner-bg bottom-left"></div>
        <div class="corner-bg bottom-right"></div>

        <div class="top-bar">
            <div class="bar-light"></div>
            <span class="pl-6">USER ID: {data.profile.uid.substring(0, 18).toUpperCase()}...</span>
        </div>

        <div class="profile-header">
            <img
                src={data.profile.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${data.profile.username}`}
                alt="Аватар {data.profile.username}"
                class="profile-avatar"
            >
            <h2 class="profile-username font-display">{data.profile.username}</h2>
        </div>

        <div class="profile-content">
            {#if data.profile.social_link}
                <div class="profile-section">
                    <h4 class="font-display">ССЫЛКА</h4>
                    <a href={data.profile.social_link} target="_blank" rel="noopener noreferrer" class="social-link">{data.profile.social_link}</a>
                </div>
            {/if}

            {#if data.profile.about_me && data.profile.about_me.trim()}
                <div class="profile-section">
                    <h4 class="font-display">ИНФОРМАЦИЯ</h4>
                    <p class="about-me-text">{data.profile.about_me}</p>
                </div>
            {/if}
        </div>

        {#if isOwner}
            <div class="profile-actions">
                <NeonButton href="/profile/edit">РЕДАКТИРОВАТЬ</NeonButton>
            </div>
        {/if}

        <div class="ticker-wrap">
            <div class="ticker">
                <span>СТАТУС: ОНЛАЙН // УРОВЕНЬ ЗАЩИЩЕННОСТИ: 5 // БИОМЕТРИЯ: СИНХРОНИЗИРОВАНА // ДАТА ПОСЛЕДНЕГО ОБНОВЛЕНИЯ: {new Date().toLocaleDateString()} // ДОБРО ПОЖАЛОВАТЬ, ПОЛЬЗОВАТЕЛЬ. </span>
                <span>СТАТУС: ОНЛАЙН // УРОВЕНЬ ЗАЩИЩЕННОСТИ: 5 // БИОМЕТРИЯ: СИНХРОНИЗИРОВАНА // ДАТА ПОСЛЕДНЕГО ОБНОВЛЕНИЯ: {new Date().toLocaleDateString()} // ДОБРО ПОЖАЛОВАТЬ, ПОЛЬЗОВАТЕЛЬ. </span>
            </div>
        </div>
    </div>
{/if}


<style>
    @keyframes typing { from { width: 0 } to { width: 100% } }
    @keyframes blink-caret { from, to { border-color: transparent } 50% { border-color: var(--cyber-yellow, #fcee0a); } }
    @keyframes glitch-anim { 0% { clip-path: inset(45% 0 50% 0); } /* ... */ 100% { clip-path: inset(5% 0 90% 0); } }
    @keyframes glitch-anim-2 { 0% { clip-path: inset(80% 0 15% 0); } /* ... */ 100% { clip-path: inset(12% 0 85% 0); } }
    @keyframes ticker-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
    }

    .glitch-text { @apply text-xl sm:text-2xl; position: relative; text-shadow: 0 0 5px var(--cyber-yellow); }
    .glitch-text::before, .glitch-text::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-color, #16181d); overflow: hidden; }
    .glitch-text::before { left: 2px; text-shadow: -2px 0 #ff00c1; animation: glitch-anim 1.5s infinite linear alternate-reverse; }
    .glitch-text::after { left: -2px; text-shadow: 2px 0 var(--cyber-cyan); animation: glitch-anim-2 1.5s 0.2s infinite linear alternate-reverse; }

    .profile-container {
        @apply max-w-2xl mx-auto my-10 p-1 sm:p-2 rounded-none shadow-2xl relative overflow-hidden;
        background: #0a0a0a;
        border: 1px solid rgba(252, 238, 10, 0.3);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);

        background-image:
            linear-gradient(rgba(10, 10, 10, 0.96), rgba(10, 10, 10, 0.96)),
            linear-gradient(rgba(252, 238, 10, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(252, 238, 10, 0.1) 1px, transparent 1px);
        background-size: 100% 100%, 30px 30px, 30px 30px;
    }

    .corner-bg {
        @apply absolute w-16 h-16;
        background: radial-gradient(circle, var(--cyber-yellow, #fcee0a) 0%, rgba(252, 238, 10, 0) 60%);
        opacity: 0.15;
        filter: blur(5px);
    }
    .top-left { top: -30px; left: -30px; }
    .top-right { top: -30px; right: -30px; }
    .bottom-left { bottom: -30px; left: -30px; }
    .bottom-right { bottom: -30px; right: -30px; }

    .top-bar {
        @apply p-2 text-xs uppercase tracking-widest text-cyber-yellow/70;
        border-bottom: 1px solid var(--border-color);
        position: relative;
    }
    .bar-light {
        @apply absolute top-1/2 left-2 w-2 h-2 rounded-full bg-cyber-yellow;
        transform: translateY(-50%);
        box-shadow: 0 0 5px var(--cyber-yellow);
    }

    .profile-header, .profile-content, .profile-actions {
        animation: content-fade-in 0.5s ease-out both;
    }
    .profile-content { animation-delay: 0.2s; }
    .profile-actions { animation-delay: 0.4s; }

    @keyframes content-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .profile-header { @apply flex flex-col items-center text-center p-6; }
    .profile-avatar { @apply w-32 h-32 rounded-full object-cover mb-4; border: 4px solid var(--cyber-yellow); box-shadow: 0 0 20px var(--cyber-yellow); }
    .profile-username { @apply text-4xl font-bold text-white break-words; }
    .profile-content { @apply p-6 space-y-6 text-left; }
    .profile-section h4 { @apply text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2; }
    .social-link { @apply text-cyan-400 hover:text-white break-all transition-colors; }
    .about-me-text { @apply text-gray-200 whitespace-pre-wrap leading-relaxed; }
    .profile-actions { @apply p-6 text-center; border-top: 1px solid var(--border-color); }

    .ticker-wrap {
        @apply absolute bottom-0 left-0 w-full overflow-hidden p-2 text-xs uppercase tracking-wider;
        background: var(--bg-color);
        border-top: 1px solid var(--border-color);
    }
    .ticker {
        display: inline-block;
        white-space: nowrap;
        animation: ticker-scroll 30s linear infinite;
    }
</style>