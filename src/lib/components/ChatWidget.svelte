<script lang="ts">
    import { tick, onMount, onDestroy } from 'svelte';
    import { chat } from '$lib/stores';
    import { AudioManager } from '$lib/client/audioManager';
    import GlobalChat    from '$lib/components/chat/GlobalChat.svelte';
    import DMInbox       from '$lib/components/chat/DMInbox.svelte';
    import ChannelsFeed  from '$lib/components/chat/ChannelsFeed.svelte';

    type Tab = 'global' | 'dm' | 'channels';
    let activeTab: Tab = 'global';
    let dmUnread = 0;

    let dmMounted       = false;
    let channelsMounted = false;

    let globalChatRef:    GlobalChat;
    let dmInboxRef:       DMInbox;
    let channelsFeedRef:  ChannelsFeed;

    // ПЕРЕМЕННАЯ ДЛЯ 1 АПРЕЛЯ
    let isAprilFools = false;

    let wasOpen = false;
    chat.subscribe(state => {
        if (state.isOpen && !wasOpen) {
            wasOpen = true;
            if (state.pendingDM) {
                activeTab = 'dm';
                dmMounted = true;
                tick().then(() => {
                    dmInboxRef?.openChatWith(state.pendingDM);
                    chat.clearPendingDM();
                });
            } else {
                tick().then(() => globalChatRef?.onTabActivated());
            }
        } else if (!state.isOpen) {
            wasOpen = false;
        }
    });

    onMount(() => {
        // Проверка на 1 апреля
        const d = new Date();
        if (d.getMonth() === 3 && d.getDate() === 1) { // 3 = Апрель
            isAprilFools = true;
        }
        // Раскомментируй строку ниже, чтобы протестировать прямо сейчас:
        // isAprilFools = true;

        function handleOpenDM() {
            dmMounted = true;
            activeTab = 'dm';
        }
        window.addEventListener('protomap:open-dm', handleOpenDM);
        return () => window.removeEventListener('protomap:open-dm', handleOpenDM);
    });

    function switchTab(tab: Tab) {
        activeTab = tab;
        if (tab === 'dm')       dmMounted       = true;
        if (tab === 'channels') channelsMounted = true;
        tick().then(() => {
            if (tab === 'global')   globalChatRef?.onTabActivated();
            if (tab === 'dm')       dmInboxRef?.onTabActivated();
            if (tab === 'channels') channelsFeedRef?.onTabActivated();
        });
    }

    function closeWidget() {
        chat.close();
        AudioManager.play('popup_close');
    }
</script>

<div class="chat-widget" class:open={$chat.isOpen}>

    <!-- ══ ХЕДЕР С ВКЛАДКАМИ ══════════════════════════════════════════════ -->
    <div class="widget-header">
        <div class="tabs">
            <button class="tab" class:active={activeTab === 'global'} on:click={() => switchTab('global')} title="Общий чат">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path fill-rule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.74c0-1.946 1.37-3.68 3.348-3.97z" clip-rule="evenodd"/>
                </svg>
                <span>ЧАТ</span>
                {#if $chat.hasUnread && activeTab !== 'global'}
                    <span class="tab-dot"></span>
                {/if}
            </button>

            <button class="tab" class:active={activeTab === 'dm'} on:click={() => switchTab('dm')} title="Личные сообщения">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span>ЛИЧКИ</span>
                {#if dmUnread > 0}
                    <span class="tab-badge">{dmUnread > 9 ? '9+' : dmUnread}</span>
                {/if}
            </button>

            <button class="tab" class:active={activeTab === 'channels'} on:click={() => switchTab('channels')} title="Каналы">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M22 8.35V20a2 2 0 01-2 2H4a2 2 0 01-2-2V8.35A2 2 0 012.61 7l8-5a2 2 0 012.78 0l8 5A2 2 0 0122 8.35z"/>
                    <path d="M15 22v-4a5 5 0 00-6 0v4"/>
                </svg>
                <span>КАНАЛЫ</span>
            </button>
        </div>

        <button on:click={closeWidget} class="close-btn" aria-label="Закрыть">×</button>
    </div>

    <!-- ══ КОНТЕНТ ВКЛАДОК ════════════════════════════════════════════════ -->

    {#if isAprilFools}
        <!-- ПАСХАЛКА 1 АПРЕЛЯ -->
        <div class="fools-blocker">
            <div class="fools-icon">⛔</div>
            <h3 class="fools-title">ДОСТУП ОГРАНИЧЕН</h3>
            <p class="fools-text">
                Данный канал связи признан <strong>иностранным агентом</strong> и заблокирован Роскомнадзором за использование шифрования, неугодного государству.<br><br>
                Для продолжения общения перейдите в сертифицированный отечественный мессенджер МАКС.
            </p>
            <a href="https://max.ru/join/qVgOIX1H32cawgozwOs52A0OXLpJFLq_44lT_P55IKs" target="_blank" rel="noopener noreferrer" class="fools-btn">
                ПЕРЕЙТИ В МАКС
            </a>
            <p class="fools-note">Отказ от перехода влечет наложение штрафа в размере 5000 ПротоКоинов.</p>
            <button class="fools-reveal-btn" on:click={() => isAprilFools = false}>
                Ладно, понял я, это 1 апреля. Пусти в чат!
            </button>
        </div>
    {:else}
        <!-- ОБЫЧНЫЙ ЧАТ -->
        <div class="tab-content" class:hidden={activeTab !== 'global'}>
            <GlobalChat bind:this={globalChatRef} />
        </div>

        {#if dmMounted}
            <div class="tab-content" class:hidden={activeTab !== 'dm'}>
                <DMInbox
                    bind:this={dmInboxRef}
                    onUnreadChange={(n) => { dmUnread = n; chat.setDmUnread(n > 0); }}
                />
            </div>
        {/if}

        {#if channelsMounted}
            <div class="tab-content" class:hidden={activeTab !== 'channels'}>
                <ChannelsFeed bind:this={channelsFeedRef} />
            </div>
        {/if}
    {/if}
</div>

<style>
    .chat-widget {
        position: fixed; bottom: 4rem; right: 1rem; z-index: 40;
        width: calc(100vw - 2rem); height: 75vh;
        max-width: 420px; max-height: 650px;
        background: rgba(5, 8, 12, 0.95); backdrop-filter: blur(12px);
        border: 1px solid #30363d; border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
        transform: translateX(120%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex; flex-direction: column; overflow: hidden;
    }
    .chat-widget.open { transform: translateX(0); }

    .widget-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 0.5rem 0 0.25rem;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        flex-shrink: 0; min-height: 42px;
    }

    .tabs { display: flex; align-items: stretch; flex: 1; }

    .tab {
        position: relative; display: flex; align-items: center; gap: 0.3rem;
        padding: 0 0.65rem; height: 42px;
        font-family: 'Chakra Petch', monospace; font-size: 0.62rem;
        font-weight: 700; letter-spacing: 0.08em; color: #475569;
        border-bottom: 2px solid transparent;
        transition: color 0.2s, border-color 0.2s; white-space: nowrap;
    }
    .tab:hover { color: #94a3b8; }
    .tab.active { color: var(--cyber-yellow, #fcee0a); border-bottom-color: var(--cyber-yellow, #fcee0a); }
    .tab svg { flex-shrink: 0; }

    .tab-badge {
        background: #ff003c; color: white; font-size: 0.5rem; font-weight: 900;
        min-width: 14px; height: 14px; border-radius: 7px;
        display: flex; align-items: center; justify-content: center;
        padding: 0 3px; line-height: 1;
    }
    .tab-dot {
        position: absolute; top: 6px; right: 4px;
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 0 4px var(--cyber-yellow, #fcee0a);
    }

    .close-btn {
        font-size: 1.5rem; line-height: 1; color: #4b5563;
        padding: 0.25rem 0.4rem; border-radius: 4px;
        transition: color 0.2s, transform 0.2s; flex-shrink: 0;
    }
    .close-btn:hover { color: white; transform: rotate(90deg); }

    .tab-content {
        flex: 1; min-height: 0; display: flex;
        flex-direction: column; overflow: hidden;
    }
    .tab-content.hidden { display: none; }

    /* === СТИЛИ ДЛЯ ПАСХАЛКИ === */
    .fools-blocker {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        text-align: center;
        background: repeating-linear-gradient(
            45deg,
            #111,
            #111 10px,
            #1a0505 10px,
            #1a0505 20px
        );
        border: 2px solid #ff003c;
    }

    .fools-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
        animation: pulse 1s infinite;
    }

    .fools-title {
        color: #ff003c;
        font-size: 1.5rem;
        font-weight: 900;
        font-family: Arial, sans-serif;
        margin-bottom: 1rem;
        letter-spacing: 0.1em;
    }

    .fools-text {
        color: #ccc;
        font-size: 0.9rem;
        line-height: 1.5;
        margin-bottom: 1.5rem;
    }

    .fools-btn {
        background-color: #0d4cd3;
        color: white;
        padding: 10px 20px;
        font-weight: bold;
        text-decoration: none;
        border-radius: 4px;
        margin-bottom: 1rem;
        box-shadow: 0 4px 15px rgba(13, 76, 211, 0.4);
        transition: transform 0.2s, background-color 0.2s;
    }

    .fools-btn:hover {
        background-color: #0a3a9e;
        transform: scale(1.05);
    }

    .fools-note {
        font-size: 0.7rem;
        color: #ff4444;
        margin-bottom: 2rem;
    }

    .fools-reveal-btn {
        background: transparent;
        border: none;
        color: #555;
        font-size: 0.75rem;
        text-decoration: underline;
        cursor: pointer;
        transition: color 0.2s;
    }

    .fools-reveal-btn:hover {
        color: #888;
    }

    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }
</style>