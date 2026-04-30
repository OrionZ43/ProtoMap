<script lang="ts">
    import LegalDocRenderer from '$lib/components/LegalDocRenderer.svelte';
    import { t } from 'svelte-i18n';
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<svelte:head>
    <title>{$t('usage_terms')} | ProtoMap</title>
    <meta name="description" content="ProtoMap Terms of Service / End User License Agreement" />
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="page-wrap">
    <div class="page-bg" aria-hidden="true"></div>

    <article class="legal-container cyber-panel">
        <div class="top-bar">
            <span class="bar-dot"></span>
            <span class="bar-text font-display">// TERMS_OF_SERVICE.XML</span>
            {#if data.version}
                <span class="bar-version font-display">{data.version}</span>
            {/if}
        </div>

        <div class="doc-body">
            {#if data.doc.nodes.length > 0}
                <LegalDocRenderer nodes={data.doc.nodes} />
            {:else}
                <div class="empty-state">
                    <div class="empty-icon">📡</div>
                    <p class="font-display empty-text">DOCUMENT_NOT_FOUND</p>
                    <p class="empty-sub">Документ временно недоступен. Попробуйте позже.</p>
                </div>
            {/if}
        </div>

        <div class="bottom-bar">
            <a href="/" class="back-link font-display">← ВЕРНУТЬСЯ НА КАРТУ</a>
            <a href="/privacy-policy" class="sibling-link font-display">
                ← ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ
            </a>
        </div>
    </article>
</div>

<style>
    .page-wrap {
        min-height: 100vh;
        position: relative;
        padding: 2rem 1rem 5rem;
        overflow: hidden;
    }

    .page-bg {
        position: fixed;
        inset: 0;
        z-index: -1;
        background-image:
            linear-gradient(rgba(0, 240, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px);
        background-size: 40px 40px;
        pointer-events: none;
    }

    .legal-container {
        position: relative;
        max-width: 860px;
        margin: 0 auto;
        background: rgba(8, 10, 14, 0.92);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(0, 240, 255, 0.15);
        clip-path: polygon(0 16px, 16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
        box-shadow: 0 0 40px rgba(0, 240, 255, 0.04);
    }

    .top-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 1.5rem;
        border-bottom: 1px solid rgba(0, 240, 255, 0.1);
        background: rgba(0, 240, 255, 0.02);
        flex-wrap: wrap;
    }
    .bar-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--cyber-cyan, #00f0ff);
        box-shadow: 0 0 6px var(--cyber-cyan, #00f0ff);
        flex-shrink: 0;
        animation: dot-pulse 2s infinite;
    }
    @keyframes dot-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
    }
    .bar-text {
        font-size: 0.72rem;
        color: rgba(0, 240, 255, 0.65);
        letter-spacing: 0.18em;
    }
    .bar-version {
        margin-left: auto;
        font-size: 0.65rem;
        color: #475569;
        letter-spacing: 0.12em;
    }

    .doc-body {
        padding: 2.5rem 2.5rem 2rem;
    }
    @media (max-width: 640px) {
        .doc-body { padding: 1.5rem 1.25rem 1.5rem; }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 4rem 0;
        text-align: center;
    }
    .empty-icon { font-size: 2.5rem; opacity: 0.4; }
    .empty-text { font-size: 1rem; color: #ff003c; letter-spacing: 0.2em; }
    .empty-sub  { font-size: 0.8rem; color: #475569; }

    .bottom-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.2);
    }
    .back-link,
    .sibling-link {
        font-size: 0.72rem;
        letter-spacing: 0.14em;
        text-decoration: none;
        color: #475569;
        transition: color 0.2s, text-shadow 0.2s;
    }
    .back-link:hover    { color: var(--cyber-yellow, #fcee0a); text-shadow: 0 0 8px rgba(252,238,10,0.3); }
    .sibling-link:hover { color: var(--cyber-cyan, #00f0ff);   text-shadow: 0 0 8px rgba(0,240,255,0.3); }
</style>