<!--
    Вместо поля ввода лички, когда переписка закрыта чёрным списком
    (src/lib/stores/blocklist.ts). Собеседник заблокировал меня — прямой текст,
    писать нельзя (это же проверяют правила Firestore и Storage). Я заблокировал
    собеседника — как в Telegram: кнопка «Разблокировать» вместо поля ввода.
-->
<script lang="ts">
    import { t } from 'svelte-i18n';
    import { modal } from '$lib/stores/modalStore';
    import { unblockUser } from '$lib/stores/blocklist';

    export let partnerUid: string;
    /** true — меня заблокировали; false — заблокировал я. */
    export let blockedMe: boolean;

    let busy = false;

    async function unblock() {
        if (busy) return;
        busy = true;
        try {
            await unblockUser(partnerUid);
        } catch (e: any) {
            modal.error($t('ui.error'), e.message);
        } finally {
            busy = false;
        }
    }
</script>

<div class="blocked-notice">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6l12.8 12.8" />
    </svg>
    {#if blockedMe}
        <span>{$t('blocklist.you_are_blocked')}</span>
    {:else}
        <span>{$t('blocklist.you_blocked')}</span>
        <button type="button" class="unblock" on:click={unblock} disabled={busy}>
            {$t('blocklist.unblock')}
        </button>
    {/if}
</div>

<style>
    .blocked-notice {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
        padding: 0.9rem 1rem;
        border-top: 1px solid rgba(55, 65, 81, 0.5);
        color: #9ca3af;
        font-size: 0.85rem;
        text-align: center;
    }

    .icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
    }

    .unblock {
        padding: 0.35rem 0.9rem;
        border: 1px solid var(--cyber-yellow, #fcee0a);
        border-radius: 999px;
        background: transparent;
        color: var(--cyber-yellow, #fcee0a);
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
    }

    .unblock:hover:not(:disabled) {
        background: var(--cyber-yellow, #fcee0a);
        color: #000;
    }

    .unblock:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
