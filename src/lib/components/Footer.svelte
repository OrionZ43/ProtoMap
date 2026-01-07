<script lang="ts">
    export let mode: 'fixed' | 'menu' = 'fixed';
    import { t } from 'svelte-i18n';
    const currentYear = new Date().getFullYear();
</script>

<div class:legal-ticker={mode === 'fixed'} class:menu-links={mode === 'menu'}>
    {#if mode === 'menu'}
        <a href="/privacy-policy">{$t('footer.policy')}</a>
        <a href="/terms-of-service">{$t('footer.terms')}</a>
        <span>© {currentYear} {$t('footer.rights')}</span>
    {:else}
        <p>© {currentYear} {$t('footer.rights')}</p>
        <div class="links">
            <a href="/privacy-policy">{$t('footer.policy')}</a>
            <span>//</span>
            <a href="/terms-of-service">{$t('footer.terms')}</a>
        </div>
    {/if}
</div>

<style>
    .legal-ticker {
        position: fixed;
        bottom: 1rem;
        left: 1rem;
        z-index: 40;
        font-family: 'Chakra Petch', monospace;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.3);
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        background: rgba(10, 10, 10, 0.3);
        padding: 0.5rem 0.75rem;
        border-radius: 4px;
        backdrop-filter: blur(4px);
        pointer-events: auto;
        transition: color 0.3s, background 0.3s, left 0.3s ease-out;
    }
    .legal-ticker:hover {
        color: rgba(255, 255, 255, 0.7);
        background: rgba(10, 10, 10, 0.5);
    }
    .legal-ticker .links {
        display: flex;
        gap: 0.5rem;
    }
    .legal-ticker .links a {
        color: inherit;
        text-decoration: none;
        text-transform: uppercase;
    }
    .legal-ticker .links a:hover {
        color: var(--cyber-yellow, #fcee0a);
        text-decoration: underline;
    }

    @media (min-width: 1024px) {
        .legal-ticker {
            left: calc(75px + 1rem);
        }
    }

    .menu-links {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.4);
    }
    .menu-links a {
        color: inherit;
        text-decoration: none;
    }
    .menu-links a:hover {
        color: #fff;
    }
</style>