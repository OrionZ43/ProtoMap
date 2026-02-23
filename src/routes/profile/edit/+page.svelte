<script lang="ts">
    import NeonButton from '$lib/components/NeonButton.svelte';
    import AvatarEditor from '$lib/components/AvatarEditor.svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import type { PageData } from './$types';
    import { userStore } from '$lib/stores';
    import { modal } from '$lib/stores/modalStore';
    import { goto } from '$app/navigation';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';

    export let data: PageData;

    let status = data.profile.status || '';
    let aboutMe = data.profile.about_me || '';
    let socials = { ...data.profile.socials };
    let imagePreviewUrl: string | null = data.profile.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(data.profile.username.trim() || 'default')}`;

    let isLoadingAvatar = false;
    let isSavingProfile = false;

    // [ЭТАП 5] Смена никнейма
    let newUsername = '';
    let isChangingUsername = false;
    let usernameError = '';

    let isEditorOpen = false;
    let selectedFile: File | null = null;

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    const translate = (key: string) => get(t)(key);

    onMount(() => {
        opacity.set(1);
    });

    // Валидация на лету
    $: {
        if (newUsername && newUsername.trim().length > 0) {
            const trimmed = newUsername.trim();
            if (trimmed.length < 4) {
                usernameError = translate('edit_profile.username_error_length');
            } else if (trimmed.length > 20) {
                usernameError = translate('edit_profile.username_error_length');
            } else if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
                usernameError = translate('edit_profile.username_error_chars');
            } else {
                usernameError = '';
            }
        } else {
            usernameError = '';
        }
    }

    async function handleAvatarChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            modal.error(translate('edit_profile.modal_size_error'), 'Max 5MB.');
            input.value = '';
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
            modal.error(translate('edit_profile.modal_type_error'), 'JPG, PNG, GIF, WEBP only.');
            input.value = '';
            return;
        }

        selectedFile = file;
        isEditorOpen = true;
        input.value = '';
    }

    async function handleEditorSave(event: CustomEvent<{ imageBase64: string }>) {
        isLoadingAvatar = true;
        try {
            const { imageBase64 } = event.detail;
            const functions = getFunctions();
            const uploadAvatarFunc = httpsCallable(functions, 'uploadAvatar');

            modal.info(translate('ui.loading'), 'Uploading...');

            const result = await uploadAvatarFunc({ imageBase64 });

            localStorage.removeItem('protomap_markers_cache');
            localStorage.removeItem('protomap_markers_time');

            const newAvatarUrl = (result.data as { avatarUrl: string }).avatarUrl;
            imagePreviewUrl = newAvatarUrl;

            modal.success(translate('edit_profile.modal_avatar_success'), translate('edit_profile.modal_avatar_success_text'));

            userStore.update(store => {
                if (store.user) {
                    return { ...store, user: { ...store.user, avatar_url: newAvatarUrl } };
                }
                return store;
            });
        } catch (error: any) {
            modal.error(translate('ui.error'), error.message || 'Upload failed.');
        } finally {
            isLoadingAvatar = false;
        }
    }

    function handleEditorClose() {
        isEditorOpen = false;
        selectedFile = null;
    }

    async function saveProfileData() {
        isSavingProfile = true;
        try {
            const functions = getFunctions();
            const updateProfileFunc = httpsCallable(functions, 'updateProfileData');
            const result = await updateProfileFunc({
                status,
                about_me: aboutMe,
                socials
            });

            localStorage.removeItem('protomap_markers_cache');
            localStorage.removeItem('protomap_markers_time');

            const message = (result.data as { message: string }).message;
            modal.success(translate('inventory.success_title'), message || 'Saved.');

            userStore.update(store => {
                if (store.user) store.user.status = status;
                return store;
            });

            setTimeout(() => {
                goto(`/u/${data.profile.uid}`);
            }, 1500);

        } catch (error: any) {
            modal.error(translate('inventory.error_title'), error.message || 'Save failed.');
        } finally {
            isSavingProfile = false;
        }
    }

    // [ЭТАП 5] Смена никнейма — теперь просто один UPDATE на users/{uid}
    async function changeUsername() {
        const trimmed = newUsername.trim();

        if (!trimmed) {
            modal.error(translate('ui.error'), translate('edit_profile.username_placeholder') + '...');
            return;
        }
        if (usernameError) {
            modal.error('Ошибка', usernameError);
            return;
        }
        if (trimmed === data.profile.username) {
            modal.error(translate('ui.error'), translate('edit_profile.username_error_reserved'));
            return;
        }

        modal.confirm(
            translate('edit_profile.username_confirm_title'),
            translate("edit_profile.username_confirm_text", { name: trimmed }),
            async () => {
                isChangingUsername = true;
                try {
                    const functions = getFunctions();
                    const changeUsernameFunc = httpsCallable(functions, 'changeUsername');
                    const result = await changeUsernameFunc({ newUsername: trimmed });
                    const msg = (result.data as { message: string }).message;

                    // Инвалидируем кэш карты
                    localStorage.removeItem('protomap_markers_cache');
                    localStorage.removeItem('protomap_markers_time');

                    // Обновляем userStore локально
                    userStore.update(store => {
                        if (store.user) {
                            return { ...store, user: { ...store.user, username: trimmed } };
                        }
                        return store;
                    });

                    modal.success(translate('ui.success'), translate('edit_profile.username_success', { name: trimmed }));
                    newUsername = '';

                    // Редиректим на новый профиль через uid — никнейм в URL больше не используется
                    setTimeout(() => {
                        goto(`/u/${data.profile.uid}`);
                    }, 1500);

                } catch (err: any) {
                    modal.error(translate('ui.error'), err.message || 'Pопробуйте позже.');
                } finally {
                    isChangingUsername = false;
                }
            }
        );
    }
</script>

<svelte:head>
    <title>{$t('edit_profile.title')} | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
    <h2 class="form-title font-display">{$t('edit_profile.title')}</h2>

    <!-- АВАТАР -->
    <div class="form-group space-y-4 mb-8">
        <label for="avatar-file-input" class="form-label font-display">{$t('edit_profile.avatar_label')}</label>
        {#if imagePreviewUrl}
            <img src={imagePreviewUrl} alt="Avatar" class="avatar-preview" />
        {/if}
        <NeonButton type="button" on:click={() => document.getElementById('avatar-file-input')?.click()} extraClass="w-full" disabled={isLoadingAvatar || isSavingProfile}>
            {#if isLoadingAvatar}
                <span class="animate-pulse">{$t('ui.loading')}</span>
            {:else}
                {$t('edit_profile.avatar_btn')}
            {/if}
        </NeonButton>
        <input type="file" id="avatar-file-input" class="hidden-file-input" on:change={handleAvatarChange} accept="image/jpeg, image/png, image/gif, image/webp" />
        <p class="form-help-text text-center">{$t('edit_profile.avatar_help')}</p>
    </div>

    <hr class="separator"/>

    <!-- [ЭТАП 5] СМЕНА НИКНЕЙМА -->
    <div class="space-y-4 mb-8">
        <h3 class="form-label font-display text-lg">{$t('edit_profile.username_label')}</h3>

        <div class="username-current">
            <span class="text-gray-500 text-sm uppercase tracking-widest">// Current:</span>
            <span class="text-cyber-yellow font-bold ml-2">@{data.profile.username}</span>
        </div>

        <div class="form-group">
            <label for="new_username" class="form-label font-display">{$t('edit_profile.username_placeholder')}</label>
            <input
                bind:value={newUsername}
                type="text"
                id="new_username"
                class="input-field"
                class:input-error={usernameError}
                placeholder={$t('edit_profile.username_placeholder')}
                maxlength="20"
                disabled={isChangingUsername || isSavingProfile}
            />
            {#if usernameError}
                <p class="text-red-400 text-xs mt-1">⚠ {usernameError}</p>
            {:else}
                <p class="form-help-text">{$t('edit_profile.username_help')}</p>
            {/if}
            <p class="text-right text-xs text-gray-500 mt-1">{newUsername.length} / 20</p>
        </div>

        <NeonButton
            type="button"
            on:click={changeUsername}
            extraClass="w-full"
            disabled={isChangingUsername || isSavingProfile || !!usernameError || !newUsername.trim()}
        >
            {#if isChangingUsername}
                <span class="animate-pulse">{$t('edit_profile.username_saving')}</span>
            {:else}
                {$t('edit_profile.username_save_btn')}
            {/if}
        </NeonButton>
    </div>

    <hr class="separator"/>

    <!-- ОСНОВНЫЕ ДАННЫЕ ПРОФИЛЯ -->
    <div class="space-y-8">
        <h3 class="form-label font-display text-lg">{$t('edit_profile.info_title')}</h3>

        <div class="form-group">
            <label for="status" class="form-label font-display">{$t('edit_profile.status_label')}</label>
            <input bind:value={status} type="text" id="status" class="input-field" placeholder={$t('edit_profile.status_placeholder')} maxlength="100" disabled={isLoadingAvatar || isSavingProfile} />
            <p class="form-help-text">{$t('edit_profile.status_help')}</p>
            <p class="text-right text-xs text-gray-500 mt-1">{status.length} / 100</p>
        </div>

        <div class="form-group">
            <label for="about_me" class="form-label font-display">{$t('edit_profile.about_label')}</label>
            <textarea bind:value={aboutMe} id="about_me" rows="5" class="input-field" placeholder={$t('edit_profile.about_placeholder')} maxlength="500" disabled={isLoadingAvatar || isSavingProfile}></textarea>
            <p class="text-right text-xs text-gray-500 mt-1">{aboutMe.length} / 500</p>
        </div>

        <div class="form-group">
            <label for="social_telegram" class="form-label font-display">TELEGRAM</label>
            <input bind:value={socials.telegram} type="text" id="social_telegram" class="input-field" placeholder={$t('edit_profile.social_tg_placeholder')} disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_discord" class="form-label font-display">DISCORD</label>
            <input bind:value={socials.discord} type="text" id="social_discord" class="input-field" placeholder={$t('edit_profile.social_ds_placeholder')} disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_vk" class="form-label font-display">VK</label>
            <input bind:value={socials.vk} type="text" id="social_vk" class="input-field" placeholder={$t('edit_profile.social_vk_placeholder')} disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_twitter" class="form-label font-display">X (TWITTER)</label>
            <input bind:value={socials.twitter} type="text" id="social_twitter" class="input-field" placeholder={$t('edit_profile.social_x_placeholder')} disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_website" class="form-label font-display">{$t('edit_profile.social_website_label') || 'WEB'}</label>
            <input bind:value={socials.website} type="url" id="social_website" class="input-field" placeholder={$t('edit_profile.social_web_placeholder')} disabled={isLoadingAvatar || isSavingProfile} />
        </div>

        <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <NeonButton type="button" on:click={saveProfileData} extraClass="w-full" disabled={isLoadingAvatar || isSavingProfile}>
                {isSavingProfile ? $t('inventory.saving') : $t('edit_profile.save_btn')}
            </NeonButton>
            <a href="/u/{data.profile.uid}" class="cancel-btn">{$t('edit_profile.cancel_btn')}</a>
        </div>
    </div>
</div>

<AvatarEditor
    bind:isOpen={isEditorOpen}
    imageFile={selectedFile}
    on:save={handleEditorSave}
    on:close={handleEditorClose}
/>

<style>
    .form-container { @apply max-w-2xl mx-auto my-10 p-8 rounded-none shadow-2xl relative; background: rgba(10, 10, 10, 0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 1px solid rgba(252, 238, 10, 0.2); clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%); }
    .form-title { @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10; text-shadow: none; }
    .form-label { @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2; }
    .input-field { @apply block w-full p-2 bg-transparent text-gray-200; border: none; border-bottom: 1px solid var(--border-color, #30363d); border-radius: 0; font-family: 'Inter', sans-serif; font-size: 1.1em; transition: border-color 0.3s, box-shadow 0.3s; }
    .input-field:focus:not(:disabled) { @apply outline-none; border-bottom-color: var(--cyber-yellow, #fcee0a); box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a); }
    .input-error { border-bottom-color: #ff003c !important; }
    textarea.input-field { min-height: 120px; resize: vertical; }
    .form-help-text { @apply mt-1 text-xs text-gray-500; }
    .avatar-preview { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid var(--cyber-yellow); margin: 0 auto 1rem auto; display: block; background-color: #222; }
    .cancel-btn { @apply block sm:w-auto w-full text-center py-3 px-6 rounded-md border border-gray-600 text-gray-300 font-display uppercase tracking-widest text-sm; transition: all 0.2s; }
    .cancel-btn:hover { background-color: var(--input-bg-color, #1a1a1a); border-color: var(--cyber-red, #ff003c); color: var(--cyber-red, #ff003c); text-shadow: 0 0 8px var(--cyber-red, #ff003c); }
    .separator { @apply border-t-2 border-dashed border-gray-700/50 my-8; }
    .hidden-file-input { width: 0; height: 0; position: absolute; opacity: 0; z-index: -1; }
    .username-current { @apply p-3 rounded; background: rgba(252, 238, 10, 0.05); border: 1px solid rgba(252, 238, 10, 0.15); }
    .animate-pulse { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
</style>