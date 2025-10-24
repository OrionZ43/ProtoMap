<script lang="ts">
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import type { PageData } from './$types';
    import { userStore } from '$lib/stores';
    import { modal } from '$lib/stores/modalStore';
    import { goto } from '$app/navigation';

    export let data: PageData;

    let status = data.profile.status || '';
    let aboutMe = data.profile.about_me || '';
    let socials = { ...data.profile.socials };
    let imagePreviewUrl: string | null = data.profile.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(data.profile.username.trim() || 'default')}`;

    let isLoadingAvatar = false;
    let isSavingProfile = false;

    const opacity = tweened(0, { duration: 400, easing: quintOut });

    onMount(() => {
        opacity.set(1);
    });

    async function handleAvatarChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // 5 MB limit
            modal.error('Файл слишком большой', 'Пожалуйста, выберите файл размером до 5 МБ.');
            input.value = '';
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
            modal.error('Неверный тип файла', 'Выберите изображение (JPG, PNG, GIF, WEBP).');
            input.value = '';
            return;
        }

        isLoadingAvatar = true;

        const previewReader = new FileReader();
        previewReader.readAsDataURL(file);
        previewReader.onload = (e) => { imagePreviewUrl = e.target?.result as string; };

        const uploadReader = new FileReader();
        uploadReader.readAsDataURL(file);
        uploadReader.onloadend = async () => {
            try {
                const imageBase64 = uploadReader.result as string;
                const functions = getFunctions();
                const uploadAvatarFunc = httpsCallable(functions, 'uploadAvatar');
                modal.info('Загрузка...', 'Отправляем ваш новый аватар...');
                const result = await uploadAvatarFunc({ imageBase64 });
                const newAvatarUrl = (result.data as { avatarUrl: string }).avatarUrl;
                imagePreviewUrl = newAvatarUrl;
                modal.success("Успешно!", "Ваш новый аватар был сохранен.");
                userStore.update(store => {
                    if (store.user) {
                        return { ...store, user: { ...store.user, avatar_url: newAvatarUrl } };
                    }
                    return store;
                });
            } catch (error: any) {
                modal.error("Ошибка загрузки", error.message || 'Не удалось обновить аватар.');
                imagePreviewUrl = data.profile.avatar_url;
            } finally {
                isLoadingAvatar = false;
                input.value = '';
            }
        };
        uploadReader.onerror = () => {
             modal.error("Ошибка файла", "Не удалось прочитать выбранный файл.");
             isLoadingAvatar = false;
        }
    }

    async function saveProfileData() {
        isSavingProfile = true;
        try {
            const functions = getFunctions();
            const updateProfileFunc = httpsCallable(functions, 'updateProfileData');
            const profileDataToSend = {
                status: status,
                about_me: aboutMe,
                socials: socials
            };
            const result = await updateProfileFunc(profileDataToSend);
            const message = (result.data as { message: string }).message;

            modal.success("Успешно!", message || "Данные профиля сохранены.");

            userStore.update(store => {
                if (store.user) {
                    store.user.status = status;
                }
                return store;
            });

            setTimeout(() => {
                goto(`/profile/${data.profile.username}`);
            }, 1500);

        } catch (error: any) {
            modal.error("Ошибка сохранения", error.message || "Не удалось сохранить данные.");
        } finally {
            isSavingProfile = false;
        }
    }
</script>

<svelte:head>
    <title>Редактирование профиля | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
    <h2 class="form-title font-display">РЕДАКТИРОВАНИЕ ПРОФИЛЯ</h2>

    <div class="form-group space-y-4 mb-8">
        <label for="avatar-file-input" class="form-label font-display">АВАТАР</label>
        {#if imagePreviewUrl}
            <img src={imagePreviewUrl} alt="Аватар" class="avatar-preview" />
        {/if}
        <NeonButton type="button" on:click={() => document.getElementById('avatar-file-input')?.click()} extraClass="w-full" disabled={isLoadingAvatar || isSavingProfile}>
            {#if isLoadingAvatar}
                <span class="animate-pulse">ЗАГРУЗКА...</span>
            {:else}
                Выбрать и загрузить новый аватар
            {/if}
        </NeonButton>
        <input type="file" id="avatar-file-input" class="hidden-file-input" on:change={handleAvatarChange} accept="image/jpeg, image/png, image/gif, image/webp" />
        <p class="form-help-text text-center">Аватар сохраняется сразу после загрузки.</p>
    </div>

    <hr class="separator"/>

    <div class="space-y-8">
        <h3 class="form-label font-display text-lg">// ИНФОРМАЦИЯ И ССЫЛКИ</h3>

        <div class="form-group">
            <label for="status" class="form-label font-display">СТАТУС</label>
            <input bind:value={status} type="text" id="status" class="input-field" placeholder="Чем вы сейчас заняты?" maxlength="100" disabled={isLoadingAvatar || isSavingProfile} />
            <p class="form-help-text">Короткое сообщение (макс. 100 симв.), которое будет видно в вашем профиле и на карте.</p>
        </div>

        <div class="form-group">
            <label for="about_me" class="form-label font-display">ОБО МНЕ</label>
            <textarea bind:value={aboutMe} id="about_me" rows="5" class="input-field textarea-field" placeholder="Расскажите о себе..." disabled={isLoadingAvatar || isSavingProfile}></textarea>
        </div>

        <div class="form-group">
            <label for="social_telegram" class="form-label font-display">TELEGRAM</label>
            <input bind:value={socials.telegram} type="text" id="social_telegram" class="input-field" placeholder="username (без @)" disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_discord" class="form-label font-display">DISCORD</label>
            <input bind:value={socials.discord} type="text" id="social_discord" class="input-field" placeholder="username" disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_vk" class="form-label font-display">VK</label>
            <input bind:value={socials.vk} type="text" id="social_vk" class="input-field" placeholder="id или короткое имя" disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_twitter" class="form-label font-display">X (TWITTER)</label>
            <input bind:value={socials.twitter} type="text" id="social_twitter" class="input-field" placeholder="username (без @)" disabled={isLoadingAvatar || isSavingProfile} />
        </div>
        <div class="form-group">
            <label for="social_website" class="form-label font-display">САЙТ</label>
            <input bind:value={socials.website} type="url" id="social_website" class="input-field" placeholder="https://..." disabled={isLoadingAvatar || isSavingProfile} />
        </div>

        <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <NeonButton type="button" on:click={saveProfileData} extraClass="w-full" disabled={isLoadingAvatar || isSavingProfile}>
                {isSavingProfile ? 'Сохранение...' : 'Сохранить информацию и ссылки'}
            </NeonButton>
            <a href="/profile/{data.profile.username || ''}" class="cancel-btn">Отмена</a>
        </div>
    </div>
</div>

<style>
    .form-container { @apply max-w-2xl mx-auto my-10 p-8 rounded-none shadow-2xl relative; background: rgba(10, 10, 10, 0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 1px solid rgba(252, 238, 10, 0.2); clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%); }
    .form-title { @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10; text-shadow: none; }
    .form-label { @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2; }
    .input-field { @apply block w-full p-2 bg-transparent text-gray-200; border: none; border-bottom: 1px solid var(--border-color, #30363d); border-radius: 0; font-family: 'Inter', sans-serif; font-size: 1.1em; transition: border-color 0.3s, box-shadow 0.3s; }
    .input-field:focus:not(:disabled) { @apply outline-none; border-bottom-color: var(--cyber-yellow, #fcee0a); box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a); }
    textarea.input-field { min-height: 120px; resize: vertical; }
    .form-help-text { @apply mt-1 text-xs text-gray-500; }
    .avatar-preview { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid var(--cyber-yellow); margin: 0 auto 1rem auto; display: block; background-color: #222; }
    .cancel-btn { @apply block sm:w-auto w-full text-center py-3 px-6 rounded-md border border-gray-600 text-gray-300 font-display uppercase tracking-widest text-sm; transition: all 0.2s; }
    .cancel-btn:hover { background-color: var(--input-bg-color, #1a1a1a); border-color: var(--cyber-red, #ff003c); color: var(--cyber-red, #ff003c); text-shadow: 0 0 8px var(--cyber-red, #ff003c); }
    .separator { @apply border-t-2 border-dashed border-gray-700/50 my-8; }
    .hidden-file-input { width: 0; height: 0; position: absolute; opacity: 0; z-index: -1; }
    .animate-pulse { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
</style>