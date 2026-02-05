<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';

    export let siteKey: string;

    const dispatch = createEventDispatcher();

    let container: HTMLDivElement;
    let widgetId: string | null = null;
    let isLoaded = false;

    // Загружаем скрипт Cloudflare
    onMount(() => {
        // Проверяем, не загружен ли уже скрипт
        if (window.turnstile) {
            renderWidget();
            return;
        }

        // Загружаем скрипт Turnstile
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;

        script.onload = () => {
            console.log('✅ Turnstile загружен');
            renderWidget();
        };

        script.onerror = () => {
            console.error('❌ Не удалось загрузить Turnstile');
        };

        document.head.appendChild(script);

        return () => {
            // Cleanup при размонтировании
            if (widgetId && window.turnstile) {
                window.turnstile.remove(widgetId);
            }
        };
    });

    function renderWidget() {
        if (!container || !window.turnstile) return;

        widgetId = window.turnstile.render(container, {
            sitekey: siteKey,
            theme: 'dark',
            callback: (token: string) => {
                console.log('✅ Turnstile пройден');
                dispatch('verified', { token });
            },
            'error-callback': () => {
                console.error('❌ Turnstile ошибка');
                dispatch('error');
            },
            'expired-callback': () => {
                console.warn('⚠️ Turnstile истёк');
                dispatch('expired');
            }
        });

        isLoaded = true;
    }
</script>

<div class="turnstile-container">
    <div bind:this={container} class="cf-turnstile-placeholder">
        {#if !isLoaded}
            <div class="loading">
                <span>Загрузка проверки...</span>
            </div>
        {/if}
    </div>
</div>

<style>
    .turnstile-container {
        /* Киберпанк-обёртка */
        position: relative;
        display: inline-block;
        padding: 10px;
        background: rgba(10, 10, 10, 0.5);
        border: 1px solid rgba(252, 238, 10, 0.3);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);

        /* Срезанные углы */
        clip-path: polygon(
            0 10px,
            10px 0,
            100% 0,
            100% calc(100% - 10px),
            calc(100% - 10px) 100%,
            0 100%
        );

        transition: border-color 0.3s ease;
    }

    .turnstile-container:hover {
        border-color: rgba(252, 238, 10, 0.6);
    }

    .cf-turnstile-placeholder {
        min-width: 300px;
        min-height: 65px;
    }

    .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 65px;
        color: rgba(252, 238, 10, 0.8);
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    /* Глобальные стили для iframe Cloudflare */
    :global(.cf-turnstile) {
        margin: 0 auto;
    }
</style>