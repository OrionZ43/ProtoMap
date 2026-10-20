<!-- src/routes/admin/+layout.svelte -->
<!--
    Оболочка админки по макету «Бриф + Бенто»: своя шапка с вкладками вместо
    навбара сайта — корневой +layout.svelte на /admin его не рисует. Общий вид,
    цвета и шрифты — admin.css.
-->
<script lang="ts">
    import './admin.css';
    import { page } from '$app/stores';
    import { t } from 'svelte-i18n';
    import type { LayoutData } from './$types';

    export let data: LayoutData;

    const NAV = [
        { href: '/admin', key: 'dashboard' },
        { href: '/admin/activity', key: 'activity' },
        { href: '/admin/users', key: 'users' },
        { href: '/admin/news', key: 'news' },
        { href: '/admin/tracker', key: 'roadmap' }
    ];

    $: path = $page.url.pathname;
    $: isOn = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
    $: initial = (data.user?.username ?? '?').charAt(0).toUpperCase();
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@300;400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="adm">
    <div class="adm-wrap">
        <header class="adm-top">
            <a class="adm-logo" href="/admin">
                <span class="adm-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M4 9.5c0-1.4 1.1-2.5 2.5-2.5h11c1.4 0 2.5 1.1 2.5 2.5v3.5c0 2.2-1.8 4-4 4H8c-2.2 0-4-1.8-4-4V9.5Z" fill="#0a0a0c" /><path d="M7.4 10.6l2.4 1.4M16.6 10.6l-2.4 1.4" stroke="#fcee0a" stroke-width="1.8" stroke-linecap="round" /></svg>
                </span>
                ProtoMap
            </a>

            <nav class="adm-pills" aria-label={$t('admin_nav.aria')}>
                {#each NAV as item (item.href)}
                    <a href={item.href} class:on={isOn(item.href)} aria-current={isOn(item.href) ? 'page' : undefined}>
                        {$t(`admin_nav.${item.key}`)}
                    </a>
                {/each}
            </nav>

            <div class="adm-tools">
                <a class="adm-round" href="/" title={$t('admin_nav.exit')} aria-label={$t('admin_nav.exit')}>
                    <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
                </a>
                <span class="adm-me" title={data.user?.username ?? ''}>{initial}</span>
            </div>
        </header>

        <!-- div, а не main: <main> уже есть в корневом +layout.svelte. -->
        <div class="adm-main">
            <slot />
        </div>
    </div>
</div>
