<script lang="ts">
    export let href: string | null = null;
    export let type: 'button' | 'submit' | 'reset' = 'button';
    export let disabled = false;
    export let extraClass: string = '';
</script>

{#if href}
    <a {href} class="neon-btn {extraClass}" class:disabled>
    <span class="btn-content"><slot /></span>

    </a>
{:else}
    <button {type} {disabled} class="neon-btn {extraClass}" on:click>
    <span class="btn-content"><slot /></span>
    </button>
{/if}

<style>
    .neon-btn {
        @apply relative inline-block px-6 py-2 uppercase tracking-widest font-bold text-lg;
        color: var(--primary-color, #00f0ff);
        border: 2px solid var(--primary-color, #00f0ff);
        background: transparent;
        overflow: hidden;
        transition: color 0.3s ease-in-out, box-shadow 0.3s ease-in-out;
        box-shadow: 0 0 5px var(--primary-color, #00f0ff),
                    inset 0 0 5px var(--primary-color, #00f0ff);
    }

    .btn-content {
        position: relative;
        z-index: 1;
    }

    .neon-btn::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(120deg, transparent, var(--primary-color, #00f0ff), transparent);
        transition: left 0.5s ease-in-out;
        z-index: 0;

    }

    .neon-btn:hover {
        color: --primary-color;
        box-shadow: 0 0 25px var(--primary-color, #00f0ff);
    }

    .neon-btn:hover::before {
        left: 100%;
    }

    .neon-btn.disabled {
        @apply border-gray-600 text-gray-600 cursor-not-allowed;
        box-shadow: none;
    }
     .neon-btn.disabled:hover {
        @apply border-gray-600 text-gray-600;
         box-shadow: none;
     }
     .neon-btn.disabled::before {
         display: none;
     }
</style>