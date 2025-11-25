<script lang="ts">
    import "../app.css";
    import Navbar from "$lib/components/Navbar.svelte";
    import Modal from '$lib/components/Modal.svelte';
    import ChatWidget from '$lib/components/ChatWidget.svelte';
    import { chat } from '$lib/stores';
    import 'leaflet/dist/leaflet.css';
    import 'leaflet.markercluster/dist/MarkerCluster.css';
    import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { AudioManager } from '$lib/client/audioManager';
    import Footer from "$lib/components/Footer.svelte";
    import CookieBanner from '$lib/components/CookieBanner.svelte';
    import { browser } from '$app/environment';
    import { injectAnalytics } from '@vercel/analytics/sveltekit'

    let themeState = 'default';
    let sideTextLeft = 'СТАТУС СИСТЕМЫ: ОНЛАЙН';
    let sideTextRight = 'МОЩНОСТЬ СЕТИ: 99%';

    if (browser) {
        const d = new Date();
        const m = d.getMonth();
        const day = d.getDate();

        if ((m === 9 && day >= 20) || (m === 10 && day <= 2)) {
            themeState = 'halloween';
            sideTextLeft = 'СИСТЕМА: НЕСТАБИЛЬНА';
            sideTextRight = 'АНАЛИЗ АНОМАЛИИ...';
        }
        else if (m === 11 && day >= 1 && day < 15) {
            themeState = 'winter';
            sideTextLeft = 'ТЕМПЕРАТУРА: -15°C';
            sideTextRight = 'СИСТЕМА ОХЛАЖДЕНИЯ: АКТИВНА';
        }
        else if ((m === 11 && day >= 15) || (m === 0 && day <= 14)) {
            themeState = 'newyear';
            sideTextLeft = 'РЕЖИМ: GLITCHMAS';
            sideTextRight = 'КРИОГЕННЫЕ ПРОТОКОЛЫ: МАКСИМУМ';
        }
    }

    onMount(() => {
        AudioManager.initialize();
    });

    $: isMapPage = $page.route.id === '/';

    function toggleChat() {
        if ($chat.isOpen) {
            AudioManager.play('popup_close');
        } else {
            AudioManager.play('popup_open');
        }
        chat.toggle();
    }
</script>

<svelte:head>
    {#if themeState === 'halloween'}
        <link rel="stylesheet" href="/styles/halloween.css">
    {/if}
    {#if themeState === 'winter' || themeState === 'newyear'}
        <link rel="stylesheet" href="/styles/winter.css">
    {/if}
    {#if themeState === 'newyear'}
        <link rel="stylesheet" href="/styles/newyear.css">
    {/if}
    <link rel="stylesheet" href="/styles/cosmetics.css">
</svelte:head>

<div
    class="min-h-screen flex flex-col font-sans antialiased relative"
    class:no-scroll-container={isMapPage}
    class:winter-mode={themeState === 'winter' || themeState === 'newyear'}
>
{#if themeState === 'winter' || themeState === 'newyear'}
        <div class="initial-snow">
            {#each Array(50) as _, i}
                <div class="snow">❄</div>
            {/each}
        </div>
    {/if}

    <div class="side-panel left z-10">
        <div class="v-text">{sideTextLeft}</div>
    </div>
    <div class="side-panel right z-10">
        <div class="v-text">{sideTextRight}</div>
    </div>

    <div class="relative z-20 flex flex-col flex-grow">
        <Navbar />
        <main class="flex-grow">
            <slot />
        </main>
    </div>

    <div class="hidden lg:block">
        {#if !isMapPage && !$page.url.pathname.startsWith('/admin')}
            <Footer />
        {/if}
    </div>

    <Modal />
    <ChatWidget />
    <CookieBanner />

    <button
        class="chat-trigger-btn"
        class:hidden={$chat.isOpen}
        on:click={toggleChat}
        title="Открыть общий чат"
        aria-label="Открыть общий чат"
    >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
            <path fill-rule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.74c0-1.946 1.37-3.68 3.348-3.97zM6.75 8.25a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H7.5z" clip-rule="evenodd" />
        </svg>
    </button>
</div>

<style>
    .chat-trigger-btn {
        @apply fixed bottom-5 right-1 z-50;
        @apply w-16 h-16 rounded-full bg-cyber-yellow text-black;
        @apply flex items-center justify-center;
        @apply shadow-lg shadow-cyber-yellow/50;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform: scale(1);
    }
    .chat-trigger-btn:hover {
        @apply bg-white scale-110;
        box-shadow: 0 0 25px var(--cyber-yellow, #fcee0a);
    }

    .chat-trigger-btn.hidden {
        transform: scale(0);
        opacity: 0;
    }
    .side-panel {
        @apply fixed top-0 bottom-0 z-20 flex items-center justify-center;
        width: 75px;
    }
    @media (max-width: 1023px) {
        .side-panel {
            display: none;
        }
    }
</style>