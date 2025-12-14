<script lang="ts">
    import type { PageData } from './$types';
    import { userStore } from '$lib/stores';
    import { onMount } from 'svelte';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { Howl } from 'howler';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';

    export let data: PageData;

    // === ТАБЫ И ФИЛЬТРАЦИЯ ===
    let activeTab: 'frames' | 'backgrounds' = 'frames';

    // Разделяем предметы пользователя по типам
    $: ownedFrames = Object.values(data.allItems).filter(item =>
        item.type === 'frame' && data.ownedItemIds.includes(item.id)
    );
    $: ownedBackgrounds = Object.values(data.allItems).filter(item =>
        item.type === 'background' && data.ownedItemIds.includes(item.id)
    );

    // === СОСТОЯНИЕ ВЫБОРА ===
    // Инициализируем текущими значениями из БД/Стора
    let selectedFrame: string | null = data.equippedFrame;
    let selectedBg: string | null = $userStore.user?.equipped_bg || null;

    // Сохраняем исходные значения для сравнения (чтобы кнопка Save была активна только при изменениях)
    let currentFrame: string | null = data.equippedFrame;
    let currentBg: string | null = $userStore.user?.equipped_bg || null;

    let isSaving = false;

    const translate = (key: string) => get(t)(key);

    let sounds: { [key: string]: Howl } = {};
    onMount(() => {
        sounds.ambient_inventory = new Howl({ src: ['/sounds/inventory.mp3'], loop: true, volume: 0.2, autoplay: true });
        sounds.equip = new Howl({ src: ['/sounds/equip.mp3'], volume: 0.7 });
        sounds.save = new Howl({ src: ['/sounds/save.mp3'], volume: 0.8 });
        sounds.click = new Howl({ src: ['/sounds/click.mp3'], volume: 0.5 });

        return () => {
            sounds.ambient_inventory?.stop();
        }
    });

    function switchTab(tab: 'frames' | 'backgrounds') {
        if (activeTab === tab) return;
        sounds.click?.play();
        activeTab = tab;
    }

    function selectItem(itemId: string | null, type: 'frame' | 'background') {
        sounds.equip?.play();
        if (type === 'frame') {
            // Если кликнули на уже выбранную - снимаем, иначе выбираем новую
            selectedFrame = (selectedFrame === itemId) ? null : itemId;
        } else {
            selectedBg = (selectedBg === itemId) ? null : itemId;
        }
    }

    async function saveChanges() {
        if (isSaving || !hasChanges) return;
        isSaving = true;
        sounds.save?.play();

        try {
            const functions = getFunctions();
            const updateFunc = httpsCallable(functions, 'updateEquippedItems');

            // Отправляем на сервер оба параметра
            await updateFunc({
                equipped_frame: selectedFrame,
                equipped_bg: selectedBg
            });

            // Обновляем локальный стор
            userStore.update(store => {
                if (store.user) {
                    store.user.equipped_frame = selectedFrame;
                    store.user.equipped_bg = selectedBg;
                }
                return store;
            });

            // Обновляем "текущее" состояние
            currentFrame = selectedFrame;
            currentBg = selectedBg;

            modal.success(translate('inventory.success_title'), translate('inventory.success_msg'));

        } catch (error: any) {
            modal.error(translate('inventory.error_title'), error.message || translate('inventory.error_save'));
        } finally {
            isSaving = false;
        }
    }

    $: hasChanges = (selectedFrame !== currentFrame) || (selectedBg !== currentBg);

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

        <!-- TABS -->
        <div class="inv-tabs">
            <button class="inv-tab" class:active={activeTab === 'frames'} on:click={() => switchTab('frames')}>
                {$t('shop.tab_frames')}
            </button>
            <button class="inv-tab" class:active={activeTab === 'backgrounds'} on:click={() => switchTab('backgrounds')}>
                {$t('shop.tab_backgrounds')}
            </button>
        </div>

        <div class="wardrobe">

            <!-- PREVIEW PANEL (Слева) -->
            <div class="preview-panel">
                <!-- Контейнер превью: сюда вешаем класс фона (selectedBg) -->
                <div class="preview-box {selectedBg || ''}">
                    <!-- Аватар: сюда вешаем класс рамки (selectedFrame) -->
                    <!-- data.allItems[selectedFrame].id нужен, т.к. selectedFrame хранит ID документа (напр frame_dev) -->
                    <!-- Если selectedFrame null, то класса нет -->
                    <div class="avatar-wrapper {selectedFrame ? data.allItems[selectedFrame]?.id : ''}">
                        <img
                            src={$userStore.user?.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$userStore.user?.username}`}
                            alt="Preview"
                            class="preview-avatar"
                        />
                    </div>
                </div>

                <div class="actions">
                    <button class="panel-btn save" on:click={saveChanges} disabled={!hasChanges || isSaving}>
                        {isSaving ? $t('inventory.saving') : $t('inventory.save')}
                    </button>
                </div>
            </div>

            <!-- ITEMS PANEL (Справа) -->
            <div class="items-panel">

                {#if activeTab === 'frames'}
                    <!-- СЕТКА РАМОК -->
                    {#if ownedFrames.length > 0}
                        <div class="items-grid">
                            {#each ownedFrames as item (item.id)}
                                <button
                                    class="item-slot"
                                    class:selected={selectedFrame === item.id}
                                    on:click={() => selectItem(item.id, 'frame')}
                                >
                                    <div class="avatar-wrapper item-icon-preview {item.id}">
                                        <div class="avatar-placeholder"></div>
                                    </div>
                                    <span class="item-name">{item.name}</span>
                                    {#if currentFrame === item.id}
                                        <span class="equipped-tag">E</span>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                        {#if selectedFrame}
                            <button class="unequip-text-btn" on:click={() => selectItem(null, 'frame')}>
                                {$t('inventory.unequip')}
                            </button>
                        {/if}
                    {:else}
                        <div class="empty-state">
                            <p>{$t('inventory.empty')}</p>
                            <a href="/casino/shop" class="panel-btn shop">{$t('inventory.go_shop')}</a>
                        </div>
                    {/if}

                {:else}
                    <!-- СЕТКА ФОНОВ -->
                    {#if ownedBackgrounds.length > 0}
                        <div class="items-grid">
                            {#each ownedBackgrounds as item (item.id)}
                                <button
                                    class="item-slot"
                                    class:selected={selectedBg === item.id}
                                    on:click={() => selectItem(item.id, 'background')}
                                >
                                    <!-- Мини-превью фона -->
                                    <div class="bg-icon-preview {item.id}">
                                        <div class="mini-profile-line"></div>
                                        <div class="mini-profile-line short"></div>
                                    </div>
                                    <span class="item-name">{item.name}</span>
                                    {#if currentBg === item.id}
                                        <span class="equipped-tag">E</span>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                        {#if selectedBg}
                            <button class="unequip-text-btn" on:click={() => selectItem(null, 'background')}>
                                Unequip Background
                            </button>
                        {/if}
                    {:else}
                        <div class="empty-state">
                            <p>{$t('shop.empty_category')}</p>
                            <a href="/casino/shop" class="panel-btn shop">{$t('inventory.go_shop')}</a>
                        </div>
                    {/if}
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

    /* TABS */
    .inv-tabs {
        display: flex;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .inv-tab {
        flex: 1;
        padding: 1rem;
        background: transparent;
        color: #666;
        font-family: 'Chakra Petch', monospace;
        font-weight: bold;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        border-bottom: 2px solid transparent;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
    .inv-tab:hover { color: #ccc; background: rgba(255,255,255,0.03); }
    .inv-tab.active { color: var(--cyber-yellow); border-bottom-color: var(--cyber-yellow); background: rgba(255,255,255,0.05); }

    .wardrobe { display: grid; grid-template-columns: 400px 1fr; }

    .preview-panel {
        padding: 2rem;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        border-right: 1px solid rgba(255, 255, 255, 0.15);
        gap: 2rem;
    }

    /* Контейнер превью (здесь применяем фон) */
    .preview-box {
        width: 100%;
        height: 350px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(0,0,0,0.3); /* Дефолтный фон */
        transition: all 0.3s;
        overflow: hidden;
        position: relative;
    }

    .avatar-wrapper {
        position: relative;
        width: 150px;
        height: 150px;
        border-radius: 50%;
        z-index: 5;
    }
    .preview-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; box-shadow: 0 0 20px rgba(0,0,0,0.5); }

    .actions { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
    .unequip-text-btn {
        width: 100%; background: transparent; border: none; color: #666; text-decoration: underline;
        cursor: pointer; font-size: 0.8rem; margin-top: 1rem;
    }
    .unequip-text-btn:hover { color: #aaa; }

    .items-panel { padding: 2rem; max-height: 70vh; overflow-y: auto; }
    .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1.5rem; }

    .item-slot {
        background: rgba(0,0,0,0.3); border: 1px solid #333; border-radius: 0.5rem;
        padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; cursor: pointer; transition: all 0.2s; position: relative;
    }
    .item-slot:hover { background: rgba(255,255,255,0.1); border-color: var(--cyber-cyan); }
    .item-slot.selected { border-color: var(--cyber-yellow); box-shadow: 0 0 15px var(--cyber-yellow); transform: scale(1.05); z-index: 2; }

    .item-icon-preview { width: 70px; height: 70px; }
    .avatar-placeholder { width: 100%; height: 100%; border-radius: 50%; background: #333; }

    /* Иконка для фона */
    .bg-icon-preview {
        width: 70px; height: 70px; border-radius: 8px;
        border: 1px solid #555;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 5px;
    }
    .mini-profile-line { width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; }
    .mini-profile-line.short { width: 25px; }

    .item-name { color: #ccc; font-size: 0.8rem; margin-top: 1rem; }

    .equipped-tag {
        position: absolute; top: 0.3rem; right: 0.3rem;
        background: var(--cyber-yellow); color: #000;
        font-size: 0.6rem; padding: 1px 5px; border-radius: 3px;
        font-family: 'Chakra Petch', monospace; font-weight: bold;
    }

    .empty-state {
        text-align: center;
        padding: 4rem 2rem;
        color: #666;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;
    }
    .empty-state p { font-size: 1.2rem; }

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
    .panel-btn.save:hover:not(:disabled) { box-shadow: 0 0 20px var(--cyber-yellow); border-color: var(--cyber-yellow); }
    .panel-btn.shop:hover:not(:disabled) { box-shadow: 0 0 20px var(--cyber-cyan); border-color: var(--cyber-cyan); }
    .panel-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

    @media (max-width: 1024px) {
        .wardrobe { grid-template-columns: 1fr; }
        .preview-panel { border-right: none; border-bottom: 1px solid rgba(255, 255, 255, 0.15); }
        .preview-box { height: 250px; }
        .items-panel { max-height: none; }
    }

    @media (max-width: 640px) {
        .page-container { padding: 1rem; }
        .header { padding: 1rem; }
        .title { font-size: 2rem; }
        .items-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 1rem; }
        .item-slot { padding: 0.5rem; }
        .item-icon-preview, .bg-icon-preview { width: 50px; height: 50px; }
    }
</style>