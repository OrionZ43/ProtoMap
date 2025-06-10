<script lang="ts">
    import { userStore } from '$lib/stores';
    import type { ActionData, PageData } from './$types';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { onMount } from 'svelte';
    export let data: PageData;
    export let form: ActionData;

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => {
        opacity.set(1);
    });
</script>

<svelte:head>
    <title>Редактирование | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
    <div class="corner top-left"></div>
    <div class="corner top-right"></div>
    <div class="corner bottom-left"></div>
    <div class="corner bottom-right"></div>

    <h2 class="form-title font-display">РЕДАКТИРОВАНИЕ ПРОФИЛЯ</h2>

    <form method="POST" class="space-y-8">

        <div class="form-group">
            <label for="avatar_url" class="form-label font-display">URL_АВАТАРА</label>
            <input name="avatar_url" type="url" id="avatar_url" value={data.profile.avatar_url || ''} class="input-field" placeholder="https://...">
            <p class="form-help-text">Direct link to image file. Leave empty for default.</p>
        </div>

        <div class="form-group">
            <label for="social_link" class="form-label font-display">ССЫЛКА</label>
            <input name="social_link" type="url" id="social_link" value={data.profile.social_link || ''} class="input-field" placeholder="https://...">
            <p class="form-help-text">Link to your main social media or website.</p>
        </div>

        <div class="form-group">
            <label for="about_me" class="form-label font-display">ИНФОРМАЦИЯ</label>
            <textarea name="about_me" id="about_me" rows="5" class="input-field" placeholder="Enter bio... (max 500 chars)">{data.profile.about_me || ''}</textarea>
        </div>

        {#if form?.error}
            <p class="error-message">{form.error}</p>
        {/if}

        <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <NeonButton type="submit" extraClass="w-full">Сохранить</NeonButton>
            <a href="/profile/{$userStore.user?.username}" class="cancel-btn">Отмена</a>
        </div>
    </form>
</div>

<style>
    .form-container {
        @apply max-w-2xl mx-auto my-10 p-8 rounded-none shadow-2xl relative;
        background: rgba(10, 10, 10, 0.5);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
    }

    .form-title {
        @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10;
        text-shadow: none;
    }
    .form-group { /* ... */ }
    .form-label {
        @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2;
    }

    .input-field {
        @apply block w-full p-2 bg-transparent text-gray-200;
        border: none;
        border-bottom: 1px solid var(--border-color, #30363d);
        border-radius: 0;
        font-family: 'Inter', sans-serif;
        font-size: 1.1em;
        transition: border-color 0.3s, box-shadow 0.3s;
    }
    .input-field:focus {
        @apply outline-none;
        border-bottom-color: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a);
    }
    textarea.input-field { min-height: 120px; resize: vertical; }
    .form-help-text { @apply mt-2 text-xs text-gray-500; }
    .error-message { @apply mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-md; }

    .cancel-btn {
        @apply w-full text-center py-3 px-4 rounded-md border border-gray-600 text-gray-400;
        @apply hover:bg-gray-700 hover:text-white transition-colors duration-150;
    }

</style>