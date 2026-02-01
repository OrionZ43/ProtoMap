<script lang="ts">
    import "../app.css";
    import "/src/styles/cosmetics.css";
    import "/src/styles/profile-skins.css";

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
    import { browser, dev } from '$app/environment';
    import { injectAnalytics } from '@vercel/analytics/sveltekit';
    import SplashModal from '$lib/components/SplashModal.svelte';
    import { settingsStore } from '$lib/stores/settingsStore';
    import Snowfall from '$lib/components/Snowfall.svelte';
    import { goto, beforeNavigate } from '$app/navigation';

    import '$lib/i18n';
    import { waitLocale } from 'svelte-i18n';

    let themeState = 'default';
    let sideTextLeft = 'СТАТУС СИСТЕМЫ: ОНЛАЙН';
    let sideTextRight = 'МОЩНОСТЬ СЕТИ: 99%';
    let isReady = false;
    let seasonActiveInSession = false;

    $: user = $page.data.user;
    $: isBanned = user?.isBanned === true;
    $: isBannedPage = $page.url.pathname.startsWith('/banned');

    $: if (isBanned && !isBannedPage && browser) {
        goto('/banned');
    }

    beforeNavigate(({ to, cancel }) => {
        if (isBanned && to?.url.pathname !== '/banned') {
            cancel();
            if (!isBannedPage) {
                goto('/banned');
            }
        }
    });

    function initSeasonalTheme() {
        const d = new Date();
        const m = d.getMonth();
        const day = d.getDate();

        if ((m === 9 && day >= 20) || (m === 10 && day <= 2)) {
            themeState = 'halloween';
            sideTextLeft = 'СИСТЕМА: НЕСТАБИЛЬНА';
            sideTextRight = 'АНАЛИЗ АНОМАЛИИ...';
            import('/src/styles/halloween.css');
        }
        else if (m === 11 && day >= 1 && day < 15) {
            themeState = 'winter';
            sideTextLeft = 'ТЕМПЕРАТУРА: -15°C';
            sideTextRight = 'СИСТЕМА ОХЛАЖДЕНИЯ: АКТИВНА';
            import('/src/styles/winter.css');
        }
        else if ((m === 11 && day >= 15) || (m === 0 && day <= 14)) {
            themeState = 'newyear';
            sideTextLeft = 'РЕЖИМ: GLITCHMAS';
            sideTextRight = 'КРИОГЕННЫЕ ПРОТОКОЛЫ: МАКСИМУМ';
            import('/src/styles/winter.css');
            import('/src/styles/newyear.css');
        }
    }

    onMount(async () => {
        injectAnalytics({ mode: dev ? 'development' : 'production' });
        AudioManager.initialize();
        await waitLocale();

        const savedSeasonal = localStorage.getItem('protomap_seasonal_enabled');
        const isSeasonalEnabled = savedSeasonal !== 'false';

        if (isSeasonalEnabled) {
            seasonActiveInSession = true;
            initSeasonalTheme();
        }

        isReady = true;
    });

    $: isMapPage = $page.route.id === '/';

    // Проверяем, есть ли у текущей страницы seoData (для профилей)
    $: seoData = $page.data.seoData;
    $: hasCustomSeo = !!seoData;

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
    <!-- Общие теги -->
    <meta property="og:site_name" content="ProtoMap" />
    <meta property="og:locale" content="ru_RU" />
    <meta name="theme-color" content="#00f0ff" />

    <!-- ВАЖНО: Теперь используем данные из seoData если есть, иначе дефолтные -->
    <title>{hasCustomSeo ? seoData.title : 'ProtoMap - Карта протогенов'}</title>
    <meta name="description" content={hasCustomSeo ? seoData.description : 'Интерактивная карта протогенов с казино, чатом и профилями'} />

    <!-- Open Graph -->
    <meta property="og:type" content={hasCustomSeo ? 'profile' : 'website'} />
    <meta property="og:title" content={hasCustomSeo ? seoData.title : 'ProtoMap - Карта протогенов'} />
    <meta property="og:description" content={hasCustomSeo ? seoData.description : 'Интерактивная карта протогенов с казино, чатом и профилями'} />
    <meta property="og:image" content={hasCustomSeo ? seoData.image : 'https://proto-map.vercel.app/preview.png'} />
    <meta property="og:url" content={hasCustomSeo ? seoData.url : 'https://proto-map.vercel.app'} />

    {#if hasCustomSeo}
        <meta property="og:image:secure_url" content={seoData.image} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="1200" />
    {/if}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={hasCustomSeo ? seoData.title : 'ProtoMap - Карта протогенов'} />
    <meta name="twitter:description" content={hasCustomSeo ? seoData.description : 'Интерактивная карта протогенов с казино, чатом и профилями'} />
    <meta name="twitter:image" content={hasCustomSeo ? seoData.image : 'https://proto-map.vercel.app/preview.png'} />
</svelte:head>

<svelte:body class:seasonal-on={seasonActiveInSession} />

{#if isReady}
    <div
        class="min-h-screen flex flex-col font-sans antialiased relative"
        class:no-scroll-container={isMapPage}
    >
        {#if seasonActiveInSession && (themeState === 'winter' || themeState === 'newyear')}
            <Snowfall />
        {/if}

        {#if !isBanned}
            <div class="side-panel left z-10">
                <div class="v-text">{sideTextLeft}</div>
            </div>
            <div class="side-panel right z-10">
                <div class="v-text">{sideTextRight}</div>
            </div>
        {/if}

        <div class="relative z-20 flex flex-col flex-grow">
            {#if !isBanned}
                <Navbar />
            {/if}

            <main class="flex-grow">
                <slot />
            </main>
        </div>

        <div class="hidden lg:block">
            {#if !isMapPage && !isBanned}
                <Footer />
            {/if}
        </div>

        <Modal />

        {#if !isBanned}
            <ChatWidget />
            <CookieBanner />
            <SplashModal />

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
                {#if $chat.hasUnread}
                    <div class="unread-dot"></div>
                {/if}
            </button>
        {/if}
    </div>
{:else}
    <div class="fixed inset-0 bg-black z-[9999]"></div>
{/if}

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
    .unread-dot {
        position: absolute; top: 0; right: 0;
        width: 14px; height: 14px;
        background: #ff003c; border-radius: 50%;
        border: 2px solid #000;
        box-shadow: 0 0 10px #ff003c;
        animation: pulse-dot 1s infinite;
    }
    @keyframes pulse-dot { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
</style>