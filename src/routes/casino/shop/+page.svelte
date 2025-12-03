<script lang="ts">
    import type { PageData } from './$types';
    import { userStore } from '$lib/stores';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { modal } from '$lib/stores/modalStore';
    import { Howl } from 'howler';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';

    export let data: PageData;

    let purchasingItemId: string | null = null;
    let ownedItems = new Set(data.ownedItemIds || []);

    // Хелпер для перевода
    const translate = (key: string) => get(t)(key);

    function getRandomQuote(category: 'greeting' | 'confirm' | 'success'): string {
        const quotes = get(t)(`shop.quotes.${category}`, { returnObjects: true }) as string[];
        if (Array.isArray(quotes) && quotes.length > 0) {
            return quotes[Math.floor(Math.random() * quotes.length)];
        }
        return "> ...";
    }

    userStore.subscribe(store => {
        if (store.user && store.user.owned_items) {
            const newOwnedItems = new Set(store.user.owned_items);
            if (newOwnedItems.size !== ownedItems.size) {
                ownedItems = newOwnedItems;
            }
        }
    });

    const displayedCredits = tweened($userStore.user?.casino_credits || 0, { duration: 500, easing: quintOut });
    $: if ($userStore.user) { displayedCredits.set($userStore.user.casino_credits); }

    let sounds: { [key: string]: Howl } = {};
    let dealerMessage = "";

    onMount(() => {
        sounds.ambient = new Howl({ src: ['/sounds/ambient_casino.mp3'], loop: true, volume: 0.2, autoplay: true });
        sounds.purchase = new Howl({ src: ['/sounds/purchase.mp3'], volume: 0.8 });
        dealerMessage = getRandomQuote('greeting');
        return () => { sounds.ambient?.stop(); };
    });

    async function purchaseItem(itemId: string, itemName: string, itemPrice: number) {
        if (purchasingItemId) return;

        const confirmQuote = getRandomQuote('confirm');

        // === СБОРКА ТЕКСТА (Ручная, для контроля HTML) ===
        // "Купить [ITEM] за [PRICE] PC?"
        const confirmText = `
            ${confirmQuote}<br><br>
            ${translate('shop.modal_confirm_prefix')}
            <strong>${itemName}</strong>
            ${translate('shop.modal_confirm_suffix')}
            <span class="font-display text-cyber-yellow">${itemPrice} PC</span>?
        `;

        modal.confirm(translate('shop.modal_confirm_title'), confirmText, async () => {
            purchasingItemId = itemId;
            dealerMessage = translate('shop.dealer_processing');

            try {
                const functions = getFunctions();
                const purchaseFunc = httpsCallable(functions, 'purchaseShopItem');
                await purchaseFunc({ itemId });

                sounds.purchase?.play();

                userStore.update(store => {
                    if (store.user) {
                        store.user.casino_credits -= itemPrice;
                        store.user.owned_items = [...(store.user.owned_items || []), itemId];
                    }
                    return store;
                });

                const successQuote = getRandomQuote('success');
                dealerMessage = successQuote;

                // "Предмет [ITEM] добавлен..."
                const successText = `${translate('shop.modal_success_prefix')} "<strong>${itemName}</strong>" ${translate('shop.modal_success_suffix')}`;

                modal.success(translate('shop.modal_success_title'), successText);

            } catch (error: any) {
                dealerMessage = translate('shop.dealer_error');
                modal.error(translate('shop.modal_error_title'), error.message || "Error.");
            } finally {
                purchasingItemId = null;
            }
        });
    }
</script>

<svelte:head>
    <title>{$t('shop.title')} | The Glitch Pit</title>
</svelte:head>

<div class="page-container">
    <div class="bg-blur-1"></div>
    <div class="bg-blur-2"></div>

    <div class="market-header">
        <img src="/casino/orioncasino.png" alt="Торговец Орион" class="dealer-art"/>
        <div class="dealer-dialogue">
            <p>{dealerMessage}</p>
        </div>
    </div>

    <div class="user-panel">
        <div class="balance-display">
            <span class="label font-display">{$t('shop.balance_label')}</span>
            <span class="amount font-display">{Math.floor($displayedCredits)} PC</span>
        </div>
        <div class="actions-group">
             <a href="/casino/inventory" class="panel-btn inventory">{$t('shop.btn_inventory')}</a>
             <a href="/casino" class="panel-btn lobby">{$t('shop.btn_lobby')}</a>
        </div>
    </div>

    <div class="items-grid">
        {#each data.items as item (item.id)}
            <div
                class="item-card"
                class:owned={ownedItems.has(item.id)}
                class:purchasing={purchasingItemId === item.id}
            >
                <div class="item-preview">
                    <div class="avatar-wrapper {item.id}">
                        <div class="avatar-placeholder"></div>
                    </div>
                </div>
                <div class="item-info">
                    <h3 class="item-name font-display">{item.name}</h3>
                    <p class="item-desc">{item.description}</p>
                </div>
                <div class="item-footer">
                    <span class="item-price font-display">{item.price} PC</span>
                    {#if ownedItems.has(item.id)}
                        <button class="panel-btn" disabled>{$t('shop.btn_owned')}</button>
                    {:else if !$userStore.user || $userStore.user.casino_credits < item.price}
                        <button class="panel-btn" disabled>{$t('shop.btn_poor')}</button>
                    {:else}
                        <button
                            class="panel-btn shop"
                            on:click={() => purchaseItem(item.id, item.name, item.price)}
                            disabled={purchasingItemId !== null}
                        >
                            {purchasingItemId === item.id ? $t('shop.processing') : $t('shop.btn_buy')}
                        </button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    @keyframes float-blur-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(100px, 50px); } }
    @keyframes float-blur-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-80px, -60px); } }

    .page-container {
        min-height: calc(100vh - 64px);
        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        position: relative; overflow: hidden; background: #0a0a0a; padding: 2rem;
    }
    .bg-blur-1, .bg-blur-2 { position: absolute; width: 400px; height: 400px; border-radius: 50%; filter: blur(150px); pointer-events: none; z-index: 0; }
    .bg-blur-1 { background: var(--cyber-red); top: 10%; left: 10%; animation: float-blur-1 20s infinite ease-in-out; }
    .bg-blur-2 { background: var(--cyber-cyan); bottom: 10%; right: 10%; animation: float-blur-2 25s infinite ease-in-out; }

    .market-header { text-align: center; margin-bottom: 2rem; z-index: 2; }
    .dealer-art { max-width: 350px; max-height: 220px; margin: 0 auto; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5)); }
    .dealer-dialogue {
        background: rgba(10,10,10,0.7); border: 1px solid var(--border-color);
        padding: 0.5rem 1.5rem; display: inline-block; margin-top: -1.5rem;
        position: relative; font-family: 'Chakra Petch', monospace; color: #ddd;
        max-width: 90%;
    }

    .user-panel {
        width: 100%; max-width: 900px;
        display: flex; justify-content: space-between; align-items: center;
        background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem;
        padding: 1rem 1.5rem; margin-bottom: 3rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); z-index: 2;
        gap: 1rem;
    }
    .balance-display { font-size: 1.5rem; flex-shrink: 0; }
    .balance-display .label { color: var(--text-muted-color); margin-right: 0.5rem; }
    .balance-display .amount { color: var(--cyber-yellow); letter-spacing: 0.1em; }

    .actions-group { display: flex; gap: 1rem; }
    .panel-btn {
        padding: 0.75rem 1.5rem; font-family: 'Chakra Petch', monospace; font-weight: bold;
        color: rgba(255, 255, 255, 0.8); text-transform: uppercase; letter-spacing: 0.05em;
        text-decoration: none; text-align: center;
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
        border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 0.75rem;
        box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease-in-out;
        white-space: nowrap;
    }
    .panel-btn:hover:not(:disabled) { color: #fff; transform: translateY(-2px); }
    .panel-btn:active:not(:disabled) { transform: translateY(1px); box-shadow: inset 2px 2px 5px rgba(0,0,0,0.5); }
    .panel-btn.inventory:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-cyan); }
    .panel-btn.shop:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-yellow); }
    .panel-btn.lobby:hover:not(:disabled) { box-shadow: -4px -4px 8px rgba(255, 255, 255, 0.05), 4px 4px 8px rgba(0, 0, 0, 0.3), inset 1px 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px var(--cyber-purple); }
    .panel-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }


    .items-grid {
        width: 100%; max-width: 1200px;
        display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 2rem; z-index: 2;
    }
    .item-card {
        background: rgba(20, 20, 25, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        display: flex; flex-direction: column; overflow: hidden;
        transition: transform 0.3s, box-shadow 0.3s;
    }
    .item-card:hover:not(.owned) { transform: translateY(-5px); box-shadow: 0 12px 40px 0 rgba(0,0,0,0.5), 0 0 20px var(--cyber-yellow); }
    .item-card.owned { filter: grayscale(0.8) brightness(0.6); }
    .item-card.purchasing { filter: brightness(0.8); pointer-events: none; }

    .item-preview {
        height: 180px; background: #111;
        display: flex; align-items: center; justify-content: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }
    .avatar-wrapper {
        position: relative;
        width: 100px;
        height: 100px;
        border-radius: 50%;
    }
    .avatar-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: #333;
    }

    .item-info { padding: 1rem; text-align: center; flex-grow: 1; }
    .item-name { font-size: 1.5rem; color: #fff; margin-bottom: 0.5rem; }
    .item-desc { font-size: 0.9rem; color: var(--text-muted-color); line-height: 1.5; }

    .item-footer {
        padding: 1rem;
        border-top: 1px solid rgba(255, 255, 255, 0.15);
        display: flex; justify-content: space-between; align-items: center;
        background: rgba(0,0,0,0.2);
    }
    .item-price { font-size: 1.25rem; color: var(--cyber-yellow); font-weight: bold; }

    @media (max-width: 768px) {
        .user-panel { flex-direction: column; gap: 1rem; }
        .actions-group { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
        .panel-btn { font-size: 0.8rem; padding: 0.6rem; }
        .items-grid { grid-template-columns: 1fr; }
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
</style>