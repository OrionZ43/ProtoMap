<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, scale } from 'svelte/transition';
    import { t } from 'svelte-i18n';

    let isVisible = false;

    onMount(() => {
        const hasSeenModal = localStorage.getItem('seenAiPolicyModal_v1');
        if (!hasSeenModal) {
            isVisible = true;
        }
    });

    function closeModal() {
        isVisible = false;
        localStorage.setItem('seenAiPolicyModal_v1', 'true');
    }
</script>

{#if isVisible}
    <div
        class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        transition:fade={{ duration: 300 }}
    >
        <div class="modal-container cyber-panel max-w-lg w-full relative" transition:scale={{ duration: 250, start: 0.95 }}>
            <div class="corner-bg top-left is-error"></div>
            <div class="corner-bg bottom-right is-error"></div>

            <div class="p-8 text-center">
                <h2 class="title font-display">{$t('splash_modal.title')}</h2>
                <p class="subtitle">{$t('splash_modal.intro')}</p>

                <ul class="points-list">
                    <li><span>1.</span> {$t('splash_modal.point1')}</li>
                    <li><span>2.</span> {$t('splash_modal.point2')}</li>
                    <li><span>3.</span> {$t('splash_modal.point3')}</li>
                </ul>

                <div class="actions">
                    <a href="/ai-policy" class="details-link" on:click={closeModal}>{$t('splash_modal.link_text')}</a>
                    <button class="close-btn" on:click={closeModal}>{$t('splash_modal.close_btn')}</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-container {
        background: rgba(15, 5, 10, 0.9);
        border: 1px solid var(--cyber-red, #ff003c);
        box-shadow: 0 0 30px rgba(255, 0, 60, 0.3);
    }
    .corner-bg { position: absolute; width: 80px; height: 80px; opacity: 0.2; filter: blur(10px); }
    .is-error { background: radial-gradient(circle, var(--cyber-red) 0%, transparent 70%); }
    .top-left { top: -40px; left: -40px; }
    .bottom-right { bottom: -40px; right: -40px; }

    .title { font-size: 1.8rem; color: var(--cyber-red); margin-bottom: 0.5rem; }
    .subtitle { color: #aaa; font-family: 'Chakra Petch', monospace; margin-bottom: 2rem; }

    .points-list {
        text-align: left;
        color: #ddd;
        font-size: 0.9rem;
        line-height: 1.6;
        margin: 0 auto 2.5rem auto;
        max-width: 90%;
    }
    .points-list li {
        position: relative;
        padding-left: 2rem;
        margin-bottom: 1rem;
    }
    .points-list li span {
        position: absolute;
        left: 0;
        top: 0;
        font-weight: bold;
        color: var(--cyber-red);
    }

    .actions {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        align-items: center;
    }
    .details-link {
        color: var(--cyber-yellow);
        text-decoration: underline;
        font-weight: bold;
        transition: color 0.2s;
    }
    .details-link:hover { color: #fff; }

    .close-btn {
        background: var(--cyber-red);
        color: #fff;
        padding: 0.6rem 2rem;
        border-radius: 4px;
        font-family: 'Chakra Petch', monospace;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        transition: all 0.2s;
    }
    .close-btn:hover {
        box-shadow: 0 0 15px var(--cyber-red);
        transform: scale(1.05);
    }
</style>