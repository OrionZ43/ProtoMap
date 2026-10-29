<!-- src/routes/admin/activity/+page.svelte -->
<!--
    Журнал действий — одна строка на событие, описание обычной фразой
    («Слоты, ставка 50», «Покупка: Лунная ночь»). Служебное (автор записи,
    пометка, поля) — в раскрывающихся подробностях строки. Вид — общие
    элементы админки (admin.css: adm-head, adm-chip, adm-panel…).
-->
<script lang="ts">
    import { t, locale } from 'svelte-i18n';
    import { describeEntry as describe, kindLabel as label, QUOTED, PLAIN } from '$lib/admin/describe';
    import { formats } from '$lib/admin/format';
    import type { Translate } from '$lib/admin/day';
    import type { PageData } from './$types';

    export let data: PageData;

    type Row = PageData['rows'][number];

    const GROUPS = ['economy', 'content', 'moderation', 'admin', 'profile', 'account', 'map'];
    const PERIODS = ['1', '7', '30', '180'];
    const now = Date.now();

    $: f = formats($locale);

    // Ссылка с текущими фильтрами; переданные параметры их заменяют.
    function link(params: Record<string, string | null>): string {
        const merged: Record<string, string | null> = {
            user: data.filters.user || null,
            group: data.filters.group || null,
            alerts: data.filters.alerts ? '1' : null,
            days: data.filters.days === '1' ? null : data.filters.days,
            ...params
        };
        const query = new URLSearchParams();
        for (const [k, v] of Object.entries(merged)) if (v) query.set(k, v);
        const s = query.toString();
        return s ? `/admin/activity?${s}` : '/admin/activity';
    }

    // Журнал аудита Firestore по документу пользователя и минуте события — там
    // точный автор записи (functions/src/activity/notify.ts, auditLink).
    function auditLink(r: Row): string | null {
        if (!r.uid) return null;
        const query = `protoPayload.serviceName="firestore.googleapis.com"\nprotoPayload.request.writes.update.name:"users/${r.uid}"`;
        const range = `${new Date(r.at - 120_000).toISOString()}/${new Date(r.at + 60_000).toISOString()}`;
        return `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(query)};timeRange=${encodeURIComponent(range)}?project=protomap-1e1db`;
    }

    function authorText(r: Row, tr: Translate): string {
        if (r.authorType === 'system') return tr('admin_activity.details.author_system');
        if (r.authorType === 'direct') {
            return tr('admin_activity.details.author_direct', { values: { who: [r.authType, r.authorId].filter(Boolean).join(' · ') } });
        }
        return tr('admin_activity.details.author_server');
    }

    function submitOnChange(e: Event) {
        (e.currentTarget as HTMLSelectElement).form?.requestSubmit();
    }
</script>

<svelte:head>
    <title>{$t('admin_activity.title')} | ProtoMap</title>
</svelte:head>

<header class="adm-head">
    <div>
        <h1>{$t('admin_activity.title')}</h1>
        <p>{$t('admin_activity.subtitle')}</p>
    </div>
</header>

<div class="toolbar">
    <nav class="adm-chips" aria-label={$t('admin_activity.title')}>
        <a class="adm-chip" class:on={!data.filters.group && !data.filters.alerts} href={link({ group: null, alerts: null, before: null })}>
            {$t('admin_activity.filters.all')}
        </a>
        {#each GROUPS as g}
            <a class="adm-chip" class:on={data.filters.group === g && !data.filters.alerts} href={link({ group: g, alerts: null, before: null })}>
                {$t(`admin_activity.groups.${g}`)}
            </a>
        {/each}
        <a class="adm-chip" class:on={data.filters.alerts} href={link({ alerts: '1', group: null, before: null })}>
            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            {$t('admin_activity.filters.alerts')}
            {#if data.alertsCount > 0}<span class="n">{data.alertsCount}</span>{/if}
        </a>
    </nav>

    <form class="filters" method="GET">
        {#if data.filters.group}<input type="hidden" name="group" value={data.filters.group} />{/if}
        {#if data.filters.alerts}<input type="hidden" name="alerts" value="1" />{/if}
        <label class="adm-search">
            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input name="user" value={data.filters.user} placeholder={$t('admin_activity.filters.user_placeholder')}
                aria-label={$t('admin_activity.filters.user_placeholder')} autocomplete="off" />
        </label>
        <select class="adm-select period" name="days" value={data.filters.days} on:change={submitOnChange} aria-label={$t('admin_activity.filters.period')}>
            {#each PERIODS as p}
                <option value={p}>{$t(`admin_activity.periods.${p}`)}</option>
            {/each}
        </select>
    </form>
</div>

{#if data.indexBuilding}<p class="adm-note gap">{$t('admin_activity.index_building')}</p>{/if}
{#if data.userNotFound}<p class="adm-note warn gap">{$t('admin_activity.user_not_found', { values: { query: data.filters.user } })}</p>{/if}

{#if data.user}
    <section class="adm-panel person">
        <div class="person-head">
            <a class="person-name" href={`/u/${data.user.uid}`}>{data.user.username}</a>
            {#if data.user.isBanned}<span class="adm-badge red">{$t('admin_activity.strip.banned')}</span>{/if}
            <span class="adm-badge yellow">{$t('admin_activity.strip.balance', { values: { value: f.nf.format(data.user.balance) } })}</span>
            <a class="adm-btn small clear" href={`/admin/users?uid=${encodeURIComponent(data.user.uid)}`}>{$t('admin_activity.open_person')}</a>
            <a class="adm-btn small" href={link({ user: null, before: null })}>{$t('admin_activity.filters.clear_user')}</a>
        </div>
        {#if data.summary}
            <div class="stats">
                <div class="stat">
                    <span class="stat-l">{$t('admin_activity.strip.games')}</span>
                    <b class:plus={data.summary.won + data.summary.lost > 0} class:minus={data.summary.won + data.summary.lost < 0}>{f.signed(data.summary.won + data.summary.lost)}</b>
                    <small>{f.signed(data.summary.won)} / {f.signed(data.summary.lost)}</small>
                </div>
                <div class="stat">
                    <span class="stat-l">{$t('admin_activity.strip.bonuses')}</span>
                    <b>{f.signed(data.summary.bonuses)}</b>
                </div>
                <div class="stat">
                    <span class="stat-l">{$t('admin_activity.strip.shop', { values: { count: data.summary.purchases } })}</span>
                    <b>{f.nf.format(data.summary.shop)}</b>
                </div>
                <div class="stat">
                    <span class="stat-l">{$t('admin_activity.strip.admin')}</span>
                    <b>{f.signed(data.summary.admin)}</b>
                </div>
                <div class="stat" class:danger={data.summary.direct > 0}>
                    <span class="stat-l">{$t('admin_activity.strip.direct')}</span>
                    <b>{data.summary.direct}</b>
                </div>
                <div class="stat wide">
                    <span class="stat-l">{$t('admin_home.cat.community')}</span>
                    <span class="stat-t">{$t('admin_activity.strip.content', { values: { comments: data.summary.comments, chat: data.summary.chat, channels: data.summary.channels } })}</span>
                </div>
            </div>
        {/if}
        {#if data.summary?.truncated}<p class="adm-note">{$t('admin_activity.strip.truncated')}</p>{/if}
    </section>
{/if}

{#if data.top && (data.top.gainers.length || data.top.losers.length)}
    <section class="adm-panel top">
        <div>
            <h2 class="adm-panel-title">{$t('admin_activity.top.gainers')}</h2>
            {#each data.top.gainers as x}
                <a class="mover" href={link({ user: x.uid, before: null })}><span>{x.name}</span><b class="plus">{f.signed(x.sum)}</b></a>
            {:else}
                <p class="adm-note">—</p>
            {/each}
        </div>
        <div>
            <h2 class="adm-panel-title">{$t('admin_activity.top.losers')}</h2>
            {#each data.top.losers as x}
                <a class="mover" href={link({ user: x.uid, before: null })}><span>{x.name}</span><b class="minus">{f.signed(x.sum)}</b></a>
            {:else}
                <p class="adm-note">—</p>
            {/each}
        </div>
    </section>
{/if}

<div class="adm-panel list">
    {#each data.rows as r (r.id)}
        <details class="row" class:alert={r.alert} class:direct={r.flag === 'direct'}>
            <summary>
                <time class="c-time" datetime={new Date(r.at).toISOString()}>{f.when(r.at, now)}</time>
                <span class="c-who">
                    {#if r.uid}
                        <a href={link({ user: r.uid, before: null })}>{r.username ?? r.uid}</a>
                    {:else if r.authorType === 'direct'}
                        <span class="muted">{$t('admin_activity.feed.unknown_author')}</span>
                    {:else}
                        <span class="muted">{$t('admin_activity.feed.system_actor')}</span>
                    {/if}
                    {#if r.target && r.target !== r.uid}
                        <span class="arrow" aria-hidden="true">→</span>
                        <a href={link({ user: r.target, before: null })}>{r.targetName ?? r.target}</a>
                    {/if}
                </span>
                <span class="c-what">
                    {#if r.flag === 'direct'}<span class="adm-badge red">{$t('admin_activity.feed.direct_badge')}</span>{/if}
                    {describe(r, $t, data.itemNames)}
                </span>
                <span class="c-delta" class:plus={(r.delta ?? 0) > 0} class:minus={(r.delta ?? 0) < 0}>
                    {#if r.delta !== null && r.delta !== 0}{f.signed(r.delta)}{/if}
                </span>
                <span class="c-balance">
                    {#if r.balance !== null && r.group === 'economy'}{f.nf.format(r.balance)}{/if}
                </span>
                <span class="c-mark">
                    {#if r.alert}
                        <svg class="adm-i" viewBox="0 0 24 24" role="img" aria-label={$t('admin_activity.feed.alert')}>
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
                        </svg>
                    {/if}
                </span>
            </summary>
            <dl class="more">
                <dt>{$t('admin_activity.details.section')}</dt>
                <dd>{$t(`admin_activity.groups.${r.group}`)} · {label(r.kind, $t)}</dd>
                <dt>{$t('admin_activity.details.author')}</dt>
                <dd>{authorText(r, $t)}
                    {#if r.flag === 'direct' && auditLink(r)}
                        · <a href={auditLink(r)} target="_blank" rel="noopener noreferrer">{$t('admin_activity.details.audit')}</a>
                    {/if}
                </dd>
                {#if r.balance !== null && r.group === 'economy'}
                    <dt>{$t('admin_activity.details.balance')}</dt><dd>{f.nf.format(r.balance)} PC</dd>
                {/if}
                {#if r.itemsAdded.length || r.itemsRemoved.length}
                    <dt>{$t('admin_activity.details.items')}</dt>
                    <dd>
                        {#if r.itemsAdded.length}+{r.itemsAdded.map((i) => data.itemNames[i] ?? i).join(', ')}{/if}
                        {#if r.itemsRemoved.length} −{r.itemsRemoved.map((i) => data.itemNames[i] ?? i).join(', ')}{/if}
                    </dd>
                {/if}
                {#if r.shards}<dt>{$t('admin_activity.details.shards')}</dt><dd>{f.signed(r.shards)}</dd>{/if}
                {#if r.ref}<dt>{$t('admin_activity.details.mark')}</dt><dd><code>{r.ref}</code></dd>{/if}
                {#if r.fields.length}<dt>{$t('admin_activity.details.fields')}</dt><dd><code>{r.fields.join(', ')}</code></dd>{/if}
                {#if r.text && !QUOTED.has(r.kind) && !PLAIN.has(r.kind)}<dt>{$t('admin_activity.details.text')}</dt><dd>{r.text}</dd>{/if}
                <dt>{$t('admin_activity.details.id')}</dt><dd><code>{r.id}</code></dd>
            </dl>
        </details>
    {:else}
        <p class="adm-empty">{$t('admin_activity.feed.empty')}</p>
    {/each}
</div>

{#if data.nextBefore}
    <div class="more-wrap">
        <a class="adm-btn" href={link({ before: String(data.nextBefore) })}>{$t('admin_activity.feed.load_more')}</a>
    </div>
{/if}

<style>
    /* ── Фильтры ── */
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .filters { display: flex; gap: 8px; flex: 0 1 460px; min-width: 0; }
    .filters .adm-search { flex: 1; }
    .filters .period { width: auto; border-radius: 999px; padding: 10px 14px; }
    .adm-note.gap { margin-bottom: 14px; }

    /* ── Человек ── */
    .person { margin-bottom: 14px; }
    .person-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .person-name { font: 400 24px/1.2 var(--display); color: var(--text); text-decoration: none; margin-right: 4px; }
    .person-name:hover { text-decoration: underline; text-underline-offset: 4px; }
    .clear { margin-left: auto; }
    .stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) minmax(0, 1.6fr); gap: 10px; margin-top: 16px; }
    .stat { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, .03); border: 1px solid var(--line); min-width: 0; }
    .stat-l { font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    .stat b { font: 400 20px/1.1 var(--display); font-variant-numeric: tabular-nums; }
    .stat small { color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; }
    .stat-t { color: var(--soft); font-size: 13.5px; }
    .stat.danger { border-color: rgba(255, 107, 129, .35); background: rgba(255, 107, 129, .08); }
    .stat.danger b { color: var(--red); }

    /* ── Кто сколько за сутки ── */
    .top { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 14px; }
    .mover { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--soft); text-decoration: none; font-size: 14.5px; }
    .mover:last-child { border-bottom: 0; }
    .mover:hover span { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
    .mover b { font-variant-numeric: tabular-nums; font-weight: 500; }

    /* ── Записи ── */
    .adm-panel.list { padding: 6px 0; }
    .row { border-bottom: 1px solid var(--line); }
    .row:last-child { border-bottom: 0; }
    .row.alert { background: linear-gradient(90deg, rgba(252, 238, 10, .06), transparent 60%); }
    .row.direct { background: linear-gradient(90deg, rgba(255, 107, 129, .08), transparent 60%); }
    summary {
        display: grid; grid-template-columns: 6.6rem minmax(9rem, 15rem) minmax(0, 1fr) 6rem 6rem 1.4rem;
        align-items: center; gap: 14px; padding: 11px 24px; cursor: pointer; list-style: none;
        font-size: 14.5px; color: var(--soft); transition: background .15s ease;
    }
    summary::-webkit-details-marker { display: none; }
    summary:hover { background: rgba(255, 255, 255, .03); }
    .row[open] summary { background: rgba(255, 255, 255, .04); }
    .c-time { color: var(--dim); font-size: 13px; font-variant-numeric: tabular-nums; }
    .c-who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .c-who a { color: var(--text); font-weight: 500; text-decoration: none; }
    .c-who a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .arrow { color: var(--dim); margin: 0 6px; }
    .c-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    .c-what .adm-badge { margin-right: 6px; padding: 1px 8px; font-size: 12px; }
    .c-delta, .c-balance { text-align: right; font-variant-numeric: tabular-nums; }
    .c-delta { font-weight: 500; }
    .c-balance { color: var(--dim); font-size: 13px; }
    .c-mark { color: var(--yellow); display: flex; }
    .muted { color: var(--dim); }
    .plus { color: var(--green); }
    .minus { color: var(--red); }

    .more {
        display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0;
        padding: 6px 24px 16px calc(6.6rem + 38px); font-size: 13.5px; color: var(--muted);
    }
    .more dt { color: var(--dim); }
    .more dd { margin: 0; color: var(--soft); overflow-wrap: anywhere; }
    .more a { color: var(--text); }
    .more code { font-size: 12.5px; color: #c9bbff; }

    .more-wrap { display: flex; justify-content: center; margin-top: 16px; }

    @media (max-width: 1100px) {
        .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .stat.wide { grid-column: span 3; }
    }

    @media (max-width: 760px) {
        .filters { flex: 1 1 100%; }
        .top { grid-template-columns: 1fr; gap: 16px; }
        .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .stat.wide { grid-column: span 2; }
        summary {
            grid-template-columns: auto minmax(0, 1fr) auto auto;
            grid-template-areas: 'time who delta mark' 'what what what what';
            gap: 4px 10px; padding: 11px 18px;
        }
        .c-time { grid-area: time; }
        .c-who { grid-area: who; }
        .c-delta { grid-area: delta; }
        .c-mark { grid-area: mark; }
        .c-what { grid-area: what; white-space: normal; }
        .c-balance { display: none; }
        .more { padding-left: 18px; }
    }
</style>
