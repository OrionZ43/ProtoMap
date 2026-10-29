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
    $: username = data.user?.username ?? '';
    // Без своего аватара — картинка DiceBear по нику, как в навбаре сайта
    $: avatar = data.user?.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username)}`;
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
                    <img src="/logo.svg" alt="" />
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
                <!-- Рамка — глобальные правила .comment-avatar-wrapper.frame_* (src/styles/cosmetics.css) -->
                <a
                    class="adm-me comment-avatar-wrapper {data.user?.equippedFrame ?? ''}"
                    href="/u/{data.user?.uid}"
                    title={username}
                    aria-label={$t('admin_nav.profile')}
                >
                    <img src={avatar} alt="" />
                </a>
            </div>
        </header>

        <!-- div, а не main: <main> уже есть в корневом +layout.svelte. -->
        <div class="adm-main">
            <slot />
        </div>
    </div>
</div>
