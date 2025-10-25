<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { browser } from '$app/environment';

    const COOKIE_CONSENT_KEY = 'protomap_cookie_consent';
    let showBanner = false;

    onMount(() => {
        const consentGiven = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!consentGiven) {
            showBanner = true;
        }
    });

    function acceptCookies() {
        if (browser) {
            localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
        }
        showBanner = false;
    }
</script>

{#if showBanner}
    <div class="cookie-banner" transition:fade={{ duration: 300 }}>
        <p class="banner-text">
            Мы используем файлы cookie для сохранения вашей сессии и настроек. Оставаясь на сайте, вы соглашаетесь с нашей <a href="/privacy-policy">Политикой Конфиденциальности</a>.
        </p>
        <button class="accept-btn font-display" on:click={acceptCookies}>
            Принять
        </button>
    </div>
{/if}

<style>
    .cookie-banner {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        z-index: 100;

        max-width: 380px;
        padding: 1rem;

        display: flex;
        align-items: center;
        gap: 1rem;

        /* Используем наш любимый glass-эффект */
        background: rgba(20, 20, 25, 0.7);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: var(--border-radius, 8px);
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }

    .banner-text {
        font-size: 0.875rem; /* 14px */
        color: var(--text-muted-color, #909dab);
        line-height: 1.5;
    }

    .banner-text a {
        color: var(--cyber-yellow, #fcee0a);
        text-decoration: underline;
        transition: color 0.2s;
    }
    .banner-text a:hover {
        color: #fff;
    }

    .accept-btn {
        flex-shrink: 0;
        padding: 0.5rem 1rem;
        border: 1px solid var(--cyber-yellow, #fcee0a);
        color: var(--cyber-yellow, #fcee0a);
        background: transparent;
        border-radius: 4px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s;
    }
    .accept-btn:hover {
        background: var(--cyber-yellow, #fcee0a);
        color: #111;
        box-shadow: 0 0 15px var(--cyber-yellow, #fcee0a);
    }

    @media (max-width: 640px) {
        .cookie-banner {
            bottom: 0;
            left: 0;
            right: 0;
            max-width: 100%;
            border-radius: 0;
            padding: 0.75rem;
            gap: 0.5rem;
            flex-direction: column;
            align-items: stretch;
            text-align: center;
        }
        .accept-btn {
            padding: 0.75rem;
        }
    }
</style>