<!-- src/routes/admin/activity/+page.svelte -->
<script lang="ts">
    import { t } from 'svelte-i18n';
    import { fade } from 'svelte/transition';
    import type { PageData } from './$types';

    export let data: PageData;

    const GROUPS = ['economy', 'moderation', 'profile', 'content', 'account', 'admin', 'map'];
    const PERIODS = ['1', '7', '30', '180'];

    const timeFormat = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const nf = new Intl.NumberFormat('ru-RU');

    function signed(n: number): string {
        return `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf.format(Math.abs(n))}`;
    }

    // Ссылка с текущими фильтрами; переданные параметры их заменяют.
    function link(params: Record<string, string | null>): string {
        const merged: Record<string, string | null> = {
            user: data.filters.user || null,
            group: data.filters.group || null,
            alerts: data.filters.alerts ? '1' : null,
            days: data.filters.days,
            ...params
        };
        const query = new URLSearchParams();
        for (const [k, v] of Object.entries(merged)) if (v) query.set(k, v);
        return `/admin/activity?${query}`;
    }

    // Журнал аудита Firestore по документу пользователя и минуте события — там
    // точный автор записи (functions/src/activity/notify.ts, auditLink).
    function auditLink(r: { uid: string | null; at: number }): string | null {
        if (!r.uid) return null;
        const query = `protoPayload.serviceName="firestore.googleapis.com"\nprotoPayload.request.writes.update.name:"users/${r.uid}"`;
        const range = `${new Date(r.at - 120_000).toISOString()}/${new Date(r.at + 60_000).toISOString()}`;
        return `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(query)};timeRange=${encodeURIComponent(range)}?project=protomap-1e1db`;
    }

    // Незнакомый вид записи показываем как есть, а не сырым ключом перевода.
    function kindLabel(kind: string, translate: (key: string) => string): string {
        const key = `admin_activity.kinds.${kind}`;
        const label = translate(key);
        return label === key ? kind : label;
    }
</script>

<svelte:head>
    <title>{$t('admin_activity.title')} | Overlord</title>
</svelte:head>

<div class="activity-wrapper" in:fade={{ duration: 300 }}>
    <header class="page-header">
        <h1 class="page-title">{$t('admin_activity.title')}</h1>
        <p class="page-sub">{$t('admin_activity.subtitle')}</p>
    </header>

    <form class="filters glass" method="GET">
        <label class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input name="user" value={data.filters.user} placeholder={$t('admin_activity.filters.user_placeholder')} autocomplete="off" />
        </label>
        <select name="group" value={data.filters.group}>
            <option value="">{$t('admin_activity.filters.group_all')}</option>
            {#each GROUPS as g}
                <option value={g}>{$t(`admin_activity.groups.${g}`)}</option>
            {/each}
        </select>
        <select name="days" value={data.filters.days}>
            {#each PERIODS as p}
                <option value={p}>{$t(`admin_activity.periods.${p}`)}</option>
            {/each}
        </select>
        <label class="check">
            <input type="checkbox" name="alerts" value="1" checked={data.filters.alerts} />
            <span>{$t('admin_activity.filters.alerts_only')}</span>
        </label>
        <button type="submit" class="btn">{$t('admin_activity.filters.apply')}</button>
        <a href="/admin/activity" class="btn ghost">{$t('admin_activity.filters.reset')}</a>
    </form>

    {#if data.indexBuilding}
        <div class="notice glass">{$t('admin_activity.index_building')}</div>
    {/if}

    {#if data.userNotFound}
        <div class="notice glass">{$t('admin_activity.user_not_found', { values: { query: data.filters.user } })}</div>
    {/if}

    {#if data.user}
        <section class="summary glass">
            <div class="summary-head">
                <a class="summary-name" href={`/u/${data.user.uid}`}>{data.user.username}</a>
                {#if data.user.isBanned}<span class="flag flag-direct">{$t('admin_activity.summary.banned')}</span>{/if}
                <span class="summary-balance">{$t('admin_activity.summary.balance', { values: { value: nf.format(data.user.balance) } })}</span>
            </div>
            {#if data.summary}
                <div class="stats">
                    <div class="stat"><span>{$t('admin_activity.summary.games_won')}</span><b class="plus">{signed(data.summary.won)}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.games_lost')}</span><b class="minus">{signed(data.summary.lost)}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.games_net')}</span><b class:plus={data.summary.won + data.summary.lost > 0} class:minus={data.summary.won + data.summary.lost < 0}>{signed(data.summary.won + data.summary.lost)}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.shop', { values: { count: data.summary.purchases } })}</span><b>{nf.format(data.summary.shop)}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.bonuses')}</span><b>{signed(data.summary.bonuses)}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.admin')}</span><b>{signed(data.summary.admin)}</b></div>
                    <div class="stat" class:danger={data.summary.direct > 0}><span>{$t('admin_activity.summary.direct')}</span><b>{data.summary.direct}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.unexplained')}</span><b>{data.summary.unexplained}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.comments')}</span><b>{data.summary.comments}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.chat')}</span><b>{data.summary.chat}</b></div>
                    <div class="stat"><span>{$t('admin_activity.summary.channels')}</span><b>{data.summary.channels}</b></div>
                </div>
                {#if data.summary.truncated}<p class="hint">{$t('admin_activity.summary.truncated')}</p>{/if}
            {/if}
        </section>
    {/if}

    {#if data.top}
        <section class="top glass">
            <h2 class="section-title">{$t('admin_activity.top.title')}</h2>
            <div class="top-cols">
                <div>
                    <h3>{$t('admin_activity.top.gainers')}</h3>
                    {#each data.top.gainers as x}
                        <a class="top-row" href={link({ user: x.uid, before: null })}><span>{x.name}</span><b class="plus">{signed(x.sum)}</b></a>
                    {:else}
                        <p class="hint">{$t('admin_activity.top.none')}</p>
                    {/each}
                </div>
                <div>
                    <h3>{$t('admin_activity.top.losers')}</h3>
                    {#each data.top.losers as x}
                        <a class="top-row" href={link({ user: x.uid, before: null })}><span>{x.name}</span><b class="minus">{signed(x.sum)}</b></a>
                    {:else}
                        <p class="hint">{$t('admin_activity.top.none')}</p>
                    {/each}
                </div>
            </div>
        </section>
    {/if}

    <section class="feed">
        {#each data.rows as r (r.id)}
            <article class="row glass" class:alert={r.alert} class:direct={r.flag === 'direct'}>
                <time class="time">{timeFormat.format(r.at)}</time>
                <div class="main">
                    <div class="line">
                        <span class="badge group-{r.group}">{$t(`admin_activity.groups.${r.group}`)}</span>
                        <span class="kind">{kindLabel(r.kind, $t)}</span>
                        {#if r.uid}
                            <a class="who" href={link({ user: r.uid, before: null })}>{r.username ?? r.uid}</a>
                        {/if}
                        {#if r.target && r.target !== r.uid}
                            <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                            </svg>
                            <a class="who" href={link({ user: r.target, before: null })}>{r.targetName ?? r.target}</a>
                        {/if}
                    </div>
                    <div class="details">
                        {#if r.delta !== null}
                            <span class="delta" class:plus={r.delta > 0} class:minus={r.delta < 0}>{signed(r.delta)} PC</span>
                        {/if}
                        {#if r.balance !== null && r.group === 'economy'}
                            <span>{$t('admin_activity.feed.balance', { values: { value: nf.format(r.balance) } })}</span>
                        {/if}
                        {#if r.itemsAdded.length}
                            <span>{$t('admin_activity.feed.items_added', { values: { list: r.itemsAdded.join(', ') } })}</span>
                        {/if}
                        {#if r.itemsRemoved.length}
                            <span>{$t('admin_activity.feed.items_removed', { values: { list: r.itemsRemoved.join(', ') } })}</span>
                        {/if}
                        {#if r.shards}
                            <span>{$t('admin_activity.feed.shards', { values: { value: signed(r.shards) } })}</span>
                        {/if}
                        {#if r.ref}<span class="ref">{r.ref}</span>{/if}
                        {#if r.text}<span class="text">{r.text}</span>{/if}
                        {#if r.fields.length}
                            <span class="fields">{$t('admin_activity.feed.fields', { values: { list: r.fields.join(', ') } })}</span>
                        {/if}
                    </div>
                </div>
                <div class="meta">
                    {#if r.alert}
                        <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label={$t('admin_activity.feed.alert')}>
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    {/if}
                    {#if r.flag}<span class="flag flag-{r.flag}">{$t(`admin_activity.flags.${r.flag}`)}</span>{/if}
                    <span class="author author-{r.authorType ?? 'server'}">{$t(`admin_activity.author.${r.authorType ?? 'server'}`)}</span>
                    {#if r.authorType === 'direct'}
                        <code class="author-id">{[r.authType, r.authorId].filter(Boolean).join(' · ')}</code>
                        {#if r.flag === 'direct' && auditLink(r)}
                            <a class="audit" href={auditLink(r)} target="_blank" rel="noopener noreferrer">{$t('admin_activity.feed.audit')}</a>
                        {/if}
                    {/if}
                </div>
            </article>
        {:else}
            <div class="empty glass">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
                <span>{$t('admin_activity.feed.empty')}</span>
            </div>
        {/each}
    </section>

    {#if data.nextBefore}
        <a class="btn more" href={link({ before: String(data.nextBefore) })}>{$t('admin_activity.feed.load_more')}</a>
    {/if}
</div>

<style>
    .activity-wrapper { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; padding-bottom: 2rem; }

    .page-title {
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 2rem;
        color: #fff; letter-spacing: 0.05em; margin: 0;
    }
    .page-sub { color: #94a3b8; margin: 0.35rem 0 0; font-size: 0.95rem; }

    .glass {
        background: rgba(15, 20, 30, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    }

    /* ── Фильтры ── */
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 1rem; align-items: center; }
    .search {
        flex: 1 1 220px; display: flex; align-items: center; gap: 0.5rem;
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px; padding: 0 0.75rem; color: #64748b;
    }
    .search svg { width: 18px; height: 18px; flex-shrink: 0; }
    .search input { flex: 1; background: transparent; border: 0; color: #e2e8f0; padding: 0.65rem 0; outline: none; min-width: 0; }
    select {
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px; color: #e2e8f0; padding: 0.6rem 0.75rem;
    }
    .check { display: flex; align-items: center; gap: 0.4rem; color: #cbd5e1; font-size: 0.9rem; cursor: pointer; }
    .btn {
        font-family: 'Chakra Petch', monospace; font-weight: 700; letter-spacing: 0.05em;
        padding: 0.6rem 1.1rem; border-radius: 10px; cursor: pointer; text-decoration: none;
        background: rgba(0, 243, 255, 0.12); border: 1px solid rgba(0, 243, 255, 0.35); color: #00f3ff;
        transition: background 0.2s;
    }
    .btn:hover { background: rgba(0, 243, 255, 0.22); }
    .btn.ghost { background: transparent; border-color: rgba(255, 255, 255, 0.15); color: #94a3b8; }
    .btn.more { align-self: center; }

    .notice { padding: 1rem; color: #fca5a5; }
    .hint { color: #64748b; font-size: 0.85rem; margin: 0.5rem 0 0; }

    /* ── Итоги по человеку ── */
    .summary { padding: 1.25rem; }
    .summary-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
    .summary-name { font-family: 'Chakra Petch', sans-serif; font-size: 1.4rem; font-weight: 800; color: #fff; text-decoration: none; }
    .summary-name:hover { color: #00f3ff; }
    .summary-balance { color: #cbd5e1; margin-left: auto; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.6rem; }
    .stat {
        display: flex; flex-direction: column; gap: 0.2rem; padding: 0.7rem 0.85rem;
        background: rgba(0, 0, 0, 0.3); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .stat span { color: #94a3b8; font-size: 0.8rem; }
    .stat b { color: #e2e8f0; font-size: 1.1rem; font-variant-numeric: tabular-nums; }
    .stat.danger { border-color: rgba(255, 0, 60, 0.5); }
    .stat.danger b { color: #ff3b5c; }

    /* ── Топ за сутки ── */
    .top { padding: 1.25rem; }
    .section-title { font-family: 'Chakra Petch', sans-serif; color: #fff; margin: 0 0 0.75rem; font-size: 1.1rem; }
    .top-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
    .top-cols h3 { color: #94a3b8; font-size: 0.85rem; font-weight: 600; margin: 0 0 0.4rem; }
    .top-row {
        display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0.5rem;
        border-radius: 8px; color: #e2e8f0; text-decoration: none;
    }
    .top-row:hover { background: rgba(255, 255, 255, 0.05); }
    .top-row b { font-variant-numeric: tabular-nums; }

    /* ── Лента ── */
    .feed { display: flex; flex-direction: column; gap: 0.5rem; }
    .row { display: grid; grid-template-columns: 92px 1fr auto; gap: 0.85rem; padding: 0.75rem 1rem; align-items: start; }
    .row.alert { border-color: rgba(255, 0, 60, 0.45); }
    .row.direct { background: rgba(60, 5, 15, 0.55); }
    .time { color: #64748b; font-size: 0.8rem; font-variant-numeric: tabular-nums; padding-top: 0.15rem; }
    .main { min-width: 0; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; }
    .kind { color: #e2e8f0; font-weight: 600; }
    .who { color: #00f3ff; text-decoration: none; }
    .who:hover { text-decoration: underline; }
    .arrow { width: 14px; height: 14px; color: #64748b; }
    .details { display: flex; flex-wrap: wrap; gap: 0.35rem 0.85rem; margin-top: 0.3rem; color: #94a3b8; font-size: 0.85rem; }
    .details .text { color: #cbd5e1; overflow-wrap: anywhere; }
    .ref { font-family: monospace; color: #a5b4fc; }
    .fields { font-family: monospace; font-size: 0.8rem; }
    .delta { font-weight: 700; font-variant-numeric: tabular-nums; }
    .plus { color: #4ade80; }
    .minus { color: #f87171; }

    .badge {
        font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        padding: 0.15rem 0.45rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.12); color: #cbd5e1;
    }
    .group-economy { color: #facc15; border-color: rgba(250, 204, 21, 0.35); }
    .group-moderation { color: #fb7185; border-color: rgba(251, 113, 133, 0.35); }
    .group-admin { color: #c084fc; border-color: rgba(192, 132, 252, 0.35); }
    .group-content { color: #67e8f9; border-color: rgba(103, 232, 249, 0.35); }

    .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; }
    .alert-icon { width: 18px; height: 18px; color: #ff3b5c; }
    .flag { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 6px; }
    .flag-direct { background: rgba(255, 0, 60, 0.2); color: #ff3b5c; }
    .flag-unexplained { background: rgba(250, 204, 21, 0.15); color: #facc15; }
    .flag-big { background: rgba(0, 243, 255, 0.12); color: #00f3ff; }
    .author { font-size: 0.75rem; color: #64748b; }
    .author-direct { color: #ff3b5c; font-weight: 700; }
    .author-id { font-size: 0.7rem; color: #fca5a5; max-width: 220px; overflow-wrap: anywhere; text-align: right; }
    .audit { font-size: 0.75rem; color: #00f3ff; }

    .empty { display: flex; align-items: center; justify-content: center; gap: 0.6rem; padding: 2rem; color: #64748b; }
    .empty svg { width: 22px; height: 22px; }

    @media (max-width: 768px) {
        .page-title { font-size: 1.5rem; }
        .row { grid-template-columns: 1fr; gap: 0.4rem; }
        .meta { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: flex-start; }
        .author-id { text-align: left; }
        .top-cols { grid-template-columns: 1fr; }
        .summary-balance { margin-left: 0; }
    }
</style>
