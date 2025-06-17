<script lang="ts">
    import { modal } from '$lib/stores/modalStore';
    import { quintOut } from 'svelte/easing';
    import { scale, fade } from 'svelte/transition';
    import NeonButton from './NeonButton.svelte';
</script>

{#if $modal.isOpen}
    <div
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        on:click|self={modal.close}
        transition:fade={{ duration: 200 }}
    >
        <div
            class="modal-container cyber-panel max-w-md w-full relative overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            transition:scale={{ duration: 250, start: 0.95, easing: quintOut }}
        >
            <div class="corner-bg top-left" class:is-error={$modal.type === 'error'}></div>
            <div class="corner-bg top-right" class:is-error={$modal.type === 'error'}></div>
            <div class="corner-bg bottom-left" class:is-error={$modal.type === 'error'}></div>
            <div class="corner-bg bottom-right" class:is-error={$modal.type === 'error'}></div>

            <div class="top-bar" class:is-error={$modal.type === 'error'}>
                <span class="pl-6 text-sm">
                    {#if $modal.type === 'error'}SYSTEM_FAILURE{:else if $modal.type === 'success'}TRANSACTION_OK{:else}SYSTEM_ALERT{/if}
                </span>
            </div>

            <div class="p-6 sm:p-8 relative text-center">
                <!-- Динамическая иконка в зависимости от типа -->
                <div class="w-12 h-12 mx-auto mb-4">
                    {#if $modal.type === 'success'}
                        <!-- Зеленая галочка -->
                        <div class="text-green-400">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                    {:else if $modal.type === 'error'}
                        <!-- Красный крестик -->
                        <div class="text-red-500">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                    {:else} <!-- 'info' или 'warning' -->
                        <!-- Желтый треугольник -->
                        <div class="text-cyber-yellow">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        </div>
                    {/if}
                </div>

                <h3 class="modal-title font-display" id="modal-title">
                    {$modal.title}
                </h3>

                <div class="mt-2">
                    <p class="modal-message">
                        {@html $modal.message}
                    </p>
                </div>
            </div>

            <div class="modal-actions px-6 sm:px-8 pb-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-4 space-y-2 space-y-reverse sm:space-y-0">
                {#each $modal.actions as button}
                    {#if button.class === 'primary'}
                        <NeonButton on:click={button.action} extraClass="w-full sm:w-auto" color={$modal.type === 'error' ? 'red' : 'cyan'}>
                            {button.text}
                        </NeonButton>
                    {:else}
                         <button type="button" class="cancel-btn w-full sm:w-auto" on:click={button.action}>
                            {button.text}
                         </button>
                    {/if}
                {/each}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-container {
        background: rgba(10, 10, 10, 0.9);
        border: 1px solid rgba(0, 240, 255, 0.3); /* Cyan border */
        box-shadow: 0 0 25px rgba(0, 240, 255, 0.2);
        clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
    }

    .modal-container.is-error {
        border-color: rgba(255, 0, 60, 0.4);
        box-shadow: 0 0 25px rgba(255, 0, 60, 0.3);
    }

    .corner-bg {
        @apply absolute w-16 h-16;
        background: radial-gradient(circle, var(--cyber-cyan, #00f0ff) 0%, rgba(0, 240, 255, 0) 60%);
        opacity: 0.1;
        filter: blur(5px);
        animation: spin 20s linear infinite;
    }
    .corner-bg.is-error {
        background: radial-gradient(circle, var(--cyber-red, #ff003c) 0%, rgba(255, 0, 60, 0) 60%);
    }

    .top-left { top: -30px; left: -30px; }
    .top-right { top: -30px; right: -30px; animation-delay: -5s; }
    .bottom-left { bottom: -30px; left: -30px; animation-delay: -10s; }
    .bottom-right { bottom: -30px; right: -30px; animation-delay: -15s; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .top-bar {
        @apply p-2 text-xs uppercase tracking-widest text-cyber-cyan/70 font-display;
        border-bottom: 1px solid rgba(0, 240, 255, 0.2);
        position: relative;
    }
    .top-bar.is-error {
        border-bottom-color: rgba(255, 0, 60, 0.3);
        color: var(--cyber-red);
    }
    .top-bar::before {
        content: '';
        @apply absolute top-1/2 left-2 w-2 h-2 rounded-full bg-cyber-cyan;
        transform: translateY(-50%);
        box-shadow: 0 0 5px var(--cyber-cyan);
        animation: pulse-light 2s infinite;
    }
    .top-bar.is-error::before {
        background-color: var(--cyber-red);
        box-shadow: 0 0 5px var(--cyber-red);
    }
    @keyframes pulse-light {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    .modal-title {
        @apply text-2xl font-bold text-white text-center;
    }

    .modal-message {
        @apply mt-2 text-lg text-gray-300 text-center leading-relaxed;
    }

    .modal-actions {
        border-top: 1px solid rgba(0, 240, 255, 0.1);
        padding-top: 1.5rem;
    }

    .cancel-btn {
        @apply block sm:w-auto w-full text-center py-3 px-6 rounded-md border border-gray-600 text-gray-300 font-display uppercase tracking-widest text-sm;
        transition: all 0.2s;
    }
    .cancel-btn:hover {
        background-color: transparent;
        border-color: var(--cyber-red, #ff003c);
        color: var(--cyber-red, #ff003c);
        text-shadow: 0 0 8px var(--cyber-red, #ff003c);
        transform: translateY(-2px);
    }
</style>