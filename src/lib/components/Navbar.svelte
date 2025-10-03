<script lang="ts">
    import { userStore } from '$lib/stores';
    import { auth } from '$lib/firebase';
    import { signOut } from 'firebase/auth';
    import { afterNavigate } from '$app/navigation';
    import NeonButton from '$lib/components/NeonButton.svelte';

    let isMobileMenuOpen = false;

    function toggleMobileMenu() {
        isMobileMenuOpen = !isMobileMenuOpen;
    }

    function closeMenu() {
        if (isMobileMenuOpen) {
            isMobileMenuOpen = false;
        }
    }

    afterNavigate(() => {
        closeMenu();
    });

    async function handleLogout() {
        await signOut(auth);
        closeMenu();
    }

    function getEncodedUsername(username: string | undefined | null): string {
        if (!username) return '';
        return encodeURIComponent(username.trim());
    }

</script>

<nav class="bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50 border-b border-cyber-yellow/20">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
            <div class="flex-shrink-0 flex items-baseline space-x-2">
                <a href="/" class="nav-brand" data-text="PROTOMAP">PROTOMAP</a>
                <span class="text-gray-500 text-xs mt-1 hidden sm:inline">
                     by <a href="https://t.me/Orion_Z43" target="_blank" rel="noopener noreferrer" class="font-semibold text-gray-400 hover:text-cyan-400 transition-colors duration-150">Orion_Z43</a>
                </span>
            </div>

            <div class="hidden md:flex items-center space-x-6">
                <a href="/about" class="nav-link-btn">О проекте</a>

                <div class="flex items-center space-x-4">
                    <div class="h-6 w-px bg-gray-600"></div>

                    {#if $userStore.loading}
                        <div class="h-5 w-32 bg-gray-700/50 rounded animate-pulse"></div>
                    {:else if $userStore.user}
                        <span class="text-gray-400 text-sm">
                            Привет, <a href="/profile/{$userStore.user.username}" class="font-bold text-white hover:text-cyber-yellow transition-colors">{$userStore.user.username}</a>!
                        </span>
                        <button on:click={handleLogout} class="nav-link-btn">Выйти</button>
                    {:else}
                        <a href="/login" class="nav-link-btn">Войти</a>
                        <NeonButton href="/register" extraClass="text-sm">Регистрация</NeonButton>
                    {/if}
                </div>
            </div>


            <div class="flex md:hidden">
                <div class="relative">
                    <button on:click={toggleMobileMenu} type="button" class="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700/50 focus:outline-none transition-colors">
                        <span class="sr-only">Открыть меню</span>
                        <svg class:hidden={isMobileMenuOpen} class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        <svg class:hidden={!isMobileMenuOpen} class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    {#if isMobileMenuOpen}
                        <div
                            class="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-gray-900/95 backdrop-blur-lg ring-1 ring-black ring-opacity-5 focus:outline-none user-dropdown"
                            role="menu" aria-orientation="vertical"
                        >
                            <div class="py-1">
                                {#if $userStore.user}
                                    <div class="px-4 py-3 text-sm text-gray-400">
                                        <span class="font-bold text-white">{$userStore.user.username}</span>
                                    </div>
                                    <hr class="border-gray-700">
                                    <a href="/profile/{$userStore.user.username}" class="mobile-menu-link">Мой профиль</a>
                                    <a href="/profile/edit" class="mobile-menu-link">Редактировать</a>
                                    <button on:click={handleLogout} class="w-full text-left mobile-menu-link">Выйти</button>
                                {:else if !$userStore.loading}
                                    <a href="/login" class="mobile-menu-link">Войти</a>
                                    <a href="/register" class="mobile-menu-link">Зарегистрироваться</a>
                                {/if}
                                <a href="/about" class="mobile-menu-link">О проекте</a>
                                <hr class="border-gray-700 my-1">
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</nav>

<style>
    .nav-brand {
        @apply text-xl lg:text-2xl font-bold uppercase tracking-widest relative cursor-pointer select-none;
        font-family: 'Chakra Petch', sans-serif;
        color: #e0e0e0;
        text-shadow: 0 0 3px rgba(0, 240, 255, 0.7),
                     0 0 5px rgba(0, 240, 255, 0.5);
    }
    .nav-brand::before,
    .nav-brand::after {
        content: attr(data-text);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
    }
    .nav-brand::before {
        left: 2px;
        text-shadow: -2px 0 #ff00c1;
        clip-path: inset(50% 0 50% 0);
    }
    .nav-brand::after {
        left: -2px;
        text-shadow: 2px 0 #00f0ff;
        clip-path: inset(50% 0 50% 0);
    }
    .nav-brand:hover::before {
        animation: glitch-effect 1s infinite linear alternate-reverse;
    }
    .nav-brand:hover::after {
        animation: glitch-effect 1s infinite linear alternate;
    }
    @keyframes glitch-effect {
      0% { clip-path: inset(10% 0 85% 0); }
      20% { clip-path: inset(80% 0 5% 0); }
      40% { clip-path: inset(45% 0 45% 0); }
      60% { clip-path: inset(90% 0 2% 0); }
      80% { clip-path: inset(30% 0 60% 0); }
      100% { clip-path: inset(10% 0 85% 0); }
    }

    .nav-link-btn {
        @apply font-display uppercase tracking-widest text-sm text-gray-300;
        transition: color 0.2s, text-shadow 0.2s;
    }
    .nav-link-btn:hover {
        color: var(--cyber-yellow, #fcee0a);
        text-shadow: 0 0 8px var(--cyber-yellow, #fcee0a);
    }

    .mobile-menu-link {
        @apply block w-full text-left px-4 py-2 text-base text-gray-200 hover:bg-cyan-500/10 hover:text-white;
    }

    .user-dropdown {
        z-index: 100;
    }
</style>