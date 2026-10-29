<!--
    Колокольчик уведомлений в навбаре. Лента — users/{uid}/notifications через
    notificationStore (читает только владелец). Тип admin_message показываем
    как «от администрации» щитом, без имени/аватара админа и без перехода.
    Вид согласован: срез угла как у .cyber-dropdown, жёлтая шапка, боты-аватары.
-->
<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import { browser } from '$app/environment';
    import { scale } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { t, locale } from 'svelte-i18n';
    import { userStore } from '$lib/stores';
    import {
        notifications,
        unreadNotifications,
        startNotifications,
        stopNotifications,
        markRead,
        markAllRead,
        type AppNotification
    } from '$lib/stores/notificationStore';

    let open = false;
    let wrap: HTMLElement;

    // Подписка на ленту, пока пользователь залогинен. Только в браузере:
    // onSnapshot клиентского SDK на сервере (SSR) не нужен и не работает.
    $: if (browser && $userStore.user) startNotifications($userStore.user.uid);
    $: if (browser && !$userStore.user) stopNotifications();
    onDestroy(stopNotifications);

    const toggle = () => (open = !open);
    const close = () => (open = false);

    function onWindowClick(e: MouseEvent) {
        if (open && wrap && !wrap.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
    }

    const dicebear = (seed: string) =>
        `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(seed || 'anon')}`;
    const isAdminMsg = (n: AppNotification) => n.type === 'admin_message';

    // Фраза действия по типу — из локалей (notif.<type>), с именем актора.
    function actionText(n: AppNotification): string {
        const key = `notif.${n.type}`;
        const s = $t(key, { values: { name: n.actor.username } });
        return s === key ? '' : s;
    }

    // Куда ведёт тап. Профиль-комменты — в профиль; каналы/группы — в /messages;
    // admin_message — никуда (перехода нет).
    function hrefOf(n: AppNotification): string | null {
        if (n.type === 'profile_comment' || n.type === 'profile_comment_reply') {
            return n.target.profileUid ? `/u/${n.target.profileUid}` : null;
        }
        if (n.type === 'channel_comment' || n.type === 'channel_comment_reply' || n.type === 'group_reply') {
            return '/messages';
        }
        return null;
    }

    async function openNotif(n: AppNotification) {
        if (!n.read) markRead(n.id);
        const href = hrefOf(n);
        close();
        if (href) {
            await tick();
            goto(href);
        }
    }

    // Относительное время на текущей локали (Intl сам склоняет).
    function ago(d: Date | null): string {
        if (!d) return '';
        const sec = Math.round((Date.now() - d.getTime()) / 1000);
        const rtf = new Intl.RelativeTimeFormat($locale || 'ru', { numeric: 'auto' });
        const units: [Intl.RelativeTimeFormatUnit, number][] = [
            ['year', 31536000],
            ['month', 2592000],
            ['day', 86400],
            ['hour', 3600],
            ['minute', 60]
        ];
        for (const [unit, s] of units) {
            if (Math.abs(sec) >= s) return rtf.format(-Math.round(sec / s), unit);
        }
        return rtf.format(-sec, 'second');
    }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<div class="bell-wrap" bind:this={wrap}>
    <button class="icon-btn" class:active={open} on:click={toggle}
        aria-label={$t('notif.title')} title={$t('notif.title')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {#if $unreadNotifications > 0}
            <span class="count">{$unreadNotifications > 99 ? '99+' : $unreadNotifications}</span>
        {/if}
    </button>

    {#if open}
        <div class="panel" transition:scale={{ duration: 150, start: 0.96, opacity: 0 }}>
            <div class="panel-head">
                <span class="ttl">// {$t('notif.title')}</span>
                {#if $unreadNotifications > 0}
                    <button class="mark-all" on:click={markAllRead}>{$t('notif.mark_all')}</button>
                {/if}
            </div>
            <div class="list">
                {#each $notifications as n (n.id)}
                    <button class="row" class:unread={!n.read} on:click={() => openNotif(n)}>
                        {#if isAdminMsg(n)}
                            <span class="av shield" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                            </span>
                            <span class="body">
                                <span class="line"><b>{$t('notif.admin_title')}</b></span>
                                <span class="preview adm">{n.text}</span>
                                <span class="time">{ago(n.createdAt)}</span>
                            </span>
                        {:else}
                            <span class="av">
                                <img src={n.actor.avatarUrl || dicebear(n.actor.username)} alt="" referrerpolicy="no-referrer" />
                            </span>
                            <span class="body">
                                <span class="line"><b>{n.actor.username}</b> {actionText(n)}</span>
                                {#if n.text}<span class="preview">{n.text}</span>{/if}
                                <span class="time">{ago(n.createdAt)}</span>
                            </span>
                        {/if}
                        {#if !n.read}<span class="dot" aria-hidden="true"></span>{/if}
                    </button>
                {:else}
                    <p class="empty">{$t('notif.empty')}</p>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    .bell-wrap { position: relative; }

    .icon-btn {
        position: relative; padding: 0.5rem; color: #94a3b8; border-radius: 8px;
        background: none; border: none; cursor: pointer; line-height: 0;
        transition: color 0.2s, background 0.2s;
    }
    .icon-btn:hover, .icon-btn.active { color: #fff; background: rgba(255, 255, 255, 0.1); }
    .count {
        position: absolute; top: 1px; right: 1px; min-width: 17px; height: 17px; padding: 0 4px;
        background: var(--cyber-red, #ff003c); color: #fff; border-radius: 9px;
        font: 700 10px/17px 'Inter', sans-serif; text-align: center; border: 2px solid #050a10;
    }

    .panel {
        position: absolute; top: calc(100% + 10px); right: 0;
        width: min(370px, calc(100vw - 24px));
        background: rgba(8, 12, 18, 0.96); backdrop-filter: blur(12px);
        border: 1px solid rgba(252, 238, 10, 0.22);
        clip-path: polygon(0 12px, 12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
        filter: drop-shadow(0 14px 32px rgba(0, 0, 0, 0.6));
        overflow: hidden; z-index: 100; transform-origin: top right;
    }
    .panel-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.7rem 1rem; background: rgba(0, 0, 0, 0.25);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .panel-head .ttl {
        font-family: 'Chakra Petch', 'Russo One', monospace; font-size: 0.72rem; font-weight: 700;
        letter-spacing: 0.06em; color: var(--cyber-yellow, #fcee0a); text-transform: uppercase;
        text-shadow: 0 0 9px rgba(252, 238, 10, 0.45);
    }
    .panel-head .mark-all {
        font: 600 0.72rem 'Inter', sans-serif; color: var(--cyber-yellow, #fcee0a);
        background: none; border: none; cursor: pointer; transition: opacity 0.2s;
    }
    .panel-head .mark-all:hover { opacity: 0.7; }

    .list { max-height: 420px; overflow-y: auto; }
    .row {
        display: flex; gap: 11px; width: 100%; padding: 0.8rem 1rem; align-items: flex-start;
        border: none; border-bottom: 1px solid rgba(255, 255, 255, 0.045);
        background: none; text-align: left; cursor: pointer; position: relative;
        transition: background 0.15s; color: inherit; font: inherit;
    }
    .row:last-child { border-bottom: none; }
    .row:hover { background: rgba(255, 255, 255, 0.03); }
    .row.unread { background: rgba(252, 238, 10, 0.055); border-left: 2px solid var(--cyber-yellow, #fcee0a); }

    .av {
        width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.22); background: #0a0f17;
        display: grid; place-items: center;
    }
    .av img { width: 100%; height: 100%; display: block; }
    .av.shield { color: var(--cyber-yellow, #fcee0a); border-color: rgba(252, 238, 10, 0.4); background: rgba(252, 238, 10, 0.08); }
    .av.shield svg { width: 20px; height: 20px; }

    .body { min-width: 0; flex: 1; }
    .line { display: block; font-size: 0.88rem; line-height: 1.35; color: #94a3b8; }
    .line b { color: #fff; font-weight: 600; }
    .preview {
        display: block; font-size: 0.82rem; color: #64748b; margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .preview.adm { white-space: normal; color: #cbd5e1; }
    .time { display: block; font: 0.7rem 'Chakra Petch', monospace; color: #475569; margin-top: 4px; }
    .dot {
        width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 6px;
        background: var(--cyber-yellow, #fcee0a); box-shadow: 0 0 7px var(--cyber-yellow, #fcee0a);
    }
    .empty { padding: 2.4rem 1rem; text-align: center; color: #475569; font-size: 0.85rem; margin: 0; }

    @media (max-width: 560px) {
        .panel { position: fixed; top: 64px; left: 12px; right: 12px; width: auto; transform-origin: top center; }
    }
</style>
