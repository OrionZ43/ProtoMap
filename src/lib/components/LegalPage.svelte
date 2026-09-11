<script lang="ts">
    /**
     * Общая оболочка юридических страниц: служебная строка, сам документ и
     * нижняя панель со ссылками на соседние документы.
     *
     * Раньше у каждой страницы была своя копия разметки, и копии разошлись:
     * у Соглашения голубая сетка вместо фирменной жёлтой, заголовок вкладки
     * брался из несуществующего ключа `usage_terms`, а пустое состояние и
     * навигация были захардкожены по-русски, с эмодзи вместо иконки. Третий
     * документ — Политика обработки персональных данных — был бы третьей копией.
     */
    import LegalDocRenderer from '$lib/components/LegalDocRenderer.svelte';
    import { t } from 'svelte-i18n';
    import type { ParsedLegalDoc } from '$lib/server/legalLoader';

    type DocId = 'pd' | 'privacy' | 'terms';

    export let current: DocId;
    export let doc: ParsedLegalDoc;
    export let version = '';
    /** Для <meta name="description">. Страницы закрыты от индексации, текст служебный. */
    export let description = '';

    const DOCS: { id: DocId; href: string; tag: string; title: string; label: string }[] = [
        {
            id: 'pd',
            href: '/personal-data-policy',
            tag: '// PERSONAL_DATA_POLICY.XML',
            title: 'personal_data_policy',
            label: 'legal.page.pd_policy'
        },
        {
            id: 'privacy',
            href: '/privacy-policy',
            tag: '// PRIVACY_POLICY.XML',
            title: 'privacy_policy',
            label: 'legal.page.privacy'
        },
        {
            id: 'terms',
            href: '/terms-of-service',
            tag: '// TERMS_OF_SERVICE.XML',
            title: 'terms_of_service',
            label: 'legal.page.terms'
        }
    ];

    $: me = DOCS.find((d) => d.id === current) ?? DOCS[0];
    $: others = DOCS.filter((d) => d.id !== current);
</script>

<svelte:head>
    <title>{$t(me.title)} | ProtoMap</title>
    {#if description}
        <meta name="description" content={description} />
    {/if}
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="page-wrap">
    <div class="page-bg" aria-hidden="true"></div>

    <article class="legal-container cyber-panel">
        <div class="top-bar">
            <span class="bar-dot" aria-hidden="true"></span>
            <span class="bar-text font-display">{me.tag}</span>
            {#if version}
                <span class="bar-version font-display">{version}</span>
            {/if}
        </div>

        <div class="doc-body">
            {#if doc.nodes.length > 0}
                <LegalDocRenderer nodes={doc.nodes} />
            {:else}
                <div class="empty-state">
                    <!-- Lucide `file-x` (ISC) -->
                    <svg
                        class="empty-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="40"
                        height="40"
                        aria-hidden="true"
                    >
                        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                        <path d="m14.5 12.5-5 5" />
                        <path d="m9.5 12.5 5 5" />
                    </svg>
                    <p class="font-display empty-text">DOCUMENT_NOT_FOUND</p>
                    <p class="empty-sub">{$t('legal.page.not_found')}</p>
                </div>
            {/if}
        </div>

        <nav class="bottom-bar">
            <a href="/" class="nav-link font-display">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    width="13"
                    height="13"
                    aria-hidden="true"
                >
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                {$t('legal.page.back')}
            </a>

            <div class="siblings">
                {#each others as d, i (d.id)}
                    {#if i > 0}
                        <span class="sep" aria-hidden="true">//</span>
                    {/if}
                    <a href={d.href} class="nav-link font-display">
                        {$t(d.label)}
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            width="13"
                            height="13"
                            aria-hidden="true"
                        >
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </a>
                {/each}
            </div>
        </nav>
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
            linear-gradient(rgba(252, 238, 10, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(252, 238, 10, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        pointer-events: none;
    }

    .legal-container {
        position: relative;
        max-width: 960px;
        margin: 0 auto;
        background: rgba(8, 10, 14, 0.92);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(252, 238, 10, 0.18);
        clip-path: polygon(0 16px, 16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
        box-shadow: 0 0 40px rgba(252, 238, 10, 0.05);
    }

    /* ── Служебная строка ─────────────────────────────────────────────── */
    .top-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 1.5rem;
        border-bottom: 1px solid rgba(252, 238, 10, 0.12);
        background: rgba(252, 238, 10, 0.03);
        flex-wrap: wrap;
    }
    .bar-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 0 6px var(--cyber-yellow, #fcee0a);
        flex-shrink: 0;
        animation: dot-pulse 2s infinite;
    }
    @keyframes dot-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.4;
        }
    }
    .bar-text {
        font-size: 0.72rem;
        color: rgba(252, 238, 10, 0.7);
        letter-spacing: 0.18em;
    }
    .bar-version {
        margin-left: auto;
        font-size: 0.65rem;
        color: #6b6b57;
        letter-spacing: 0.12em;
    }

    /* ── Тело ─────────────────────────────────────────────────────────── */
    .doc-body {
        padding: 2.5rem 2.5rem 2rem;
    }
    @media (max-width: 640px) {
        .doc-body {
            padding: 1.5rem 1.1rem;
        }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 4rem 0;
        text-align: center;
    }
    .empty-icon {
        color: rgba(252, 238, 10, 0.4);
    }
    .empty-text {
        font-size: 1rem;
        color: #ff003c;
        letter-spacing: 0.2em;
    }
    .empty-sub {
        font-size: 0.8rem;
        color: #6b7280;
    }

    /* ── Нижняя панель ────────────────────────────────────────────────── */
    .bottom-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem 1.5rem;
        padding: 1rem 1.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.2);
    }
    .siblings {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem 0.9rem;
    }
    /* inline-flex + nowrap: иначе стрелка отрывается от подписи и уезжает
       на свою строку — ровно эту претензию уже высказывали к баннеру */
    .nav-link {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        white-space: nowrap;
        font-size: 0.72rem;
        letter-spacing: 0.14em;
        text-decoration: none;
        color: #6b7280;
        transition:
            color 0.2s,
            text-shadow 0.2s;
    }
    .nav-link svg {
        flex-shrink: 0;
    }
    .nav-link:hover {
        color: var(--cyber-yellow, #fcee0a);
        text-shadow: 0 0 8px rgba(252, 238, 10, 0.3);
    }
    .sep {
        font-size: 0.7rem;
        color: #3f3f46;
    }
</style>
