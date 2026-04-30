<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { t } from 'svelte-i18n';
    import type { LegalVersions } from '$lib/server/legalLoader';

    // Versions from server (passed via layout data)
    export let versions: LegalVersions | null = null;

    // ── Storage keys ──────────────────────────────────────────────────────
    const KEY_PRIVACY = 'protomap_legal_privacy_version';
    const KEY_TOS     = 'protomap_legal_tos_version';

    // ── State ─────────────────────────────────────────────────────────────
    let visible           = false;
    let privacyOutdated   = false;
    let tosOutdated       = false;
    let acceptInProgress  = false;

    onMount(() => {
        if (!browser || !versions) return;

        const savedPrivacy = localStorage.getItem(KEY_PRIVACY) ?? '';
        const savedTos     = localStorage.getItem(KEY_TOS)     ?? '';

        privacyOutdated = !!versions.privacy && versions.privacy !== savedPrivacy;
        tosOutdated     = !!versions.tos     && versions.tos     !== savedTos;

        visible = privacyOutdated || tosOutdated;
    });

    function accept() {
        if (!browser || !versions) return;
        acceptInProgress = true;

        if (versions.privacy) localStorage.setItem(KEY_PRIVACY, versions.privacy);
        if (versions.tos)     localStorage.setItem(KEY_TOS,     versions.tos);

        // Small delay for button feedback, then dismiss
        setTimeout(() => {
            visible          = false;
            acceptInProgress = false;
        }, 350);
    }
</script>

{#if visible}
    <div
        class="legal-banner"
        role="dialog"
        aria-live="polite"
        aria-label="Обновление юридических документов"
        transition:slide={{ duration: 320 }}
    >
        <!-- Animated corner accents -->
        <div class="corner-tl" aria-hidden="true"></div>
        <div class="corner-br" aria-hidden="true"></div>

        <!-- Scanline overlay -->
        <div class="scanline" aria-hidden="true"></div>

        <div class="banner-inner">
            <!-- Icon + Text -->
            <div class="banner-left">
                <span class="banner-icon" aria-hidden="true">⚖</span>
                <div class="banner-text">
                    <span class="banner-title font-display">// LEGAL_UPDATE</span>
                    <p class="banner-body">
                        {#if privacyOutdated && tosOutdated}
                            Политика конфиденциальности и Условия использования обновились.
                            Ознакомьтесь с изменениями.
                        {:else if privacyOutdated}
                            Политика конфиденциальности обновилась.
                            Ознакомьтесь с изменениями.
                        {:else}
                            Условия использования (EULA) обновились.
                            Ознакомьтесь с изменениями.
                        {/if}
                    </p>
                    <!-- Links to the relevant docs -->
                    <div class="banner-links">
                        {#if privacyOutdated}
                            <a href="/privacy-policy" class="doc-link">
                                Политика конфиденциальности →
                            </a>
                        {/if}
                        {#if tosOutdated}
                            <a href="/terms-of-service" class="doc-link">
                                Условия использования →
                            </a>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Accept button -->
            <button
                class="accept-btn font-display"
                on:click={accept}
                disabled={acceptInProgress}
                aria-label="Принять обновлённые документы"
            >
                {#if acceptInProgress}
                    <span class="btn-spinner" aria-hidden="true"></span>
                {:else}
                    ПРИНЯТЬ
                {/if}
            </button>
        </div>
    </div>
{/if}

<style>
    .legal-banner {
        position: fixed;
        bottom: 1.25rem;
        left: 50%;
        transform: translateX(-50%);
        width: min(96vw, 660px);
        z-index: 200;

        background: rgba(10, 10, 15, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);

        border: 1px solid rgba(252, 238, 10, 0.35);
        box-shadow:
            0 0 30px rgba(252, 238, 10, 0.08),
            0 8px 32px rgba(0, 0, 0, 0.6);

        clip-path: polygon(
            0 12px, 12px 0, 100% 0,
            100% calc(100% - 12px),
            calc(100% - 12px) 100%,
            0 100%
        );

        overflow: hidden;
    }

    /* ── Decorative corners ────────────────────────────────────────────── */
    .corner-tl,
    .corner-br {
        position: absolute;
        width: 14px;
        height: 14px;
        pointer-events: none;
    }
    .corner-tl {
        top: 0; left: 0;
        border-top: 2px solid var(--cyber-yellow, #fcee0a);
        border-left: 2px solid var(--cyber-yellow, #fcee0a);
    }
    .corner-br {
        bottom: 0; right: 0;
        border-bottom: 2px solid var(--cyber-yellow, #fcee0a);
        border-right:  2px solid var(--cyber-yellow, #fcee0a);
    }

    /* ── Scanline ──────────────────────────────────────────────────────── */
    .scanline {
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 2px;
        background: linear-gradient(
            to right,
            transparent,
            rgba(252, 238, 10, 0.6),
            transparent
        );
        animation: scan-move 4s linear infinite;
        pointer-events: none;
    }
    @keyframes scan-move {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(100%);  }
    }

    /* ── Inner layout ──────────────────────────────────────────────────── */
    .banner-inner {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem 1.25rem;
        flex-wrap: wrap;
    }

    .banner-left {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        flex: 1;
        min-width: 0;
    }

    .banner-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
        filter: drop-shadow(0 0 6px rgba(252, 238, 10, 0.4));
        animation: icon-pulse 3s infinite ease-in-out;
    }
    @keyframes icon-pulse {
        0%, 100% { transform: scale(1);    }
        50%      { transform: scale(1.12); }
    }

    .banner-text {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;
    }

    .banner-title {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        letter-spacing: 0.22em;
        text-shadow: 0 0 6px rgba(252, 238, 10, 0.3);
    }

    .banner-body {
        font-size: 0.82rem;
        color: #94a3b8;
        line-height: 1.55;
        margin: 0;
    }

    .banner-links {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 0.1rem;
    }

    .doc-link {
        font-family: 'Chakra Petch', monospace;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--cyber-cyan, #00f0ff);
        text-decoration: none;
        border-bottom: 1px dashed rgba(0, 240, 255, 0.35);
        transition: color 0.2s, border-color 0.2s, text-shadow 0.2s;
    }
    .doc-link:hover {
        color: #fff;
        border-bottom-color: #fff;
        text-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
    }

    /* ── Accept button ─────────────────────────────────────────────────── */
    .accept-btn {
        flex-shrink: 0;
        padding: 0.6rem 1.5rem;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #000;
        background: var(--cyber-yellow, #fcee0a);
        border: none;
        clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);
        cursor: pointer;
        transition: box-shadow 0.2s, background 0.2s, transform 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 100px;
    }
    .accept-btn:hover:not(:disabled) {
        background: #fff;
        box-shadow: 0 0 18px rgba(252, 238, 10, 0.45);
        transform: translateY(-1px);
    }
    .accept-btn:active:not(:disabled) {
        transform: translateY(0);
    }
    .accept-btn:disabled {
        opacity: 0.6;
        cursor: wait;
    }

    /* ── Spinner ───────────────────────────────────────────────────────── */
    .btn-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-top-color: #000;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Mobile ────────────────────────────────────────────────────────── */
    @media (max-width: 520px) {
        .legal-banner {
            bottom: 0;
            left: 0;
            right: 0;
            transform: none;
            width: 100%;
            border-radius: 0;
            clip-path: none;
        }
        .accept-btn {
            width: 100%;
            clip-path: none;
        }
    }
</style>