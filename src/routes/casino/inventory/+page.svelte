<script lang="ts">
    import type { PageData } from './$types';
    import { userStore } from '$lib/stores';
    import { onMount, onDestroy } from 'svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { Howl } from 'howler';
    import { t } from 'svelte-i18n'; // Импорт локализации
    import { get } from 'svelte/store';

    export let data: PageData;

    let ownedFrames: PageData['allItems'][string][] = [];
    let selectedFrame: string | null = data.equippedFrame;
    let currentEquippedFrame: string | null = data.equippedFrame;
    let isSaving = false;

    // Хелпер для перевода в JS
    const translate = (key: string) => get(t)(key);

    $: {
        ownedFrames = Object.values(data.allItems).filter(item =>
            item.type === 'frame' && data.ownedItemIds.includes(item.id)
        );
    }

    let sounds: { [key: string]: Howl } = {};
    onMount(() => {
        sounds.ambient_inventory = new Howl({ src: ['/sounds/inventory.mp3'], loop: true, volume: 0.2, autoplay: true });
        sounds.equip = new Howl({ src: ['/sounds/equip.mp3'], volume: 0.7 });
        sounds.save = new Howl({ src: ['/sounds/save.mp3'], volume: 0.8 });

        return () => {
            sounds.ambient_inventory?.stop();
        }
    });

    function selectFrame(itemId: string | null) {
        sounds.equip?.play();
        if (selectedFrame === itemId) {
            selectedFrame = null;
        } else {
            selectedFrame = itemId;
        }
    }

    async function saveChanges() {
        if (isSaving || !hasChanges) return;
        isSaving = true;
        sounds.save?.play();

        try {
            const functions = getFunctions();
            const updateFunc = httpsCallable(functions, 'updateEquippedItems');
            await updateFunc({ equipped_frame: selectedFrame });

            userStore.update(store => {
                if (store.user) {
                    store.user.equipped_frame = selectedFrame;
                }
                return store;
            });
            currentEquippedFrame = selectedFrame;

            modal.success(translate('inventory.success_title'), translate('inventory.success_msg'));

        } catch (error: any) {
            modal.error(translate('inventory.error_title'), error.message || translate('inventory.error_save'));
        } finally {
            isSaving = false;
        }
    }

    $: hasChanges = selectedFrame !== currentEquippedFrame;

</script>

<svelte:head>
    <title>{$t('inventory.title')} | The Glitch Pit</title>
</svelte:head>

<div class="page-container">
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <div class="inventory-container">
        <div class="header">
            <h1 class="title font-display glitch" data-text={$t('inventory.title')}>{$t('inventory.title')}</h1>
            <p class="subtitle">{$t('inventory.subtitle')}</p>
        </div>

        <div class="wardrobe">
            <div class="preview-panel">
                <div class="avatar-wrapper {data.allItems[selectedFrame]?.id || ''}">
                    <img
                        src={$userStore.user?.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$userStore.user?.username}`}
                        alt="Preview"
                        class="preview-avatar"
                    />
                </div>
                <div class="actions">
                    <button class="panel-btn save" on:click={saveChanges} disabled={!hasChanges || isSaving}>
                        {isSaving ? $t('inventory.saving') : $t('inventory.save')}
                    </button>
                    {#if selectedFrame}
                        <button class="unequip-btn" on:click={() => selectFrame(null)}>{$t('inventory.unequip')}</button>
                    {/if}
                </div>
            </div>

            <div class="items-panel">
                {#if ownedFrames.length > 0}
                    <div class="items-grid">
                        {#each ownedFrames as item (item.id)}
                            <button
                                class="item-slot"
                                class:selected={selectedFrame === item.id}
                                on:click={() => selectFrame(item.id)}
                            >
                                <div class="avatar-wrapper item-icon-preview {item.id}">
                                    <div class="avatar-placeholder"></div>
                                </div>
                                <span class="item-name">{item.name}</span>
                                {#if currentEquippedFrame === item.id}
                                    <span class="equipped-tag">{$t('inventory.equipped')}</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                {:else}
                    <div class="empty-state">
                        <p>{$t('inventory.empty')}</p>
                        <a href="/casino/shop" class="panel-btn shop">{$t('inventory.go_shop')}</a>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    @keyframes float-blur-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(100px, 50px); } }
    @keyframes float-blur-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-80px, -60px); } }
    @keyframes glitch-text { 0% { text-shadow: 2px 0 #ff00c1, -2px 0 #01ffff; } 25% { text-shadow: -2px 0 #ff00c1, 2px 0 #01ffff; } 50% { text-shadow: 2px 0 #01ffff, -2px 0 #ff00c1; } 100% { text-shadow: 2px 0 #ff00c1, -2px 0 #01ffff; } }

    .page-container {
        min-height: calc(100vh - 64px);
        display: flex; align-items: center; justify-content: center;
        position: relative; overflow: hidden; background: #0a0a0a; padding: 2rem;
    }
    .bg-blur-1, .bg-blur-2 { position: absolute; width: 400px; height: 400px; border-radius: 50%; filter: blur(150px); pointer-events: none; z-index: 0; }
    .bg-blur-1 { background: var(--cyber-green); top: 10%; right: 10%; animation: float-blur-1 20s infinite ease-in-out; }
    .bg-blur-2 { background: var(--cyber-cyan); bottom: 10%; left: 10%; animation: float-blur-2 25s infinite ease-in-out; }

    .inventory-container {
        width: 100%; max-width: 1200px; z-index: 2;
        background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1.5rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }
    .header { text-align: center; padding: 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.15); }
    .title { font-size: 3rem; color: #fff; text-shadow: 0 0 15px #fff; }
    .subtitle { color: var(--text-muted-color); font-family: 'Chakra Petch', monospace; }

    .wardrobe { display: grid; grid-template-columns: 400px 1fr; }
    .preview-panel {
        padding: 2rem;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        border-right: 1px solid rgba(255, 255, 255, 0.15);
        gap: 2rem;
    }
    .avatar-wrapper {
        position: relative;
        display: flex; align-items: center; justify-content: center;
    }
    .preview-panel .avatar-wrapper {
        width: 250px; height: 250px;
    }
    .preview-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; box-shadow: 0 0 40px rgba(0,0,0,0.5); }

    .actions { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
    .unequip-btn {
        width: 100%; background: transparent; border: none; color: #666; text-decoration: underline;
        cursor: pointer;
    }

    .items-panel { padding: 2rem; max-height: 60vh; overflow-y: auto; }
    .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1.5rem; }
    .item-slot {
        background: rgba(0,0,0,0.3); border: 1px solid #333; border-radius: 0.5rem;
        padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; cursor: pointer; transition: all 0.2s; position: relative;
    }
    .item-slot:hover { background: rgba(255,255,255,0.1); border-color: var(--cyber-cyan); }
    .item-slot.selected { border-color: var(--cyber-yellow); box-shadow: 0 0 15px var(--cyber-yellow); transform: scale(1.05); }
    .item-icon-preview {
        width: 80px; height: 80px;
    }
    .avatar-placeholder {
        width: 100%; height: 100%;
        border-radius: 50%;
        background: #333;
    }
    .item-name { color: #ccc; font-size: 0.9rem; margin-top: 1rem; }
    .equipped-tag {
        position: absolute; top: 0.5rem; right: 0.5rem;
        background: var(--cyber-yellow); color: #000;
        font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;
        font-family: 'Chakra Petch', monospace; font-weight: bold;
    }

    /* --- ИСПРАВЛЕННЫЙ БЛОК EMPTY STATE --- */
    .empty-state {
        text-align: center;
        padding: 4rem 2rem;
        color: #666;

        /* Добавляем Flex, чтобы управлять отступами */
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem; /* Отступ между текстом и кнопкой */
    }
    .empty-state p {
        font-size: 1.2rem;
    }

    .panel-btn {
        width: 100%;
        padding: 0.75rem 1.5rem; font-family: 'Chakra Petch', monospace; font-weight: bold;
        color: rgba(255, 255, 255, 0.8); text-transform: uppercase; letter-spacing: 0.05em;
        text-decoration: none; text-align: center;
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 0.75rem;
        box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease-in-out;
    }
    .panel-btn:hover:not(:disabled) { color: #fff; transform: translateY(-2px); }
    .panel-btn.save:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-yellow); }
    .panel-btn.shop:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-yellow); }
    .panel-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

    @media (max-width: 1024px) {
        .wardrobe { grid-template-columns: 1fr; }
        .preview-panel { border-right: none; border-bottom: 1px solid rgba(255, 255, 255, 0.15); }
        .preview-panel .avatar-wrapper { width: 180px; height: 180px; }
        .items-panel { max-height: none; }
    }

    @media (max-width: 640px) {
        .page-container { padding: 1rem; }
        .header { padding: 1rem; }
        .title { font-size: 2rem; }
        .items-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem; }
        .item-slot { padding: 0.5rem; }
        .item-icon-preview { width: 60px; height: 60px; }
    }
.avatar-wrapper.frame_neon_blue {
        border: 3px solid var(--cyber-cyan);
        box-shadow: 0 0 15px var(--cyber-cyan), 0 0 25px var(--cyber-cyan);
    }

    /* --- Рамка "Системный Сбой" (Глитч) --- */
    .avatar-wrapper.frame_glitch::before,
    .avatar-wrapper.frame_glitch::after {
        content: '';
        position: absolute;
        top: -3px; left: -3px; right: -3px; bottom: -3px;
        border-radius: 50%;
        border: 3px solid transparent;
    }
    .avatar-wrapper.frame_glitch::before {
        border-color: #ff00c1;
        animation: glitch-border-anim 1s infinite linear alternate-reverse;
    }
    .avatar-wrapper.frame_glitch::after {
        border-color: #00f0ff;
        animation: glitch-border-anim 1s 0.2s infinite linear alternate;
    }

    /* --- Рамка "Золотой Игрок" (High Roller) --- */
    .avatar-wrapper.frame_high_roller {
        padding: 1px;
    }
    .avatar-wrapper.frame_high_roller::before {
        content: '';
        position: absolute;
        top: -3px; left: -3px; right: -3px; bottom: -3px;
        border-radius: 50%;
        padding: 3px;
        background: conic-gradient(#ffd700, #f0e68c, #daa520, #f0e68c, #ffd700);
        -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
                mask-composite: exclude;
        animation: high-roller-shine 3s linear infinite;
        background-size: 200% 100%;
    }

    /* --- Анимации для рамок (если еще не глобальные) --- */
    @keyframes glitch-border-anim {
        0% { clip-path: inset(90% 0 5% 0); } 20% { clip-path: inset(5% 0 80% 0); }
        40% { clip-path: inset(45% 0 45% 0); } 60% { clip-path: inset(2% 0 90% 0); }
        80% { clip-path: inset(60% 0 30% 0); } 100% { clip-path: inset(90% 0 5% 0); }
    }
    @keyframes high-roller-shine {
        0% { background-position: -200% 0; } 100% { background-position: 200% 0; }
    }
</style>