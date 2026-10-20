<script lang="ts">
    import "../../app.css";
    import { page } from '$app/stores';
    import { t } from 'svelte-i18n';

    $: path = $page.url.pathname;
</script>

<div class="admin-universe">
    <div class="ambient-glow"></div>

    <!-- МОБИЛЬНЫЙ ХЕДЕР (Виден только на телефоне) -->
    <div class="mobile-header">
        <span class="glitch-text small" data-text="OVERLORD">OVERLORD</span>
        <div class="status-dot"></div>
    </div>

    <!-- SIDEBAR (На ПК слева, на Мобиле внизу) -->
    <aside class="glass-sidebar">
        <!-- Логотип (Только ПК) -->
        <div class="brand desktop-only">
            <h1 class="glitch-text" data-text="OVERLORD">OVERLORD</h1>
            <div class="status-dot"></div>
        </div>

        <nav class="nav-links">
            <a href="/admin" class="nav-item" class:active={path === '/admin'}>
                <div class="nav-indicator"></div>
                <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></span>
                <span class="label">{$t('admin_nav.dashboard')}</span>
            </a>
            <a href="/admin/activity" class="nav-item" class:active={path.includes('/activity')}>
                <div class="nav-indicator"></div>
                <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg></span>
                <span class="label">{$t('admin_nav.activity')}</span>
            </a>
            <a href="/admin/news" class="nav-item" class:active={path.includes('/news')}>
                <div class="nav-indicator"></div>
                <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" /></svg></span>
                <span class="label">{$t('admin_nav.news')}</span>
            </a>
            <a href="/admin/users" class="nav-item" class:active={path.includes('/users')}>
                <div class="nav-indicator"></div>
                <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></span>
                <span class="label">{$t('admin_nav.users')}</span>
            </a>
            <a href="/admin/tracker" class="nav-item" class:active={path.includes('/tracker')}>
                <div class="nav-indicator"></div>
                <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg></span>
                <span class="label">{$t('admin_nav.roadmap')}</span>
            </a>
             <!-- Кнопка выхода для мобилок (вместо отдельного блока) -->
             <a href="/" class="nav-item mobile-only text-red-500">
                <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></span>
                <span class="label">{$t('admin_nav.exit')}</span>
            </a>
        </nav>

        <!-- Футер (Только ПК) -->
        <div class="bottom-actions desktop-only">
            <a href="/" class="exit-btn">{$t('admin_nav.exit_god_mode')}</a>
        </div>
    </aside>

    <!-- CONTENT -->
    <main class="admin-viewport">
        <slot />
    </main>
</div>

<style>
    :global(body) { background: #050505; overflow: hidden; }

    .admin-universe {
        display: flex;
        width: 100vw; height: 100vh;
        background: radial-gradient(circle at 10% 20%, #0f172a 0%, #000000 100%);
        position: relative;
        overflow: hidden;
    }

    .ambient-glow {
        position: absolute; width: 600px; height: 600px;
        background: radial-gradient(circle, rgba(0, 243, 255, 0.15), transparent 70%);
        top: -200px; left: -200px; border-radius: 50%;
        filter: blur(80px); pointer-events: none; animation: breathe 10s infinite alternate;
    }
    @keyframes breathe { from { opacity: 0.5; transform: scale(1); } to { opacity: 0.8; transform: scale(1.2); } }

    /* === МОБИЛЬНЫЙ ХЕДЕР === */
    .mobile-header {
        display: none; /* По умолчанию скрыт */
        position: fixed; top: 0; left: 0; right: 0;
        height: 60px; z-index: 20;
        background: rgba(15, 20, 30, 0.8); backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255,255,255,0.1);
        align-items: center; justify-content: space-between; padding: 0 1.5rem;
    }
    .glitch-text.small { font-size: 1.2rem; }

    /* === SIDEBAR / BOTTOM BAR === */
    .glass-sidebar {
        width: 280px; height: 96vh;
        margin: 2vh 0 2vh 2vh;
        background: rgba(15, 20, 30, 0.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        display: flex; flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        z-index: 10;
    }

    .brand {
        padding: 2.5rem 2rem;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        display: flex; justify-content: space-between; align-items: center;
    }
    .glitch-text {
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 1.5rem;
        color: #fff; letter-spacing: 0.1em;
        text-shadow: 0 0 10px rgba(255,255,255,0.5);
    }
    .status-dot {
        width: 8px; height: 8px; background: #00f3ff;
        border-radius: 50%; box-shadow: 0 0 10px #00f3ff;
        animation: blink 2s infinite;
    }

    .nav-links { padding: 2rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; flex-grow: 1; }

    .nav-item {
        position: relative; display: flex; align-items: center; gap: 1rem;
        padding: 1rem 1.5rem;
        color: #64748b; text-decoration: none;
        font-family: 'Chakra Petch', monospace; font-weight: 600; letter-spacing: 0.05em;
        border-radius: 16px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid transparent;
        overflow: hidden;
    }

    .nav-item:hover {
        background: rgba(255, 255, 255, 0.03);
        color: #e2e8f0;
    }

    .icon { display: inline-flex; }
    .icon svg { width: 20px; height: 20px; }

    .nav-item.active {
        background: rgba(0, 243, 255, 0.1);
        border-color: rgba(0, 243, 255, 0.2);
        color: #00f3ff;
        box-shadow: 0 0 30px rgba(0, 243, 255, 0.1);
    }

    .nav-indicator {
        position: absolute; left: 0; top: 50%; transform: translateY(-50%);
        width: 4px; height: 0%; background: #00f3ff;
        border-radius: 0 4px 4px 0; transition: height 0.3s;
        box-shadow: 0 0 10px #00f3ff;
    }
    .nav-item.active .nav-indicator { height: 60%; }

    .bottom-actions { padding: 2rem; border-top: 1px solid rgba(255,255,255,0.05); }

    .exit-btn {
        display: block; text-align: center; padding: 1rem;
        border: 1px solid rgba(255, 0, 60, 0.3); border-radius: 12px;
        color: #ff003c; font-family: 'Chakra Petch', monospace; font-weight: bold;
        text-decoration: none; transition: all 0.3s;
        background: rgba(255, 0, 60, 0.05);
    }
    .exit-btn:hover {
        background: rgba(255, 0, 60, 0.15);
        box-shadow: 0 0 20px rgba(255, 0, 60, 0.2);
        border-color: #ff003c;
    }

    .admin-viewport {
        flex-grow: 1; padding: 2rem 3rem;
        overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: #334155 transparent;
    }

    .mobile-only { display: none; }

    /* === АДАПТИВНОСТЬ (MOBILE) === */
    @media (max-width: 768px) {
        .admin-universe { flex-direction: column; }

        .mobile-header { display: flex; }
        .desktop-only { display: none; }
        .mobile-only { display: flex; }

        .admin-viewport {
            padding: 80px 1rem 100px 1rem; /* Отступы под хедер и футер */
        }

        /* Превращаем Sidebar в Bottom Bar */
        .glass-sidebar {
            position: fixed; bottom: 0; left: 0; width: 100%;
            height: auto; margin: 0;
            flex-direction: row;
            border-radius: 20px 20px 0 0; /* Скругляем только верх */
            border: none; border-top: 1px solid rgba(255,255,255,0.1);
            padding-bottom: env(safe-area-inset-bottom); /* Для iPhone */
        }

        .nav-links {
            flex-direction: row; width: 100%; justify-content: space-between;
            padding: 0.5rem 1rem; gap: 0;
        }

        .nav-item {
            flex-direction: column; padding: 0.5rem; gap: 4px;
            font-size: 0.6rem; border-radius: 8px;
            flex: 1; justify-content: center;
        }

        .nav-item .icon { font-size: 1.2rem; margin-bottom: 2px; }

        /* Индикатор снизу, а не сбоку */
        .nav-indicator {
            left: 50%; bottom: 0; top: auto; transform: translateX(-50%);
            width: 0%; height: 2px; border-radius: 2px 2px 0 0;
            transition: width 0.3s;
        }
        .nav-item.active .nav-indicator { width: 50%; height: 2px; }
    }
</style>