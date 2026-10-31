<script lang="ts">
    import { t } from 'svelte-i18n';
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
                <span>{$t('ui.loading_check')}</span>
            </div>
        {/if}
    </div>
</div>

<style>
    .turnstile-container {
        /* Без рамки/фона-коробки: на экранах входа капча стоит прямо на видео,
           безрамочно. Сам виджет Cloudflare — сторонний iframe со своим тёмным
           оформлением, его убрать нельзя. */
        position: relative;
        display: inline-block;
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
        color: rgb(var(--cyber-yellow-rgb) / 0.8);
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