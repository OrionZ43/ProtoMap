<!-- src/lib/components/admin/Sheet.svelte -->
<!--
    Карточка с подробностями, в которую раскрывается плитка (Tile.svelte): тот
    же ключ в паре send/receive переносит плитку на место карточки. Закрывается
    крестиком, Esc и щелчком по фону; фокус при открытии — на крестик, при
    закрытии страница возвращает его на плитку.
-->
<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { send, receive } from '$lib/admin/morph';

    export let id: string;
    export let title: string;
    export let closeLabel: string;
    /** Цвет карточки — тот же класс t-*, что у плитки. */
    export let tone = '';

    const dispatch = createEventDispatcher<{ close: void }>();
    let closeButton: HTMLButtonElement;

    onMount(() => {
        closeButton?.focus({ preventScroll: true });
        // Страница под карточкой не прокручивается.
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    });

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') dispatch('close');
    }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- Фон — только для щелчка мимо карточки; с клавиатуры закрывают Esc и крестик. -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="sheet-backdrop" transition:fade|global={{ duration: 220 }} on:click={() => dispatch('close')}></div>

<div
    class="sheet {tone}"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sheet-{id}"
    in:receive|global={{ key: id }}
    out:send|global={{ key: id }}
>
    <header class="sheet-head">
        <div class="sheet-title">
            <slot name="eyebrow" />
            <h2 id="sheet-{id}">{title}</h2>
        </div>
        <button bind:this={closeButton} type="button" class="sheet-close" on:click={() => dispatch('close')} aria-label={closeLabel} title={closeLabel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
    </header>
    <div class="sheet-body">
        <slot />
    </div>
</div>

<style>
    .sheet-backdrop {
        position: fixed;
        inset: 0;
        z-index: 60;
        background: rgba(5, 5, 8, 0.62);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    }
    .sheet {
        position: fixed;
        z-index: 61;
        left: 50%;
        top: 50%;
        width: min(920px, calc(100vw - 48px));
        max-height: min(86vh, 900px);
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        border-radius: 28px;
        border: 1px solid var(--line-strong);
        /* Цвет плитки, из которой карточка раскрылась (admin.css, классы t-*). */
        background: var(--tile-bg, none) no-repeat, var(--tile-base, #121216);
        box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55);
        overflow: hidden;
        color: var(--text);
        font-family: var(--body);
    }
    .sheet-head {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 26px 28px 18px;
        border-bottom: 1px solid var(--line);
    }
    .sheet-title {
        flex: 1;
        min-width: 0;
    }
    .sheet-title h2 {
        margin: 6px 0 0;
        font: 400 26px/1.2 var(--display);
        letter-spacing: -0.01em;
    }
    .sheet-close {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid var(--line-strong);
        background: rgba(255, 255, 255, 0.04);
        color: var(--soft);
        display: grid;
        place-items: center;
        cursor: pointer;
        flex-shrink: 0;
        transition: color 0.2s ease, background 0.2s ease;
    }
    .sheet-close:hover {
        color: var(--text);
        background: rgba(255, 255, 255, 0.08);
    }
    .sheet-close svg {
        width: 18px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
    }
    .sheet-body {
        padding: 20px 28px 28px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    }

    /* На телефоне — почти во весь экран. */
    @media (max-width: 640px) {
        .sheet {
            left: 0;
            right: 0;
            top: auto;
            bottom: 0;
            width: 100%;
            max-height: 92vh;
            transform: none;
            border-radius: 24px 24px 0 0;
        }
        .sheet-head {
            padding: 20px 18px 14px;
        }
        .sheet-body {
            padding: 16px 18px 24px;
        }
        .sheet-title h2 {
            font-size: 21px;
        }
    }
</style>
