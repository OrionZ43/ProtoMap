<script lang="ts">
    import { fade, scale } from 'svelte/transition';
    import { settingsStore } from '$lib/stores/settingsStore';
    import { t, locale } from 'svelte-i18n';
    import { createEventDispatcher } from 'svelte';
    import { browser } from '$app/environment';

    const dispatch = createEventDispatcher();

    function close() {
        dispatch('close');
    }

    function changeLang(newLang: string) {
        locale.set(newLang);
        localStorage.setItem('protomap_lang', newLang);
    }

    function handleSeasonalChange() {
        // Даем время стору обновить localStorage перед перезагрузкой
        setTimeout(() => {
            if (browser) {
                window.location.reload();
            }
        }, 200);
    }
</script>

<div
    class="fixed top-0 left-0 w-screen h-[100dvh] z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    transition:fade
    on:click|self={close}
>
    <div class="settings-panel cyber-panel" transition:scale={{start: 0.95}}>
        <div class="panel-header">
            <h3 class="font-display text-xl text-white">// {$t('menu.system')}</h3>
            <button class="close-btn" on:click={close}>&times;</button>
        </div>

        <div class="panel-body">
            <div class="setting-row">
                <span class="label">{$t('menu.lang')}</span>
                <div class="lang-switch">
                    <button class="lang-btn" class:active={$locale === 'ru'} on:click={() => changeLang('ru')}>RU</button>
                    <button class="lang-btn" class:active={$locale === 'en'} on:click={() => changeLang('en')}>EN</button>
                </div>
            </div>

            <hr class="separator">

            <label class="setting-row">
                <span class="label">{$t('menu.sound')}</span>
                <input type="checkbox" bind:checked={$settingsStore.audioEnabled} class="cyber-switch">
            </label>

            <label class="setting-row">
                <span class="label">{$t('menu.anim')}</span>
                <input type="checkbox" bind:checked={$settingsStore.cinematicLoadsEnabled} class="cyber-switch">
            </label>

            <label class="setting-row">
                <span class="label">{$t('menu.seasonal')} <span class="text-xs text-red-400 ml-1">(RELOAD)</span></span>
                <input
                    type="checkbox"
                    bind:checked={$settingsStore.seasonalEnabled}
                    on:change={handleSeasonalChange}
                    class="cyber-switch"
                >
            </label>
        </div>

        <div class="panel-footer">
            <button class="save-btn" on:click={close}>OK</button>
        </div>
    </div>
</div>

<style>
    .settings-panel {
        width: 100%; max-width: 400px;
        background: rgba(10, 15, 20, 0.95);
        border: 1px solid var(--cyber-cyan);
        box-shadow: 0 0 30px rgba(0, 240, 255, 0.15);
        border-radius: 12px; overflow: hidden;
    }

    .panel-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1);
        background: rgba(0, 243, 255, 0.05);
    }
    .close-btn { font-size: 1.5rem; color: #666; transition: color 0.2s; line-height: 1; }
    .close-btn:hover { color: #fff; }

    .panel-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.2rem; }

    .setting-row { display: flex; justify-content: space-between; align-items: center; }
    .label { font-family: 'Chakra Petch', monospace; font-weight: bold; color: #ccc; font-size: 0.9rem; }

    .separator { border: 0; border-top: 1px dashed rgba(255,255,255,0.1); margin: 0.5rem 0; }

    .lang-switch { display: flex; background: #222; border-radius: 6px; padding: 2px; border: 1px solid #444; }
    .lang-btn {
        padding: 4px 12px; font-size: 0.8rem; font-weight: bold; color: #888; border-radius: 4px;
        transition: all 0.2s;
    }
    .lang-btn.active { background: var(--cyber-cyan); color: #000; box-shadow: 0 0 10px var(--cyber-cyan); }

    .panel-footer { padding: 1rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; }
    .save-btn {
        width: 100%; padding: 0.8rem; background: transparent; border: 1px solid var(--cyber-cyan);
        color: var(--cyber-cyan); font-weight: bold; font-family: 'Chakra Petch', monospace;
        text-transform: uppercase; transition: all 0.2s; cursor: pointer;
    }
    .save-btn:hover { background: var(--cyber-cyan); color: #000; box-shadow: 0 0 15px var(--cyber-cyan); }

    .cyber-switch { appearance: none; width: 44px; height: 24px; background: #333; border-radius: 99px; position: relative; cursor: pointer; transition: all 0.3s; border: 1px solid #555; }
    .cyber-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: #888; border-radius: 50%; transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1); }
    .cyber-switch:checked { background: rgba(0, 240, 255, 0.2); border-color: var(--cyber-cyan); }
    .cyber-switch:checked::after { left: 22px; background: var(--cyber-cyan); box-shadow: 0 0 10px var(--cyber-cyan); }
</style>