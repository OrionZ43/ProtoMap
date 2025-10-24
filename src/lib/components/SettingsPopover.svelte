<script lang="ts">
    import { settingsStore } from '$lib/stores/settingsStore';
    import { fade } from 'svelte/transition';

    export let close: () => void;
</script>

<div class="popover-overlay" on:click={close} transition:fade={{ duration: 200 }}></div>

<div class="popover-container" transition:fade={{ duration: 150 }}>
    <div class="popover-header">
        <span class="popover-title font-display">//: НАСТРОЙКИ СИСТЕМЫ</span>
    </div>
    <div class="popover-content">
        <label class="setting-toggle">
            <span class="label-text">Звуки интерфейса</span>
            <div>
                <input
                    type="checkbox"
                    bind:checked={$settingsStore.audioEnabled}
                >
                <span class="slider"></span>
            </div>
        </label>
        <hr class="separator"/>
        <label class="setting-toggle">
            <span class="label-text">Анимации загрузки</span>
            <div>
                <input
                    type="checkbox"
                    bind:checked={$settingsStore.cinematicLoadsEnabled}
                >
                <span class="slider"></span>
            </div>
        </label>
    </div>
</div>

<style>
    .popover-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        z-index: 90;
    }
    .popover-container {
        position: absolute;
        top: 120%;
        right: 0;
        width: 320px;
        background: rgba(20, 20, 25, 0.7);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 1rem; /* 16px */
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        z-index: 91;
    }
    .popover-header {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .popover-title {
        color: var(--cyber-yellow);
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
    .popover-content {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .separator {
        border-color: rgba(255,255,255,0.1);
        border-top-width: 1px;
        margin: 0;
    }
</style>