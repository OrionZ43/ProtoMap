<script lang="ts">
    import { userStore } from '$lib/stores';
    import { auth } from '$lib/firebase';
    import { signOut } from 'firebase/auth';
    import { afterNavigate } from '$app/navigation';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { getSeasonalContent } from '$lib/seasonal/seasonalContent';
    import { settingsStore } from '$lib/stores/settingsStore';
    import Footer from "$lib/components/Footer.svelte";
    import { page } from '$app/stores';
    import { slide, fade, scale } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { onMount } from 'svelte';
    import { t, locale } from 'svelte-i18n';

    const seasonal = getSeasonalContent();
    let isMobileMenuOpen = false;
    let isUserMenuOpen = false;
    let isSettingsOpen = false;

    let hasUnreadNews = false;
    $: latestNewsDate = $page.data.latestNewsDate;
    $: isAdmin = $page.data.isAdmin;

    onMount(() => {
        checkUnreadNews();
    });

    function checkUnreadNews() {
        if (!latestNewsDate) return;
        const lastViewed = localStorage.getItem('protomap_last_news_view');

        if (!lastViewed) {
            hasUnreadNews = true;
        } else {
            if (new Date(latestNewsDate) > new Date(lastViewed)) {
                hasUnreadNews = true;
            }
        }
    }

    function markNewsAsRead() {
        if (latestNewsDate) {
            localStorage.setItem('protomap_last_news_view', new Date().toISOString());
            hasUnreadNews = false;
        }
    }

    function changeLang(newLang: string) {
        locale.set(newLang);
        localStorage.setItem('protomap_lang', newLang);
    }

    function toggleMobileMenu() { isMobileMenuOpen = !isMobileMenuOpen; isUserMenuOpen = false; isSettingsOpen = false; }
    function toggleUserMenu() { isUserMenuOpen = !isUserMenuOpen; isSettingsOpen = false; }
    function toggleSettings() { isSettingsOpen = !isSettingsOpen; isUserMenuOpen = false; }

    function closeAllMenus() {
        isMobileMenuOpen = false;
        isUserMenuOpen = false;
        isSettingsOpen = false;
    }

    function handleBackdropClick() { closeAllMenus(); }

    afterNavigate(() => { closeAllMenus(); });
    async function handleLogout() { await signOut(auth); closeAllMenus(); }

    function getEncodedUsername(username: string | undefined | null): string {
        if (!username) return '';
        return encodeURIComponent(username.trim());
    }

    const displayedCredits = tweened(0, { duration: 500, easing: quintOut });
    $: if ($userStore.user) { displayedCredits.set($userStore.user.casino_credits); }

    $: activeRoute = $page.url.pathname;
    function isActive(path: string) {
        if (path === '/' && activeRoute === '/') return true;
        if (path !== '/' && activeRoute.startsWith(path)) return true;
        return false;
    }
</script>

{#if isUserMenuOpen || isSettingsOpen}
    <div class="fixed inset-0 z-40" on:click={handleBackdropClick}></div>
{/if}

<nav class="navbar-glass sticky top-0 z-50 w-full px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16 relative">

        <!-- 1. ЛОГОТИП И ФРАЗА -->
        <div class="flex-shrink-0 flex items-center gap-3 z-20">
            <!-- Ссылка теперь одна, и она содержит и лого, и текст -->
            <a href="/" class="flex items-center gap-2 group text-decoration-none">
                <div class="logo-container">
                    <img src="/logo.svg" alt="Logo" class="logo-icon" />
                </div>
                <!-- Текст "PROTOMAP" скрыт на мобильных (до lg) -->
                <span class="nav-brand text-2xl font-bold tracking-widest hidden lg:block" data-text="PROTOMAP">
                    PROTOMAP
                </span>
            </a>

            <!-- Сезонная фраза. Теперь она в отдельном контейнере для управления переносом -->
            <div class="seasonal-phrase-container">
                 <a href={seasonal.link} target="_blank" rel="noopener noreferrer" class="hover:text-cyan-400 transition-colors">
                    {seasonal.phrase}
                 </a>
            </div>
        </div>

        <!-- 2. ЦЕНТРАЛЬНОЕ МЕНЮ (DESKTOP) -->
        <div class="hidden lg:flex items-center justify-center space-x-1 absolute left-1/2 transform -translate-x-1/2 h-full z-10">
            <a href="/" class="nav-tab" class:active={isActive('/')}>
                {$t('nav.map')}
                <div class="tab-line"></div>
            </a>

            <a href="/news" class="nav-tab" class:active={isActive('/news')} on:click={markNewsAsRead}>
                {$t('nav.news')}
                {#if hasUnreadNews} <span class="notification-dot"></span> {/if}
                <div class="tab-line"></div>
            </a>

            <a href="/casino" class="nav-tab glitch-link" class:active={isActive('/casino')} data-text="THE GLITCH PIT">
                {$t('nav.casino')}
                <div class="tab-line"></div>
            </a>
            <a href="/about" class="nav-tab" class:active={isActive('/about')}>
                {$t('nav.about')}
                <div class="tab-line"></div>
            </a>

            <div class="nav-divider"></div>

            <a href="/ai-policy" class="nav-tab text-red-500 hover:text-red-400" class:active={isActive('/ai-policy')}>
                Censored by r/protogen
                <div class="tab-line red"></div>
            </a>
        </div>

        <!-- 3. ПРАВАЯ ЧАСТЬ (DESKTOP) -->
        <div class="hidden lg:flex items-center gap-3 z-20">
            {#if $userStore.user}
                <div class="balance-pill" title={$t('ui.balance')}>
                    <span class="text-xs text-cyber-yellow font-bold tracking-wider">PC</span>
                    <span class="font-mono font-bold">{Math.floor($displayedCredits)}</span>
                </div>
            {/if}

            {#if isAdmin}
                <a href="/admin" class="icon-btn admin-btn" title="GOD MODE">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
                </a>
            {/if}

            <div class="relative">
                 <button class="icon-btn" class:active={isSettingsOpen} on:click={toggleSettings} aria-label="Settings">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
                </button>
                {#if isSettingsOpen}
                    <div class="cyber-dropdown" transition:scale={{duration: 150, start: 0.95, opacity: 0}}>
                        <div class="dropdown-header">// {$t('menu.system')}</div>
                        <div class="px-4 py-2">
                            <div class="setting-row mb-3">
                                <span class="text-sm text-gray-300 font-display">{$t('menu.lang')}</span>
                                <div class="lang-switch">
                                    <button class="lang-btn" class:active={$locale === 'ru'} on:click={() => changeLang('ru')}>RU</button>
                                    <button class="lang-btn" class:active={$locale === 'en'} on:click={() => changeLang('en')}>EN</button>
                                </div>
                            </div>
                            <label class="setting-row">
                                <span>{$t('menu.sound')}</span>
                                <input type="checkbox" bind:checked={$settingsStore.audioEnabled} class="cyber-switch">
                            </label>
                            <label class="setting-row mt-3">
                                <span>{$t('menu.anim')}</span>
                                <input type="checkbox" bind:checked={$settingsStore.cinematicLoadsEnabled} class="cyber-switch">
                            </label>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="h-6 w-px bg-white/10 mx-1"></div>

            {#if $userStore.loading}
                <div class="h-9 w-24 bg-gray-800 rounded-full animate-pulse"></div>
            {:else if $userStore.user}
                <div class="relative">
                    <button on:click={toggleUserMenu} class="user-pill" class:active={isUserMenuOpen}>
                        <div class="avatar-container small {$userStore.user.equipped_frame || ''}">
                            <img src={$userStore.user.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$userStore.user.username}`} alt="Avatar" class="user-avatar" />
                        </div>
                        <span class="username">{$userStore.user.username}</span>
                        <svg class="chevron" class:rotate={isUserMenuOpen} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    {#if isUserMenuOpen}
                        <div class="cyber-dropdown" transition:scale={{duration: 150, start: 0.95, opacity: 0}}>
                            <div class="dropdown-header">// {$t('menu.profile')}</div>
                            <a href="/profile/{getEncodedUsername($userStore.user.username)}" class="dropdown-item">
                                <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {$t('menu.profile')}
                            </a>
                            <a href="/casino/inventory" class="dropdown-item">
                                <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                {$t('menu.inventory')}
                            </a>
                            <div class="dropdown-divider"></div>
                            <button on:click={handleLogout} class="dropdown-item text-red">
                                <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                {$t('menu.logout')}
                            </button>
                        </div>
                    {/if}
                </div>
            {:else}
                <a href="/login" class="text-sm font-bold text-gray-300 hover:text-white mr-3 transition-colors font-display tracking-wide">{$t('nav.login')}</a>
                <NeonButton href="/register" extraClass="text-xs px-5 py-1.5 !border-[1px]">{$t('nav.register')}</NeonButton>
            {/if}
        </div>

        <!-- 4. МОБИЛЬНОЕ МЕНЮ -->
        <div class="lg:hidden flex items-center gap-3">
            {#if $userStore.user}
                <div class="balance-pill mobile">
                    <span class="text-[10px] text-cyber-yellow font-bold">PC</span>
                    <span class="font-mono text-sm font-bold">{Math.floor($displayedCredits)}</span>
                </div>
            {/if}

            <button on:click={toggleMobileMenu} class="p-2 text-gray-400 hover:text-white transition-colors relative">
                {#if isMobileMenuOpen}
                    <svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                {:else}
                    <svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    {#if hasUnreadNews}
                        <span class="notification-dot mobile-icon"></span>
                    {/if}
                {/if}
            </button>
        </div>
    </div>

    {#if isMobileMenuOpen}
        <div class="lg:hidden bg-[#050a10]/95 backdrop-blur-xl border-b border-gray-800 absolute w-full left-0 z-40 shadow-2xl" transition:slide>
            <div class="py-2 space-y-1">
                <a href="/" class="mobile-link" class:active={isActive('/')}>{$t('nav.map')}</a>
                <a href="/news" class="mobile-link relative" class:active={isActive('/news')} on:click={markNewsAsRead}>
                    {$t('nav.news')}
                    {#if hasUnreadNews} <span class="notification-dot mobile"></span> {/if}
                </a>
                <a href="/casino" class="mobile-link glitch-text-mobile" class:active={isActive('/casino')}>{$t('nav.casino')}</a>
                <a href="/about" class="mobile-link" class:active={isActive('/about')}>{$t('nav.about')}</a>

                <div class="border-t border-white/10 my-2"></div>

                {#if $userStore.user}
                    <div class="px-4 py-3 flex items-center gap-3 bg-white/5 mx-2 rounded-lg border border-white/5">
                        <div class="avatar-container small {$userStore.user.equipped_frame || ''}">
                            <img src={$userStore.user.avatar_url} class="user-avatar" alt=""/>
                        </div>
                        <div>
                            <p class="text-white font-bold leading-tight font-display">{$userStore.user.username}</p>
                            <p class="text-xs text-gray-400 font-mono">ID: {$userStore.user.uid.substring(0,6)}</p>
                        </div>
                    </div>
                    <a href="/profile/{getEncodedUsername($userStore.user.username)}" class="mobile-sub-link">{$t('menu.profile')}</a>
                    <a href="/casino/inventory" class="mobile-sub-link">{$t('menu.inventory')}</a>
                    <button on:click={handleLogout} class="mobile-sub-link text-red-400">{$t('menu.logout')}</button>
                {:else}
                    <a href="/login" class="mobile-link">{$t('nav.login')}</a>
                    <a href="/register" class="mobile-link">{$t('nav.register')}</a>
                {/if}

                {#if isAdmin}
                    <a href="/admin" class="mobile-link text-red-500 border-l-red-500">
                        💀 GOD MODE
                    </a>
                {/if}

                <div class="border-t border-white/10 my-2"></div>

                <div class="px-4 py-2">
                    <p class="text-xs text-gray-500 uppercase mb-2 font-bold tracking-wider font-mono">// {$t('menu.system')}</p>
                    <div class="flex items-center justify-between py-3 border-b border-white/5">
                        <span class="text-sm text-gray-300 font-display">{$t('menu.lang')}</span>
                        <div class="lang-switch">
                            <button class="lang-btn" class:active={$locale === 'ru'} on:click={() => changeLang('ru')}>RU</button>
                            <button class="lang-btn" class:active={$locale === 'en'} on:click={() => changeLang('en')}>EN</button>
                        </div>
                    </div>
                    <label class="flex items-center justify-between py-3 border-b border-white/5">
                        <span class="text-sm text-gray-300 font-display">{$t('menu.sound')}</span>
                        <input type="checkbox" bind:checked={$settingsStore.audioEnabled} class="cyber-switch">
                    </label>
                    <label class="flex items-center justify-between py-3">
                        <span class="text-sm text-gray-300 font-display">{$t('menu.anim')}</span>
                        <input type="checkbox" bind:checked={$settingsStore.cinematicLoadsEnabled} class="cyber-switch">
                    </label>
                </div>
                <div class="px-4 pb-4">
                    <Footer mode="menu"/>
                </div>
            </div>
        </div>
    {/if}
</nav>

<style>
    .navbar-glass {
        background: rgba(5, 8, 12, 0.85);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
    }

    .logo-container {
        width: 50px; height: 50px;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.3s;
        margin-right: 4px;
        flex-shrink: 0;
    }
    a:hover .logo-container { transform: scale(1.15) rotate(-5deg); }
    .logo-icon {
        width: 100%; height: 100%; object-fit: contain;
        filter: invert(1) drop-shadow(0 0 5px var(--cyber-yellow));
    }

    .seasonal-phrase-container {
        display: block;
        font-size: 0.7rem; /* 11px */
        line-height: 1.3;
        color: #6b7280;
        max-width: 150px; /* Заставляет текст переноситься */
        font-family: 'Chakra Petch', monospace;
    }
    .seasonal-phrase-container a:hover { color: #67e8f9; }

    @media (min-width: 1024px) { /* lg breakpoint */
        .seasonal-phrase-container {
            border-left: 1px solid #374151;
            padding-left: 0.75rem;
            font-size: 0.75rem;
            max-width: none;
            white-space: nowrap;
        }
    }
    @media (max-width: 768px) {
        .logo-container { width: 42px; height: 42px; }
    }

    .notification-dot {
        position: absolute; top: 12px; right: 2px;
        width: 8px; height: 8px;
        background-color: var(--cyber-red, #ff003c); border-radius: 50%;
        box-shadow: 0 0 8px var(--cyber-red, #ff003c);
        animation: pulse-dot 2s infinite; pointer-events: none; z-index: 10;
    }
    .notification-dot.mobile { top: 50%; right: 20px; transform: translateY(-50%); }
    .notification-dot.mobile-icon { top: 5px; right: 5px; width: 10px; height: 10px; border: 2px solid #050a10; }
    @keyframes pulse-dot { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }

    .nav-tab {
    position: relative; padding: 0 0.8rem; height: 100%;
    display: flex; align-items: center;
    font-family: 'Chakra Petch', monospace; font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em; color: #94a3b8; transition: color 0.3s; text-transform: uppercase;
    white-space: nowrap;
    }
    .nav-tab:hover { color: #fff; text-shadow: 0 0 8px rgba(255,255,255,0.5); }
    .nav-tab.active { color: #fff; }

    .tab-line {
        position: absolute; bottom: 0; left: 0; width: 100%; height: 2px;
        background: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 -2px 10px var(--cyber-yellow, #fcee0a);
        transform: scaleX(0); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: center;
    }
    .nav-tab:hover .tab-line, .nav-tab.active .tab-line { transform: scaleX(1); }

    .glitch-link:hover {
        animation: glitch-skew 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both infinite;
        color: var(--cyber-red, #ff003c);
        text-shadow: 2px 0 #00f0ff, -2px 0 #ff003c;
    }
    @keyframes glitch-skew { 0% { transform: skew(0deg); } 20% { transform: skew(-2deg); } 40% { transform: skew(2deg); } 60% { transform: skew(-1deg); } 80% { transform: skew(1deg); } 100% { transform: skew(0deg); } }

    .balance-pill {
        display: flex; align-items: center; gap: 0.5rem;
        background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0.3rem 0.8rem; border-radius: 6px; color: #e2e8f0;
        transition: all 0.2s; font-family: 'Chakra Petch', monospace;
    }
    .balance-pill:hover { border-color: var(--cyber-yellow); box-shadow: 0 0 10px rgba(252, 238, 10, 0.1); }
    .balance-pill.mobile { padding: 0.2rem 0.6rem; background: rgba(0,0,0,0.4); }

    .icon-btn { padding: 0.5rem; color: #94a3b8; border-radius: 8px; transition: all 0.2s; }
    .icon-btn:hover, .icon-btn.active { color: #fff; background: rgba(255, 255, 255, 0.1); }

    .user-pill {
        display: flex; align-items: center; gap: 0.75rem;
        padding: 0.25rem 0.25rem 0.25rem 0.25rem; padding-right: 0.75rem;
        background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 99px; transition: all 0.2s; cursor: pointer;
    }
    .user-pill:hover, .user-pill.active { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.3); }
    .username { font-family: 'Chakra Petch', monospace; font-weight: 600; font-size: 0.9rem; color: #e2e8f0; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chevron { color: #64748b; transition: transform 0.2s; }
    .chevron.rotate { transform: rotate(180deg); }

    .avatar-container.small { width: 32px; height: 32px; position: relative; border-radius: 50%; flex-shrink: 0; }
    .avatar-container.small:not([class*="frame_"]) { border: 1px solid rgba(255,255,255,0.3); }
    .user-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: none !important; }

    .cyber-dropdown {
        position: absolute; top: calc(100% + 8px); right: 0; width: 240px;
        background: rgba(8, 12, 18, 0.95); backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px;
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6); z-index: 100; overflow: hidden; transform-origin: top right;
    }
    .dropdown-header { padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.05); font-family: 'Chakra Petch', monospace; }
    .dropdown-item { display: flex; align-items: center; width: 100%; padding: 0.75rem 1rem; font-size: 0.9rem; color: #cbd5e1; transition: all 0.2s; text-align: left; font-family: 'Inter', sans-serif; }
    .dropdown-item:hover { background: rgba(255, 255, 255, 0.05); color: #fff; padding-left: 1.25rem; }
    .dropdown-item .icon { width: 18px; height: 18px; margin-right: 10px; opacity: 0.7; }
    .dropdown-item:hover .icon { opacity: 1; color: var(--cyber-yellow); }
    .dropdown-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0; }
    .text-red { color: #ef4444; }
    .text-red:hover { color: #f87171; background: rgba(239, 68, 68, 0.1); }

    .setting-row { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; font-size: 0.9rem; color: #cbd5e1; }
    .setting-row:hover { color: #fff; }
    .cyber-switch { appearance: none; width: 36px; height: 20px; background: #334155; border-radius: 99px; position: relative; cursor: pointer; transition: all 0.3s; border: 1px solid #475569; }
    .cyber-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: #94a3b8; border-radius: 50%; transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1); }
    .cyber-switch:checked { background: rgba(0, 240, 255, 0.2); border-color: var(--cyber-yellow); }
    .cyber-switch:checked::after { left: 18px; background: var(--cyber-yellow); box-shadow: 0 0 10px var(--cyber-yellow); }

    .mobile-link { display: block; padding: 0.75rem 1rem; font-family: 'Chakra Petch', monospace; font-weight: bold; color: #9ca3af; border-left: 2px solid transparent; }
    .mobile-link:hover { color: #fff; }
    .mobile-link.active { color: var(--cyber-yellow); border-left-color: var(--cyber-yellow); background: linear-gradient(to right, rgba(255,255,255,0.05), transparent); }
    .mobile-sub-link { display: block; padding: 0.75rem 1rem 0.75rem 3rem; font-size: 0.95rem; color: #cbd5e1; border-left: 2px solid transparent; }
    .mobile-sub-link:hover { color: #fff; background: rgba(255,255,255,0.03); }

    .admin-btn {
        color: #ff003c;
        border: 1px solid rgba(255, 0, 60, 0.3);
        background: rgba(255, 0, 60, 0.1);
    }
    .admin-btn:hover {
        background: rgba(255, 0, 60, 0.2);
        box-shadow: 0 0 15px #ff003c;
        transform: scale(1.05);
    }

    .lang-switch {
        display: flex;
        background: #334155;
        border-radius: 6px;
        padding: 2px;
        border: 1px solid #475569;
        margin-left: 1rem;
    }
    .lang-btn {
        padding: 2px 8px;
        font-size: 0.8rem;
        font-weight: bold;
        color: #94a3b8;
        border-radius: 4px;
        transition: all 0.2s;
        background: transparent;
        border: none;
        cursor: pointer;
    }
    .lang-btn.active {
        background: var(--cyber-yellow);
        color: #000;
        box-shadow: 0 0 5px var(--cyber-yellow);
    }
    .lang-btn:hover:not(.active) {
        color: #fff;
    }
    .tab-line.red {
    background: var(--cyber-red, #ff003c);
    box-shadow: 0 -2px 10px var(--cyber-red, #ff003c);
    }
    .nav-divider {
    height: 20px;
    width: 1px;
    background: rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 5px rgba(0, 243, 255, 0.3);
    margin: 0 0.5rem; /* Отступы по бокам */
}
</style>