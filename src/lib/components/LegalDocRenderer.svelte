<script lang="ts">
    import { locale } from 'svelte-i18n';
    import type { LegalNode, LocalizedText } from '$lib/server/legalLoader';

    export let nodes: LegalNode[] = [];

    // Derive active language from svelte-i18n locale
    $: lang = ($locale ?? 'ru').startsWith('ru') ? 'ru' : 'en';
    $: t    = (text: LocalizedText): string => text[lang as 'ru' | 'en'] || text.ru || text.en;

    // Alert severity → visual config
    const SEVERITY = {
        info: {
            border: 'rgba(0, 240, 255, 0.35)',
            bg:     'rgba(0, 240, 255, 0.05)',
            glow:   'rgba(0, 240, 255, 0.15)',
            accent: '#00f0ff',
            label:  'ℹ',
        },
        warning: {
            border: 'rgba(252, 238, 10, 0.40)',
            bg:     'rgba(252, 238, 10, 0.05)',
            glow:   'rgba(252, 238, 10, 0.12)',
            accent: '#fcee0a',
            label:  '⚠',
        },
        error: {
            border: 'rgba(255, 0, 60, 0.40)',
            bg:     'rgba(255, 0, 60, 0.06)',
            glow:   'rgba(255, 0, 60, 0.15)',
            accent: '#ff003c',
            label:  '✕',
        },
    } as const;
</script>

<div class="legal-doc">
    {#each nodes as node (node)}
        <!-- TITLE ─────────────────────────────────────────────────────────── -->
        {#if node.type === 'title'}
            <h1 class="doc-title font-display glitch" data-text={t(node.text)}>
                {t(node.text)}
            </h1>

        <!-- SECTION ─────────────────────────────────────────────────────── -->
        {:else if node.type === 'section'}
            <h2 class="doc-section font-display">{t(node.text)}</h2>

        <!-- SUBSECTION ──────────────────────────────────────────────────── -->
        {:else if node.type === 'subsection'}
            <h3 class="doc-subsection font-display">{t(node.text)}</h3>

        <!-- PARAGRAPH ───────────────────────────────────────────────────── -->
        {:else if node.type === 'paragraph'}
            <p class="doc-paragraph">{t(node.text)}</p>

        <!-- BULLET ──────────────────────────────────────────────────────── -->
        {:else if node.type === 'bullet'}
            <div class="doc-bullet">
                <span class="bullet-arrow" aria-hidden="true">&gt;</span>
                <span class="bullet-text">{t(node.text)}</span>
            </div>

        <!-- ALERT ───────────────────────────────────────────────────────── -->
        {:else if node.type === 'alert'}
            {@const s = SEVERITY[node.severity] ?? SEVERITY.info}
            <div
                class="doc-alert"
                style="
                    border-color: {s.border};
                    background: {s.bg};
                    box-shadow: 0 0 20px {s.glow};
                "
            >
                <div class="alert-header">
                    <span class="alert-icon" style="color: {s.accent};" aria-hidden="true">
                        {s.label}
                    </span>
                    <span class="alert-title font-display" style="color: {s.accent};">
                        {t(node.title)}
                    </span>
                </div>
                {#if t(node.text)}
                    <p class="alert-body">{t(node.text)}</p>
                {/if}
                <div class="alert-left-bar" style="background: {s.accent};"></div>
            </div>

        <!-- HIGHLIGHT ───────────────────────────────────────────────────── -->
        {:else if node.type === 'highlight'}
            <div class="doc-highlight">
                <div class="highlight-title font-display">{node.title}</div>
                <p class="highlight-desc">{t(node.description)}</p>
            </div>

        <!-- CONTACT ─────────────────────────────────────────────────────── -->
        {:else if node.type === 'contact'}
            <div class="doc-contact">
                <span class="contact-icon" aria-hidden="true">📡</span>
                <a href="mailto:{node.email}" class="contact-email font-display">
                    {node.email}
                </a>
            </div>
        {/if}
    {/each}
</div>

<style>
    .legal-doc {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    /* ── TITLE ─────────────────────────────────────────────────────────── */
    .doc-title {
        font-size: clamp(1.6rem, 4vw, 2.5rem);
        font-weight: 900;
        color: var(--cyber-yellow, #fcee0a);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        text-align: center;
        margin-bottom: 2.5rem;
        padding-bottom: 1.25rem;
        border-bottom: 1px solid rgba(252, 238, 10, 0.25);
        text-shadow: 0 0 20px rgba(252, 238, 10, 0.35);
        /* Glitch effect reuse from app.css */
        position: relative;
    }
    .doc-title.glitch::before {
        content: attr(data-text);
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        color: var(--cyber-yellow, #fcee0a);
        text-shadow: -2px 0 var(--cyber-red, #ff003c);
        clip-path: inset(40% 0 50% 0);
        animation: title-glitch 6s infinite linear alternate-reverse;
    }
    .doc-title.glitch::after {
        content: attr(data-text);
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        color: var(--cyber-yellow, #fcee0a);
        text-shadow: 2px 0 var(--cyber-cyan, #00f0ff);
        clip-path: inset(60% 0 20% 0);
        animation: title-glitch 8s 0.3s infinite linear alternate-reverse;
    }
    @keyframes title-glitch {
        0%   { clip-path: inset(40% 0 50% 0); transform: translateX(-1px); }
        20%  { clip-path: inset(10% 0 80% 0); transform: translateX(1px);  }
        40%  { clip-path: inset(70% 0 10% 0); transform: translateX(-1px); }
        60%  { clip-path: inset(25% 0 65% 0); transform: translateX(0px);  }
        80%  { clip-path: inset(85% 0 5%  0); transform: translateX(1px);  }
        100% { clip-path: inset(40% 0 50% 0); transform: translateX(-1px); }
    }

    /* ── SECTION ───────────────────────────────────────────────────────── */
    .doc-section {
        font-size: 1rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        text-transform: uppercase;
        letter-spacing: 0.18em;
        margin-top: 2.5rem;
        margin-bottom: 1rem;
        padding: 0.6rem 0 0.6rem 1rem;
        border-left: 3px solid var(--cyber-yellow, #fcee0a);
        background: linear-gradient(to right, rgba(252, 238, 10, 0.06), transparent);
        text-shadow: 0 0 8px rgba(252, 238, 10, 0.3);
    }

    /* ── SUBSECTION ────────────────────────────────────────────────────── */
    .doc-subsection {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--cyber-cyan, #00f0ff);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin-top: 1.75rem;
        margin-bottom: 0.75rem;
        padding-left: 0.5rem;
        border-left: 2px solid rgba(0, 240, 255, 0.4);
        text-shadow: 0 0 6px rgba(0, 240, 255, 0.25);
    }

    /* ── PARAGRAPH ─────────────────────────────────────────────────────── */
    .doc-paragraph {
        font-size: 0.9rem;
        color: #cbd5e1;
        line-height: 1.75;
        margin-bottom: 0.85rem;
    }

    /* ── BULLET ────────────────────────────────────────────────────────── */
    .doc-bullet {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        margin-bottom: 0.6rem;
        padding-left: 0.5rem;
    }
    .bullet-arrow {
        flex-shrink: 0;
        font-family: 'Chakra Petch', monospace;
        font-weight: 900;
        font-size: 0.8rem;
        color: var(--cyber-yellow, #fcee0a);
        text-shadow: 0 0 6px rgba(252, 238, 10, 0.4);
        margin-top: 0.18rem;
        user-select: none;
    }
    .bullet-text {
        font-size: 0.88rem;
        color: #94a3b8;
        line-height: 1.65;
        flex: 1;
    }

    /* ── ALERT ─────────────────────────────────────────────────────────── */
    .doc-alert {
        position: relative;
        border: 1px solid;
        border-radius: 2px;
        padding: 1rem 1.25rem 1rem 1.5rem;
        margin: 1.25rem 0;
        overflow: hidden;
    }
    .alert-left-bar {
        position: absolute;
        top: 0; left: 0;
        width: 3px;
        height: 100%;
    }
    .alert-header {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 0.5rem;
    }
    .alert-icon {
        font-size: 1rem;
        flex-shrink: 0;
    }
    .alert-title {
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        line-height: 1.3;
    }
    .alert-body {
        font-size: 0.85rem;
        color: #94a3b8;
        line-height: 1.65;
        padding-left: 1.5rem;
        margin: 0;
    }

    /* ── HIGHLIGHT ─────────────────────────────────────────────────────── */
    .doc-highlight {
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-left: 3px solid rgba(0, 240, 255, 0.35);
        padding: 0.9rem 1.1rem;
        margin-bottom: 0.6rem;
        transition: border-color 0.2s, background 0.2s;
    }
    .doc-highlight:hover {
        border-color: rgba(0, 240, 255, 0.25);
        border-left-color: var(--cyber-cyan, #00f0ff);
        background: rgba(0, 240, 255, 0.04);
    }
    .highlight-title {
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--cyber-cyan, #00f0ff);
        letter-spacing: 0.06em;
        margin-bottom: 0.35rem;
        text-shadow: 0 0 5px rgba(0, 240, 255, 0.2);
    }
    .highlight-desc {
        font-size: 0.82rem;
        color: #64748b;
        line-height: 1.6;
        margin: 0;
    }

    /* ── CONTACT ───────────────────────────────────────────────────────── */
    .doc-contact {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-top: 1.5rem;
        padding: 1rem 1.5rem;
        background: rgba(252, 238, 10, 0.04);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
    }
    .contact-icon {
        font-size: 1.25rem;
    }
    .contact-email {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        text-decoration: none;
        letter-spacing: 0.06em;
        transition: all 0.2s;
    }
    .contact-email:hover {
        color: #fff;
        text-shadow: 0 0 12px var(--cyber-yellow, #fcee0a);
    }
</style>