<script lang="ts">
    import { page } from '$app/stores';
    import { enhance } from '$app/forms';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import type { ActionData, PageData } from './$types';
    import { userStore } from '$lib/stores';

    export let data: PageData;
    export let form: ActionData;

    let currentAvatarUrl = data.profile.avatar_url;
    let socialLink = data.profile.social_link;
    let aboutMe = data.profile.about_me;

    let selectedFile: File | null = null;
    let imagePreviewUrl: string | ArrayBuffer | null = data.profile.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(data.profile.username.trim() || 'default_edit_seed')}`;
    let newAvatarCloudinaryUrl: string | null = null;

    let isLoadingAvatar = false;
    let avatarUploadError = '';
    let formMessage = form?.message || '';
    let fileName: string | null = null;
    let hiddenAvatarUrlInput = data.profile.avatar_url || '';
    let formSubmitting = false;

    const opacity = tweened(0, { duration: 400, easing: quintOut });

    onMount(() => {
        opacity.set(1);
        if (form?.message && !form?.error) {
            formMessage = form.message;
        }
        if (form?.error) {
            avatarUploadError = form.error;
        }
        // Инициализируем hiddenAvatarUrlInput текущим значением
        hiddenAvatarUrlInput = currentAvatarUrl || '';
    });

    function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            selectedFile = input.files[0];
            fileName = selectedFile.name;
            newAvatarCloudinaryUrl = null;
            avatarUploadError = '';
            formMessage = '';

            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreviewUrl = e.target?.result || null;
            };
            reader.readAsDataURL(selectedFile);
        } else {
            selectedFile = null;
            fileName = null;
            imagePreviewUrl = currentAvatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(data.profile.username.trim() || 'default_edit_seed')}`;
            hiddenAvatarUrlInput = currentAvatarUrl || '';
        }
    }

    async function uploadAvatarToCloudinary() {
        if (!selectedFile) {
            avatarUploadError = 'Сначала выберите файл.';
            return;
        }
        isLoadingAvatar = true;
        avatarUploadError = '';
        formMessage = '';

        try {
            const reader = new FileReader();
            reader.readAsDataURL(selectedFile);
            reader.onloadend = async () => {
                const imageBase64 = reader.result as string;
                const functions = getFunctions();
                const uploadAvatarFunc = httpsCallable(functions, 'uploadAvatar');

                const result = await uploadAvatarFunc({ imageBase64 });
                newAvatarCloudinaryUrl = (result.data as any).avatarUrl;
                imagePreviewUrl = newAvatarCloudinaryUrl;
                hiddenAvatarUrlInput = newAvatarCloudinaryUrl || '';
                isLoadingAvatar = false;
                formMessage = "Новый аватар загружен! Нажмите 'Сохранить', чтобы применить изменения.";
            };
            reader.onerror = () => {
                avatarUploadError = 'Ошибка чтения файла.';
                isLoadingAvatar = false;
            };
        } catch (error: any) {
            avatarUploadError = error.message || 'Не удалось загрузить аватар.';
            isLoadingAvatar = false;
        }
    }

    function handleImageError(event: Event) {
        const imgElement = event.target as HTMLImageElement;
        imgElement.onerror = null;
        const usernameSeed = $userStore.user?.username || data.profile.username || 'error_seed';
        imgElement.src = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(usernameSeed.trim())}`;
    }

    function triggerFileInput() {
        const fileInput = document.getElementById('avatar-file-input') as HTMLInputElement | null;
        fileInput?.click();
    }

    $: if (!newAvatarCloudinaryUrl && !selectedFile) {
        hiddenAvatarUrlInput = currentAvatarUrl || '';
    }

</script>

<svelte:head>
    <title>Редактирование профиля | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
    <div class="corner top-left"></div>
    <div class="corner top-right"></div>
    <div class="corner bottom-left"></div>
    <div class="corner bottom-right"></div>

    <h2 class="form-title font-display">РЕДАКТИРОВАНИЕ ПРОФИЛЯ</h2>

    <form
        method="POST"
        enctype="multipart/form-data"
        class="space-y-8"
    >
        <input type="hidden" name="avatar_url" bind:value={hiddenAvatarUrlInput} />

        <div class="form-group">
            <label class="form-label font-display">АВАТАР</label>
            {#if imagePreviewUrl}
                <img
                    src={imagePreviewUrl}
                    alt="Предпросмотр аватара"
                    class="avatar-preview mb-4"
                    on:error={handleImageError}
                />
            {/if}

            <button
                type="button"
                on:click={triggerFileInput}
                class="custom-file-upload-btn"
                disabled={isLoadingAvatar}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2 shrink-0"><path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25-1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>
                <span class="truncate">{fileName ? fileName : 'Выбрать файл...'}</span>
            </button>

            {#if fileName && !newAvatarCloudinaryUrl && !isLoadingAvatar && !formMessage}
                <p class="selected-file-name mt-2 text-sm text-gray-400">Выбран: <span class="font-medium text-gray-200">{fileName}</span></p>
            {/if}

            <input
                type="file"
                id="avatar-file-input"
                name="avatar_file_placeholder"
                accept="image/*,.webp"
                on:change={handleFileSelect}
                class="hidden-file-input"
                disabled={isLoadingAvatar}
            />

            {#if selectedFile && !newAvatarCloudinaryUrl && !isLoadingAvatar && !formMessage && !avatarUploadError}
                <NeonButton type="button" on:click={uploadAvatarToCloudinary} extraClass="mt-3 text-sm w-full">
                    Загрузить выбранный файл на сервер
                </NeonButton>
            {/if}
            {#if isLoadingAvatar && !formMessage && !avatarUploadError}
                <p class="text-sm text-cyber-yellow mt-2 animate-pulse">Загрузка...</p>
            {/if}
            {#if avatarUploadError && !formMessage }
                <p class="error-message mt-2 text-sm">{avatarUploadError}</p>
            {/if}
            {#if formMessage }
                 <p class={(form?.error || avatarUploadError ) ? "error-message" : "success-message"} mt-2 text-sm>{formMessage}</p>
            {/if}
             <p class="form-help-text mt-1">Выберите файл (PNG, JPG, GIF, WEBP). Нажмите "Загрузить...", затем "Сохранить".</p>
        </div>

        <div class="form-group">
            <label for="social_link" class="form-label font-display">СОЦИАЛЬНАЯ ССЫЛКА</label>
            <input bind:value={socialLink} type="url" id="social_link" name="social_link" class="input-field" placeholder="https://..." disabled={isLoadingAvatar}>
            <p class="form-help-text">Ссылка на вашу основную соцсеть или сайт.</p>
        </div>

        <div class="form-group">
            <label for="about_me" class="form-label font-display">ИНФОРМАЦИЯ</label>
            <textarea bind:value={aboutMe} id="about_me" name="about_me" rows="5" class="input-field textarea-field" placeholder="Расскажите о себе... (макс 500 символов)" disabled={isLoadingAvatar}>{data.profile.about_me || ''}</textarea>
        </div>

        {#if form?.error && !avatarUploadError && !formMessage }
            <p class="error-message">{form.error}</p>
        {/if}

        <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <NeonButton type="submit" extraClass="w-full" disabled={isLoadingAvatar || formSubmitting}>
                {formSubmitting ? 'Сохранение...' : 'Сохранить'}
            </NeonButton>
            <a href="/profile/{$userStore.user?.username || data.profile.username || ''}" class="cancel-btn {isLoadingAvatar ? 'opacity-50 cursor-not-allowed' : ''}">Отмена</a>
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
        transition: opacity 0.4s ease-in-out;
    }
    @media (max-width: 640px) { .form-container { @apply my-4 mx-4 p-6; } }

    .corner { @apply absolute w-5 h-5; border-color: var(--cyber-yellow, #fcee0a); opacity: 0.7; }
    .top-left { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; }
    .top-right { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; }
    .bottom-left { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; }
    .bottom-right { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; }

    .form-title {
        @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10;
        text-shadow: none;
    }
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
    .input-field:focus:not(:disabled) {
        @apply outline-none;
        border-bottom-color: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a);
    }

    textarea.input-field { min-height: 120px; resize: vertical; }
    .form-help-text { @apply mt-1 text-xs text-gray-500; }
    .error-message { @apply mt-2 text-center text-red-400 bg-red-900/50 p-3 rounded-md text-sm; }
    .success-message { @apply mt-2 text-center text-green-400 bg-green-900/50 p-3 rounded-md text-sm; }

    .avatar-preview {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--cyber-yellow);
        margin-bottom: 0.75rem;
        display: block;
        margin-left: auto;
        margin-right: auto;
        background-color: #222;
    }

    .custom-file-upload-btn {
        @apply w-full inline-flex items-center justify-center px-4 py-3 border border-dashed rounded-md text-sm font-medium;
        @apply text-gray-300 bg-transparent;
        border-color: var(--border-color, #30363d);
        transition: all 0.2s ease-in-out;
        font-family: 'Inter', sans-serif;
    }
    .custom-file-upload-btn:hover:not(:disabled) {
        @apply text-cyber-yellow border-cyber-yellow;
        box-shadow: 0 0 8px var(--cyber-yellow, #fcee0a);
    }
    .custom-file-upload-btn:focus-visible:not(:disabled) {
        @apply outline-none ring-2 ring-offset-2 ring-offset-gray-900 ring-cyber-yellow border-cyber-yellow;
    }
    .custom-file-upload-btn:disabled {
        @apply opacity-50 cursor-not-allowed;
    }
    .custom-file-upload-btn .shrink-0 {
        flex-shrink: 0;
    }
    .custom-file-upload-btn .truncate {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-left: 0.5rem;
    }

    .hidden-file-input {
        width: 0.1px;
        height: 0.1px;
        opacity: 0;
        overflow: hidden;
        position: absolute;
        z-index: -1;
    }

    .selected-file-name {

    }

    .cancel-btn {
        @apply block sm:w-auto w-full text-center py-3 px-6 rounded-md border border-gray-600 text-gray-300 font-display uppercase tracking-widest text-sm;
        transition: background-color 0.2s, color 0.2s, border-color 0.2s, text-shadow 0.2s;
    }
    .cancel-btn:hover:not(.opacity-50) {
        background-color: var(--input-bg-color, #1a1a1a);
        border-color: var(--cyber-red, #ff003c);
        color: var(--cyber-red, #ff003c);
        text-shadow: 0 0 8px var(--cyber-red, #ff003c);
    }
    .cancel-btn.opacity-50 { pointer-events: none; }

    .animate-pulse {
        animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .5; }
    }
</style>