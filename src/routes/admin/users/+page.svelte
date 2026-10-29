<!-- src/routes/admin/users/+page.svelte -->
<!--
    «Люди»: найти человека и управлять аккаунтом — баланс (любая сумма),
    косметика (поштучно + надеть), уведомление, стрик и кулдауны, бан, перенос,
    история админ-действий. Сервер (+page.server.ts) на каждое действие отвечает
    кодом результата и свежей карточкой; текст — в локалях (admin_users.result).
    Вид — элементы админки (admin.css), язык админки (скругления, Unbounded/Onest).
-->
<script lang="ts">
    import { tick } from 'svelte';
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { fly } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import { t, locale } from 'svelte-i18n';
    import { modal } from '$lib/stores/modalStore';
    import { formats } from '$lib/admin/format';
    import Sheet from '$lib/components/admin/Sheet.svelte';
    import type { ActionData, PageData } from './$types';
    import type { Target, CatalogItem, HistoryEntry } from './+page.server';

    export let data: PageData;
    export let form: ActionData;

    // Кружок-заглушка без аватарки.
    const PALETTE = ['#5be49b', '#fcee0a', '#c9bbff', '#ffb020', '#7ee8f2'];
    const color = (s: string) => PALETTE[[...s].reduce((h, c) => h + c.charCodeAt(0), 0) % PALETTE.length];

    type Candidate = { uid: string; username: string; avatar_url: string | null };
    type Result = {
        ok: boolean;
        code?: string;
        values?: Record<string, string | number>;
        target?: Target | null;
        candidates?: Candidate[];
    };

    let query = '';
    let target: Target | null = null;
    let candidates: Candidate[] = [];
    let pickedUid = '';
    let openedFromLink = '';
    let searchError = '';
    let busy = false;
    let migrating = false;
    let copied = false;
    let searchForm: HTMLFormElement;
    let zeroForm: HTMLFormElement;

    // Поле свободной выдачи коинов и поле стрика.
    let creditAmount: number | null = null;
    let streakValue: number | null = null;

    $: f = formats($locale);
    $: handle(form);
    $: if (data.initial && data.initial.uid !== openedFromLink) {
        openedFromLink = data.initial.uid;
        target = data.initial;
        query = data.initial.username;
        candidates = [];
    }
    // При смене карточки подставляем её стрик в поле.
    $: if (target) streakValue = target.daily_streak;

    // Каталог косметики, разбитый на слоты; какие предметы уже у человека.
    $: frames = data.catalog?.filter((c) => c.type === 'frame') ?? [];
    $: backgrounds = data.catalog?.filter((c) => c.type === 'background') ?? [];
    $: ownedFrames = target ? frames.filter((c) => target!.owned_items_list.includes(c.id)) : [];
    $: ownedBackgrounds = target ? backgrounds.filter((c) => target!.owned_items_list.includes(c.id)) : [];
    const owns = (id: string) => !!target?.owned_items_list.includes(id);

    $: amt = creditAmount == null ? NaN : Number(creditAmount);
    $: amtValid = Number.isFinite(amt) && amt > 0;

    function handle(res: ActionData) {
        if (!res) return;
        const r = res as unknown as Result;
        if (r.candidates) { candidates = r.candidates; target = null; searchError = ''; }
        if (r.target) { target = r.target; candidates = []; searchError = ''; }
        if (!r.code) return;
        if (['not_found', 'empty_query', 'search_failed'].includes(r.code)) {
            searchError = $t(`admin_users.result.${r.code}`);
            return;
        }
        const values = { ...(r.values ?? {}) };
        if (typeof values.amount === 'number') values.amount = f.signed(values.amount);
        const text = $t(`admin_users.result.${r.code}`, { values });
        if (r.ok) modal.success($t('admin_users.result.ok_title'), text);
        else modal.error($t('admin_users.result.fail_title'), text);
    }

    const act: SubmitFunction = () => {
        busy = true;
        return async ({ update }) => { await update({ reset: false }); busy = false; };
    };
    const actAndReset: SubmitFunction = () => {
        busy = true;
        return async ({ result, update }) => {
            await update();
            busy = false;
            if (result.type === 'success') migrating = false;
        };
    };

    async function pick(c: Candidate) {
        query = c.username;
        pickedUid = c.uid;
        await tick();
        searchForm.requestSubmit();
        pickedUid = '';
    }

    function confirmZero() {
        if (!target) return;
        modal.confirm(
            $t('admin_users.balance.zero_confirm_title'),
            $t('admin_users.balance.zero_confirm_text', { values: { name: target.username, amount: f.nf.format(target.casino_credits) } }),
            () => zeroForm.requestSubmit()
        );
    }

    async function copyUid() {
        if (!target) return;
        try {
            await navigator.clipboard.writeText(target.uid);
            copied = true;
            setTimeout(() => (copied = false), 1500);
        } catch { /* буфер недоступен — uid и так на экране */ }
    }

    // Иконка строки истории по виду действия.
    function histTone(kind: string): string {
        if (kind === 'admin_credits' || kind === 'admin_grant_item' || kind === 'admin_streak') return 'g';
        if (kind === 'admin_ban' || kind === 'admin_revoke_item') return 'r';
        if (kind === 'admin_items' || kind === 'admin_equip') return 'y';
        return '';
    }
</script>

<svelte:head>
    <title>{$t('admin_users.title')} | ProtoMap</title>
</svelte:head>

<header class="adm-head">
    <div>
        <h1>{$t('admin_users.title')}</h1>
        <p>{$t('admin_users.subtitle')}</p>
    </div>
    <button type="button" class="adm-btn danger" on:click={() => (migrating = true)}>
        <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l4 4-4 4" /><path d="M3 7h18" /><path d="M7 21l-4-4 4-4" /><path d="M21 17H3" /></svg>
        {$t('admin_users.migrate.open')}
    </button>
</header>

<form class="search-row" method="POST" action="?/search" bind:this={searchForm}
    use:enhance={() => {
        busy = true; searchError = '';
        return async ({ update }) => { await update({ reset: false }); busy = false; };
    }}>
    <input type="hidden" name="uid" value={pickedUid} />
    <label class="adm-search">
        <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input type="text" name="query" bind:value={query} placeholder={$t('admin_users.search.placeholder')}
            aria-label={$t('admin_users.search.placeholder')} autocomplete="off" />
    </label>
    <button type="submit" class="adm-btn primary" disabled={busy}>
        {busy ? $t('admin_users.search.searching') : $t('admin_users.search.find')}
    </button>
</form>
{#if searchError}<p class="adm-note warn search-note">{searchError}</p>{/if}

{#if candidates.length > 0}
    <section class="candidates">
        <h2 class="adm-panel-title">{$t('admin_users.candidates', { values: { count: candidates.length } })}</h2>
        <div class="adm-chips">
            {#each candidates as c (c.uid)}
                <button type="button" class="adm-chip person" on:click={() => pick(c)}>
                    <span class="mini" style="--c: {color(c.username)}">
                        {#if c.avatar_url}<img src={c.avatar_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{c.username.charAt(0).toUpperCase()}{/if}
                    </span>
                    {c.username}
                </button>
            {/each}
        </div>
    </section>
{/if}

{#if target}
    {#key target.uid}
        <section class="dossier" in:fly={{ y: 24, duration: 450, easing: quintOut }}>
            <!-- Карточка -->
            <div class="adm-panel profile">
                <div class="ava" class:banned={target.isBanned} style="--c: {color(target.username)}">
                    {#if target.avatar_url}<img src={target.avatar_url} alt="" referrerpolicy="no-referrer" />{:else}{target.username.charAt(0).toUpperCase()}{/if}
                </div>
                <div class="who">
                    <h2>{target.username}</h2>
                    <div class="badges">
                        {#if target.isBanned}
                            <span class="adm-badge red">{$t('admin_users.status.banned')}</span>
                        {:else}
                            <span class="adm-badge green">{$t('admin_users.status.active')}</span>
                        {/if}
                        <span class="adm-badge" class:green={target.emailVerified}>
                            {target.emailVerified ? $t('admin_users.status.email_ok') : $t('admin_users.status.email_no')}
                        </span>
                        {#if target.telegram_id}
                            <span class="adm-badge violet">{$t('admin_users.status.telegram', { values: { id: target.telegram_id } })}</span>
                        {/if}
                    </div>
                    <dl class="meta">
                        <dt>{$t('admin_users.meta.uid')}</dt>
                        <dd>
                            <code>{target.uid}</code>
                            <button type="button" class="copy" on:click={copyUid}>{copied ? $t('admin_users.meta.copied') : $t('admin_users.meta.copy')}</button>
                        </dd>
                        {#if target.email}<dt>{$t('admin_users.meta.email')}</dt><dd>{target.email}</dd>{/if}
                        {#if target.createdAt}<dt>{$t('admin_users.meta.created')}</dt><dd>{f.dayMonth(target.createdAt)} {new Date(target.createdAt).getFullYear()}</dd>{/if}
                        {#if target.isBanned && target.banReason}<dt>{$t('admin_users.meta.ban_reason')}</dt><dd>{target.banReason}</dd>{/if}
                    </dl>
                    <div class="links">
                        <a class="adm-btn small" href="/u/{target.uid}">{$t('admin_users.links.profile')}</a>
                        <a class="adm-btn small" href="/admin/activity?user={encodeURIComponent(target.uid)}">{$t('admin_users.links.journal')}</a>
                    </div>
                </div>
                <div class="numbers">
                    <div class="num yellow">
                        <span>{$t('admin_users.numbers.balance')}</span>
                        <b>{f.nf.format(target.casino_credits)}<small> PC</small></b>
                    </div>
                    <div class="num">
                        <span>{$t('admin_users.numbers.items')}</span>
                        <b>{f.nf.format(target.owned_items)}</b>
                    </div>
                </div>
            </div>

            <!-- Баланс: свободная сумма -->
            <div class="adm-panel col-2">
                <h3 class="adm-panel-title">
                    <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 10h4.5a1.5 1.5 0 0 1 0 3H9" /></svg>
                    {$t('admin_users.balance.title')}
                </h3>
                <form method="POST" action="?/modifyCredits" use:enhance={act} class="bal-main">
                    <input type="hidden" name="uid" value={target.uid} />
                    <div class="bal-field">
                        <input class="adm-input" type="number" min="1" step="1" bind:value={creditAmount}
                            placeholder={$t('admin_users.balance.amount_ph')} aria-label={$t('admin_users.balance.amount_ph')} />
                        <span class="pc">PC</span>
                    </div>
                    <button name="amount" value={amt} class="adm-btn success" disabled={busy || !amtValid}>
                        {$t('admin_users.balance.give')}
                    </button>
                    <button name="amount" value={-amt} class="adm-btn danger" disabled={busy || !amtValid}>
                        {$t('admin_users.balance.take')}
                    </button>
                </form>
                <div class="chips">
                    <span class="chips-label">{$t('admin_users.balance.quick')}</span>
                    <form method="POST" action="?/modifyCredits" use:enhance={act} class="chips-forms">
                        <input type="hidden" name="uid" value={target.uid} />
                        <button name="amount" value="1000" class="chip" disabled={busy}>+1 000</button>
                        <button name="amount" value="10000" class="chip" disabled={busy}>+10 000</button>
                        <button name="amount" value="100000" class="chip" disabled={busy}>+100 000</button>
                    </form>
                    <button type="button" class="chip danger-chip" disabled={busy || target.casino_credits === 0} on:click={confirmZero}>
                        {$t('admin_users.balance.zero')}
                    </button>
                </div>
                <p class="hint">{$t('admin_users.balance.hint')}</p>
                <form method="POST" action="?/modifyCredits" use:enhance={act} bind:this={zeroForm} hidden>
                    <input type="hidden" name="uid" value={target.uid} />
                    <input type="hidden" name="zero" value="1" />
                </form>
            </div>

            <div class="grid">
                <!-- Косметика -->
                <div class="adm-panel">
                    <h3 class="adm-panel-title">
                        <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15l-4.8 2.5.9-5.4L4.2 8.3l5.4-.8z" /></svg>
                        {$t('admin_users.items.title')}
                    </h3>
                    {#if data.catalog && data.catalog.length > 0}
                        <div class="cos-grid">
                            {#each data.catalog as item (item.id)}
                                {@const isOwned = owns(item.id)}
                                {@const isEquipped = target.equipped_frame === item.id || target.equipped_bg === item.id}
                                <form method="POST" action={isOwned ? '?/revokeItem' : '?/grantItem'} use:enhance={act}
                                    class="cos" class:owned={isOwned} title={item.id}>
                                    <input type="hidden" name="uid" value={target.uid} />
                                    <input type="hidden" name="itemId" value={item.id} />
                                    <span class="sw" style="--c: {color(item.id)}"></span>
                                    <span class="nm">{item.name}{#if isEquipped}<span class="eq">{$t('admin_users.items.equipped')}</span>{/if}</span>
                                    <button class="tg" disabled={busy} aria-label={isOwned ? $t('admin_users.items.revoke') : $t('admin_users.items.grant_one')}>
                                        {#if isOwned}
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                                        {:else}
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                                        {/if}
                                    </button>
                                </form>
                            {/each}
                        </div>
                    {:else}
                        <p class="adm-note">{$t('admin_users.items.no_catalog')}</p>
                    {/if}

                    <div class="equip-row">
                        <form method="POST" action="?/equipItem" use:enhance={act} class="equip-f">
                            <input type="hidden" name="uid" value={target.uid} />
                            <input type="hidden" name="slot" value="frame" />
                            <select class="adm-select" name="itemId" aria-label={$t('admin_users.items.equip_frame')}>
                                <option value="">{$t('admin_users.items.equip_frame')}</option>
                                <option value="" disabled={!target.equipped_frame}>— {$t('admin_users.items.unequip')} —</option>
                                {#each ownedFrames as c (c.id)}
                                    <option value={c.id} selected={target.equipped_frame === c.id}>{c.name}</option>
                                {/each}
                            </select>
                            <button class="adm-btn small" disabled={busy}>{$t('admin_users.items.equip_do')}</button>
                        </form>
                        <form method="POST" action="?/equipItem" use:enhance={act} class="equip-f">
                            <input type="hidden" name="uid" value={target.uid} />
                            <input type="hidden" name="slot" value="bg" />
                            <select class="adm-select" name="itemId" aria-label={$t('admin_users.items.equip_bg')}>
                                <option value="">{$t('admin_users.items.equip_bg')}</option>
                                <option value="" disabled={!target.equipped_bg}>— {$t('admin_users.items.unequip')} —</option>
                                {#each ownedBackgrounds as c (c.id)}
                                    <option value={c.id} selected={target.equipped_bg === c.id}>{c.name}</option>
                                {/each}
                            </select>
                            <button class="adm-btn small" disabled={busy}>{$t('admin_users.items.equip_do')}</button>
                        </form>
                    </div>

                    <form method="POST" action="?/grantAllItems" use:enhance={act}>
                        <input type="hidden" name="uid" value={target.uid} />
                        <button class="adm-btn small wide" disabled={busy}>{$t('admin_users.items.grant', { values: { count: data.packSize } })}</button>
                    </form>
                </div>

                <!-- Уведомление -->
                <div class="adm-panel">
                    <h3 class="adm-panel-title">
                        <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
                        {$t('admin_users.notify.title')}
                    </h3>
                    <form method="POST" action="?/sendNotification" use:enhance={actAndReset} class="notify-f">
                        <input type="hidden" name="uid" value={target.uid} />
                        <textarea name="text" class="adm-textarea" rows="3" required maxlength="2000"
                            placeholder={$t('admin_users.notify.placeholder')} aria-label={$t('admin_users.notify.placeholder')}></textarea>
                        <label class="adm-check"><input type="checkbox" name="push" value="1" checked /> <span>{$t('admin_users.notify.push')}</span></label>
                        <button class="adm-btn primary wide" disabled={busy}>{$t('admin_users.notify.send')}</button>
                    </form>
                </div>

                <!-- Стрик и кулдауны -->
                <div class="adm-panel">
                    <h3 class="adm-panel-title">
                        <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2L4.1 12.5a.9.9 0 0 0 .7 1.5H11l-1 8 8.9-10.5a.9.9 0 0 0-.7-1.5H12z" /></svg>
                        {$t('admin_users.streak.title')}
                    </h3>
                    <form method="POST" action="?/setStreak" use:enhance={act} class="stk">
                        <input type="hidden" name="uid" value={target.uid} />
                        <label class="adm-field">
                            <span class="adm-label">{$t('admin_users.streak.label')}</span>
                            <input class="adm-input" type="number" min="0" step="1" name="streak" bind:value={streakValue} />
                        </label>
                        <button class="adm-btn" disabled={busy}>{$t('admin_users.streak.set')}</button>
                    </form>
                    <p class="adm-label cd-label">{$t('admin_users.streak.cooldowns')}</p>
                    <div class="chips">
                        <form method="POST" action="?/resetCooldown" use:enhance={act} class="chips-forms">
                            <input type="hidden" name="uid" value={target.uid} />
                            <button name="which" value="daily" class="chip" class:active={target.cooldowns.daily} disabled={busy}>{$t('admin_users.streak.cd_daily')}</button>
                            <button name="which" value="username" class="chip" class:active={target.cooldowns.username} disabled={busy}>{$t('admin_users.streak.cd_username')}</button>
                            <button name="which" value="birthday" class="chip" class:active={target.cooldowns.birthday} disabled={busy}>{$t('admin_users.streak.cd_birthday')}</button>
                        </form>
                    </div>
                </div>

                <!-- Почта и бан -->
                <div class="adm-panel ban" class:is-banned={target.isBanned}>
                    <h3 class="adm-panel-title">
                        <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 15v2M6 21h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zM16 11V7a4 4 0 0 0-8 0v4" /></svg>
                        {$t('admin_users.ban.title')}
                    </h3>
                    {#if !target.emailVerified}
                        <form method="POST" action="?/verifyEmail" use:enhance={act} class="email-f">
                            <input type="hidden" name="uid" value={target.uid} />
                            <button class="adm-btn small wide" disabled={busy}>{$t('admin_users.email.verify')}</button>
                        </form>
                    {/if}
                    {#if target.isBanned}
                        <form method="POST" action="?/unbanUser" use:enhance={act}>
                            <input type="hidden" name="uid" value={target.uid} />
                            <button class="adm-btn success wide" disabled={busy}>{$t('admin_users.ban.unban')}</button>
                        </form>
                    {:else}
                        <form method="POST" action="?/banUser" use:enhance={actAndReset} class="ban-form">
                            <input type="hidden" name="uid" value={target.uid} />
                            <textarea name="reason" class="adm-textarea" rows="2" required placeholder={$t('admin_users.ban.reason')}
                                aria-label={$t('admin_users.ban.reason')}></textarea>
                            <label class="adm-check">
                                <input type="checkbox" name="category" value="child_safety" />
                                <span>{$t('admin_users.ban.child_safety')}</span>
                            </label>
                            <button class="adm-btn danger wide" disabled={busy}>{$t('admin_users.ban.ban')}</button>
                        </form>
                    {/if}
                </div>
            </div>

            <!-- История -->
            <div class="adm-panel col-2">
                <h3 class="adm-panel-title">
                    <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    {$t('admin_users.history.title')}
                </h3>
                {#if target.history.length > 0}
                    <div class="log">
                        {#each target.history as h, i (i)}
                            <div class="log-row">
                                <span class="log-ic {histTone(h.kind)}" aria-hidden="true">
                                    <svg class="adm-i" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                                </span>
                                <div class="log-b">
                                    <div class="tt">{#if h.delta != null}<b>{f.signed(h.delta)} PC</b> · {/if}{h.text}</div>
                                    <div class="mm">{h.byName ?? '—'}{#if h.at} · {f.dayMonth(h.at)}{/if}</div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <p class="adm-note">{$t('admin_users.history.empty')}</p>
                {/if}
            </div>
        </section>
    {/key}
{:else if candidates.length === 0}
    <p class="adm-empty hint">{$t('admin_users.empty')}</p>
{/if}

{#if migrating}
    <Sheet id="migrate" title={$t('admin_users.migrate.title')} tone="t-red" closeLabel={$t('admin_users.migrate.cancel')} on:close={() => (migrating = false)}>
        <p class="mig-text">{$t('admin_users.migrate.text')}</p>
        <form method="POST" action="?/migrate" use:enhance={actAndReset} class="mig-form">
            <label class="adm-field">
                <span class="adm-label">{$t('admin_users.migrate.from')}</span>
                <input type="text" name="sourceUid" class="adm-input" required autocomplete="off" />
            </label>
            <svg class="adm-i mig-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
            <label class="adm-field">
                <span class="adm-label">{$t('admin_users.migrate.to')}</span>
                <input type="text" name="targetUid" class="adm-input" required autocomplete="off" />
            </label>
            <div class="mig-actions">
                <button type="button" class="adm-btn" on:click={() => (migrating = false)}>{$t('admin_users.migrate.cancel')}</button>
                <button type="submit" class="adm-btn danger" disabled={busy}>{$t('admin_users.migrate.run')}</button>
            </div>
        </form>
    </Sheet>
{/if}

<style>
    .search-row { display: flex; gap: 10px; max-width: 640px; }
    .search-row .adm-search { flex: 1; }
    .adm-note.search-note { margin-top: 10px; }

    .candidates { margin-top: 22px; }
    .adm-chip.person { padding: 5px 14px 5px 5px; }
    .mini { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--c); color: #0a0a0c; font: 600 11px var(--display); }
    .mini img { width: 100%; height: 100%; object-fit: cover; }

    .adm-empty.hint { max-width: 520px; margin: 30px 0 0; padding: 0; text-align: left; }

    .dossier { margin-top: 24px; display: flex; flex-direction: column; gap: 14px; }
    .adm-panel.profile { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 26px; align-items: center;
        background: linear-gradient(135deg, #141414, #101014); }
    .ava { position: relative; width: 104px; height: 104px; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
        background: var(--c); color: #0a0a0c; font: 500 38px var(--display); box-shadow: 0 0 0 3px #111115, 0 0 0 5px var(--green); }
    .ava.banned { box-shadow: 0 0 0 3px #111115, 0 0 0 5px var(--red); }
    .ava img { width: 100%; height: 100%; object-fit: cover; }
    .who { min-width: 0; }
    .who h2 { margin: 0 0 9px; font: 400 28px/1.15 var(--display); overflow-wrap: anywhere; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .meta { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 15px 0 0; font-size: 14px; }
    .meta dt { color: var(--dim); }
    .meta dd { margin: 0; color: var(--soft); min-width: 0; overflow-wrap: anywhere; }
    .meta code { font-size: 13px; color: #c9bbff; }
    .copy { margin-left: 8px; padding: 1px 9px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
    .copy:hover { color: var(--text); border-color: var(--line-strong); }
    .links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
    .numbers { display: flex; flex-direction: column; gap: 10px; min-width: 200px; }
    .num { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 16px; background: rgba(255, 255, 255, .03); border: 1px solid var(--line); }
    .num span { font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    .num b { font: 300 28px/1 var(--display); font-variant-numeric: tabular-nums; }
    .num small { font-size: 14px; color: var(--muted); }
    .num.yellow { border-color: rgba(252, 238, 10, .25); background: rgba(252, 238, 10, .06); }
    .num.yellow b { color: var(--yellow); }

    .adm-panel-title { display: flex; align-items: center; gap: 8px; }
    .adm-panel-title .ti { width: 15px; height: 15px; color: var(--dim); flex-shrink: 0; }

    /* Баланс */
    .bal-main { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }
    .bal-field { flex: 1; min-width: 200px; position: relative; }
    .bal-field .pc { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--dim); font-size: 13px; letter-spacing: .1em; pointer-events: none; }
    .bal-field .adm-input { padding-right: 42px; font: 400 18px var(--display); font-variant-numeric: tabular-nums; }
    .bal-field .adm-input::-webkit-outer-spin-button, .bal-field .adm-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }
    .chips-forms { display: contents; }
    .chips-label { color: var(--dim); font-size: 13px; margin-right: 2px; }
    .chip { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255, 255, 255, .03); color: var(--soft);
        font: 500 13.5px var(--body); cursor: pointer; }
    .chip:hover:not(:disabled) { border-color: var(--line-strong); color: var(--text); }
    .chip:disabled { opacity: .5; cursor: default; }
    .chip.active { border-color: rgba(252, 238, 10, .4); color: var(--yellow); background: rgba(252, 238, 10, .06); }
    .chip.danger-chip { color: #ffb3c0; border-color: rgba(255, 107, 129, .3); }
    .hint { color: var(--dim); font-size: 13px; margin: 12px 0 0; }

    /* Действия */
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .col-2 { grid-column: 1 / -1; }
    :global(.adm) .wide { width: 100%; }

    /* Косметика */
    .cos-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .cos { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 13px; border: 1px solid var(--line); background: rgba(255, 255, 255, .02); margin: 0; }
    .cos .sw { width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; background: var(--c); }
    .cos .nm { font-size: 12.5px; color: var(--soft); line-height: 1.2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .cos .eq { display: block; font-size: 10px; color: var(--yellow); letter-spacing: .06em; }
    .cos .tg { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--line-strong);
        background: transparent; color: var(--muted); cursor: pointer; flex-shrink: 0; padding: 0; }
    .cos .tg:hover:not(:disabled) { color: var(--text); }
    .cos .tg .adm-i { width: 14px; height: 14px; }
    .cos.owned { border-color: rgba(91, 228, 155, .3); background: rgba(91, 228, 155, .06); }
    .cos.owned .tg { color: #b9f5d3; border-color: rgba(91, 228, 155, .4); }
    .equip-row { display: flex; gap: 8px; margin-top: 12px; }
    .equip-f { display: flex; gap: 6px; flex: 1; min-width: 0; }
    .equip-f .adm-select { flex: 1; min-width: 0; }
    .adm-panel form { margin: 0; }
    .adm-panel form + form, .adm-panel .equip-row + form { margin-top: 10px; }

    /* Уведомление / стрик / бан */
    .notify-f, .ban-form { display: flex; flex-direction: column; gap: 10px; }
    .notify-f .adm-check, .ban-form .adm-check { margin: 0; }
    .stk { display: flex; gap: 8px; align-items: flex-end; }
    .stk .adm-field { flex: 1; }
    .adm-field { display: flex; flex-direction: column; gap: 6px; }
    .adm-label { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
    .cd-label { margin: 16px 0 10px; display: block; }
    .email-f { margin-bottom: 10px; }
    .adm-panel.ban { background: linear-gradient(150deg, #20121a, #141014); }
    .adm-panel.ban.is-banned { background: linear-gradient(150deg, #10201a, #0e1512); }
    .ban-form .adm-textarea { min-height: 62px; }

    /* История */
    .log { display: flex; flex-direction: column; }
    .log-row { display: flex; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); }
    .log-row:last-child { border-bottom: 0; }
    .log-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; background: rgba(255, 255, 255, .04); color: var(--muted); }
    .log-ic .adm-i { width: 15px; height: 15px; }
    .log-ic.g { background: rgba(91, 228, 155, .12); color: #b9f5d3; }
    .log-ic.r { background: rgba(255, 107, 129, .12); color: #ffb3c0; }
    .log-ic.y { background: rgba(252, 238, 10, .12); color: #fff6a3; }
    .log-b { min-width: 0; flex: 1; }
    .log-b .tt { font-size: 14px; color: var(--text); overflow-wrap: anywhere; }
    .log-b .tt b { font-weight: 600; }
    .log-b .mm { font-size: 12px; color: var(--dim); margin-top: 2px; }

    .mig-text { margin: 0 0 18px; color: var(--soft); font-size: 15px; line-height: 1.55; }
    .mig-form { display: flex; flex-direction: column; gap: 10px; }
    .mig-arrow { align-self: center; color: var(--dim); }
    .mig-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }

    @media (max-width: 1020px) {
        .grid { grid-template-columns: 1fr; }
        .cos-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 760px) {
        .search-row { max-width: none; }
        .adm-panel.profile { grid-template-columns: 1fr; justify-items: start; gap: 18px; }
        .ava { width: 88px; height: 88px; font-size: 32px; }
        .numbers { flex-direction: row; min-width: 0; width: 100%; }
        .num { flex: 1; }
        .cos-grid { grid-template-columns: 1fr; }
        .equip-row { flex-direction: column; }
        .bal-field { min-width: 0; }
    }
</style>
