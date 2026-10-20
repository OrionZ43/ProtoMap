<!-- src/routes/admin/activity/+page.svelte -->
<!--
    Журнал действий — компактной таблицей: одна строка на событие, описание
    обычной фразой («Слоты, ставка 50», «Покупка: Лунная ночь»). Служебное
    (автор записи, пометка, поля) — в раскрывающихся подробностях строки.
-->
<script lang="ts">
    import { t } from 'svelte-i18n';
    import { describeEntry as describe, kindLabel as label, QUOTED, PLAIN } from '$lib/admin/describe';
    import type { Translate } from '$lib/admin/day';
    import type { PageData } from './$types';

    export let data: PageData;

    type Row = PageData['rows'][number];

    const GROUPS = ['economy', 'content', 'moderation', 'admin', 'profile', 'account', 'map'];
    const PERIODS = ['1', '7', '30', '180'];

    const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Minsk', hour: '2-digit', minute: '2-digit' });
    const dayFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit' });
    const nf = new Intl.NumberFormat('ru-RU');
    const today = dayFormat.format(Date.now());

    function when(at: number): string {
        const day = dayFormat.format(at);
        return day === today ? timeFormat.format(at) : `${day} ${timeFormat.format(at)}`;
    }

    function signed(n: number): string {
        return `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf.format(Math.abs(n))}`;
    }

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
    <title>{$t('admin_activity.title')} | Overlord</title>
</svelte:head>

<div class="journal">
    <header class="head">
        <h1>{$t('admin_activity.title')}</h1>
        <p>{$t('admin_activity.subtitle')}</p>
    </header>

    <div class="toolbar">
        <nav class="chips" aria-label={$t('admin_activity.title')}>
            <a class="chip" class:active={!data.filters.group && !data.filters.alerts} href={link({ group: null, alerts: null, before: null })}>
                {$t('admin_activity.filters.all')}
            </a>
            {#each GROUPS as g}
                <a class="chip" class:active={data.filters.group === g && !data.filters.alerts} href={link({ group: g, alerts: null, before: null })}>
                    {$t(`admin_activity.groups.${g}`)}
                </a>
            {/each}
            <a class="chip chip-alert" class:active={data.filters.alerts} href={link({ alerts: '1', group: null, before: null })}>
                {$t('admin_activity.filters.alerts')}
                {#if data.alertsCount > 0}<span class="count">{data.alertsCount}</span>{/if}
            </a>
        </nav>

        <form class="search-form" method="GET">
            {#if data.filters.group}<input type="hidden" name="group" value={data.filters.group} />{/if}
            {#if data.filters.alerts}<input type="hidden" name="alerts" value="1" />{/if}
            <label class="search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input name="user" value={data.filters.user} placeholder={$t('admin_activity.filters.user_placeholder')}
                    aria-label={$t('admin_activity.filters.user_placeholder')} autocomplete="off" />
            </label>
            <select name="days" value={data.filters.days} on:change={submitOnChange} aria-label={$t('admin_activity.filters.period')}>
                {#each PERIODS as p}
                    <option value={p}>{$t(`admin_activity.periods.${p}`)}</option>
                {/each}
            </select>
        </form>
    </div>

    {#if data.indexBuilding}<p class="note">{$t('admin_activity.index_building')}</p>{/if}
    {#if data.userNotFound}<p class="note warn">{$t('admin_activity.user_not_found', { values: { query: data.filters.user } })}</p>{/if}

    {#if data.user}
        <div class="strip">
            <a class="strip-name" href={`/u/${data.user.uid}`}>{data.user.username}</a>
            {#if data.user.isBanned}<span class="pill pill-red">{$t('admin_activity.strip.banned')}</span>{/if}
            <span>{$t('admin_activity.strip.balance', { values: { value: nf.format(data.user.balance) } })}</span>
            {#if data.summary}
                <span>{$t('admin_activity.strip.games')} <b class:plus={data.summary.won + data.summary.lost > 0} class:minus={data.summary.won + data.summary.lost < 0}>{signed(data.summary.won + data.summary.lost)}</b>
                    <small>({signed(data.summary.won)} / {signed(data.summary.lost)})</small></span>
                <span>{$t('admin_activity.strip.bonuses')} <b>{signed(data.summary.bonuses)}</b></span>
                <span>{$t('admin_activity.strip.shop', { values: { count: data.summary.purchases } })} <b>{nf.format(data.summary.shop)}</b></span>
                <span>{$t('admin_activity.strip.admin')} <b>{signed(data.summary.admin)}</b></span>
                <span class:danger={data.summary.direct > 0}>{$t('admin_activity.strip.direct')} <b>{data.summary.direct}</b></span>
                <span>{$t('admin_activity.strip.content', { values: { comments: data.summary.comments, chat: data.summary.chat, channels: data.summary.channels } })}</span>
            {/if}
            <a class="strip-clear" href={link({ user: null, before: null })}>{$t('admin_activity.filters.clear_user')}</a>
        </div>
        {#if data.summary?.truncated}<p class="note">{$t('admin_activity.strip.truncated')}</p>{/if}
    {/if}

    {#if data.top && (data.top.gainers.length || data.top.losers.length)}
        <div class="strip top">
            <span class="muted">{$t('admin_activity.top.gainers')}</span>
            {#each data.top.gainers as x}<a href={link({ user: x.uid, before: null })}>{x.name} <b class="plus">{signed(x.sum)}</b></a>{:else}<span class="muted">—</span>{/each}
            <span class="sep"></span>
            <span class="muted">{$t('admin_activity.top.losers')}</span>
            {#each data.top.losers as x}<a href={link({ user: x.uid, before: null })}>{x.name} <b class="minus">{signed(x.sum)}</b></a>{:else}<span class="muted">—</span>{/each}
        </div>
    {/if}

    <div class="table">
        {#each data.rows as r (r.id)}
            <details class="row" class:alert={r.alert} class:direct={r.flag === 'direct'}>
                <summary>
                    <time class="c-time" datetime={new Date(r.at).toISOString()}>{when(r.at)}</time>
                    <span class="c-who">
                        {#if r.uid}
                            <a href={link({ user: r.uid, before: null })}>{r.username ?? r.uid}</a>
                        {:else if r.authorType === 'direct'}
                            <span class="muted">{$t('admin_activity.feed.unknown_author')}</span>
                        {:else}
                            <span class="muted">{$t('admin_activity.feed.system_actor')}</span>
                        {/if}
                        {#if r.target && r.target !== r.uid}
                            <span class="arrow" aria-hidden="true">›</span>
                            <a href={link({ user: r.target, before: null })}>{r.targetName ?? r.target}</a>
                        {/if}
                    </span>
                    <span class="c-what">
                        {#if r.flag === 'direct'}<span class="pill pill-red">{$t('admin_activity.feed.direct_badge')}</span>{/if}
                        {describe(r, $t, data.itemNames)}
                    </span>
                    <span class="c-delta" class:plus={(r.delta ?? 0) > 0} class:minus={(r.delta ?? 0) < 0}>
                        {#if r.delta !== null && r.delta !== 0}{signed(r.delta)}{/if}
                    </span>
                    <span class="c-balance">
                        {#if r.balance !== null && r.group === 'economy'}{nf.format(r.balance)}{/if}
                    </span>
                    <span class="c-mark">
                        {#if r.alert}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label={$t('admin_activity.feed.alert')}>
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
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
                        <dt>{$t('admin_activity.details.balance')}</dt><dd>{nf.format(r.balance)} PC</dd>
                    {/if}
                    {#if r.itemsAdded.length || r.itemsRemoved.length}
                        <dt>{$t('admin_activity.details.items')}</dt>
                        <dd>
                            {#if r.itemsAdded.length}+{r.itemsAdded.map((i) => data.itemNames[i] ?? i).join(', ')}{/if}
                            {#if r.itemsRemoved.length} −{r.itemsRemoved.map((i) => data.itemNames[i] ?? i).join(', ')}{/if}
                        </dd>
                    {/if}
                    {#if r.shards}<dt>{$t('admin_activity.details.shards')}</dt><dd>{signed(r.shards)}</dd>{/if}
                    {#if r.ref}<dt>{$t('admin_activity.details.mark')}</dt><dd><code>{r.ref}</code></dd>{/if}
                    {#if r.fields.length}<dt>{$t('admin_activity.details.fields')}</dt><dd><code>{r.fields.join(', ')}</code></dd>{/if}
                    {#if r.text && !QUOTED.has(r.kind) && !PLAIN.has(r.kind)}<dt>{$t('admin_activity.details.text')}</dt><dd>{r.text}</dd>{/if}
                    <dt>{$t('admin_activity.details.id')}</dt><dd><code>{r.id}</code></dd>
                </dl>
            </details>
        {:else}
            <p class="empty">{$t('admin_activity.feed.empty')}</p>
        {/each}
    </div>

    {#if data.nextBefore}
        <a class="more-link" href={link({ before: String(data.nextBefore) })}>{$t('admin_activity.feed.load_more')}</a>
    {/if}
</div>

<style>
    .journal { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.85rem; padding-bottom: 2rem; }

    .head h1 { font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 1.7rem; color: #fff; margin: 0; letter-spacing: 0.04em; }
    .head p { color: #94a3b8; margin: 0.25rem 0 0; font-size: 0.9rem; }

    /* ── Фильтры ── */
    .toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; justify-content: space-between; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .chip {
        display: inline-flex; align-items: center; gap: 0.35rem;
        padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
        color: #94a3b8; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(15, 20, 30, 0.6); transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .chip:hover { color: #e2e8f0; border-color: rgba(255, 255, 255, 0.25); }
    .chip.active { color: #00f3ff; border-color: rgba(0, 243, 255, 0.5); background: rgba(0, 243, 255, 0.1); }
    .chip-alert.active { color: #ff3b5c; border-color: rgba(255, 59, 92, 0.55); background: rgba(255, 0, 60, 0.12); }
    .count { background: #ff003c; color: #fff; border-radius: 999px; padding: 0 0.4rem; font-size: 0.72rem; line-height: 1.3rem; }

    .search-form { display: flex; gap: 0.4rem; }
    .search {
        display: flex; align-items: center; gap: 0.4rem; padding: 0 0.6rem; min-width: 210px;
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; color: #64748b;
    }
    .search svg { width: 16px; height: 16px; flex-shrink: 0; }
    .search input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: #e2e8f0; padding: 0.45rem 0; font-size: 0.88rem; }
    select {
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px;
        color: #e2e8f0; padding: 0.4rem 0.5rem; font-size: 0.88rem;
    }

    .note { margin: 0; color: #94a3b8; font-size: 0.85rem; }
    .note.warn { color: #fca5a5; }

    /* ── Полоса итогов по человеку и топа за сутки ── */
    .strip {
        display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 1rem; padding: 0.6rem 0.85rem;
        background: rgba(15, 20, 30, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px;
        color: #cbd5e1; font-size: 0.85rem;
    }
    .strip b { font-variant-numeric: tabular-nums; color: #e2e8f0; }
    .strip small { color: #64748b; }
    .strip .danger, .strip .danger b { color: #ff3b5c; }
    .strip-name { font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 1.05rem; color: #fff; text-decoration: none; }
    .strip-name:hover { color: #00f3ff; }
    .strip-clear { margin-left: auto; color: #64748b; font-size: 0.8rem; }
    .strip.top a { color: #e2e8f0; text-decoration: none; }
    .strip.top a:hover { color: #00f3ff; }
    .sep { width: 1px; height: 1rem; background: rgba(255, 255, 255, 0.12); }
    .muted { color: #64748b; }

    .pill { display: inline-block; font-size: 0.7rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 5px; margin-right: 0.35rem; vertical-align: 1px; }
    .pill-red { background: rgba(255, 0, 60, 0.2); color: #ff3b5c; }

    /* ── Таблица ── */
    .table { display: flex; flex-direction: column; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; overflow: hidden; }
    .row { border-bottom: 1px solid rgba(255, 255, 255, 0.05); background: rgba(15, 20, 30, 0.45); }
    .row:last-child { border-bottom: 0; }
    .row.alert { background: rgba(60, 5, 15, 0.45); }
    summary {
        display: grid; grid-template-columns: 6.2rem minmax(9rem, 14rem) minmax(0, 1fr) 6rem 6rem 1.4rem;
        align-items: center; gap: 0.75rem; padding: 0.45rem 0.85rem; cursor: pointer; list-style: none;
        font-size: 0.88rem; color: #cbd5e1;
    }
    summary::-webkit-details-marker { display: none; }
    summary:hover { background: rgba(255, 255, 255, 0.03); }
    .row[open] summary { background: rgba(0, 243, 255, 0.05); }
    .c-time { color: #64748b; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
    .c-who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .c-who a { color: #00f3ff; text-decoration: none; }
    .c-who a:hover { text-decoration: underline; }
    .arrow { color: #64748b; margin: 0 0.2rem; }
    .c-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0; }
    .c-delta, .c-balance { text-align: right; font-variant-numeric: tabular-nums; }
    .c-delta { font-weight: 700; }
    .c-balance { color: #64748b; font-size: 0.82rem; }
    .c-mark svg { width: 16px; height: 16px; color: #ff3b5c; display: block; }
    .plus { color: #4ade80; }
    .minus { color: #f87171; }

    .more {
        display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0;
        padding: 0.4rem 0.85rem 0.75rem 7.6rem; font-size: 0.82rem; color: #94a3b8;
    }
    .more dt { color: #64748b; }
    .more dd { margin: 0; color: #cbd5e1; overflow-wrap: anywhere; }
    .more a { color: #00f3ff; }
    .more code { font-size: 0.78rem; color: #a5b4fc; }

    .empty { margin: 0; padding: 1.5rem; text-align: center; color: #64748b; }
    .more-link { align-self: center; color: #00f3ff; font-weight: 600; text-decoration: none; padding: 0.4rem 1rem; }
    .more-link:hover { text-decoration: underline; }

    @media (max-width: 768px) {
        .head h1 { font-size: 1.35rem; }
        .search { min-width: 0; flex: 1; }
        .search-form { width: 100%; }
        summary {
            grid-template-columns: auto minmax(0, 1fr) auto auto;
            grid-template-areas: 'time who delta mark' 'what what what what';
            gap: 0.2rem 0.6rem;
        }
        .c-time { grid-area: time; }
        .c-who { grid-area: who; }
        .c-delta { grid-area: delta; }
        .c-mark { grid-area: mark; }
        .c-what { grid-area: what; white-space: normal; }
        .c-balance { display: none; }
        .more { padding-left: 0.85rem; }
    }
</style>
