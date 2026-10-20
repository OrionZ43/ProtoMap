<!-- src/lib/components/admin/EventList.svelte -->
<!--
    Список записей журнала действий в карточке главной админки: время, кто
    (ссылка на его записи в журнале), кому, что сделал, на сколько PC.
-->
<script lang="ts">
    import { t } from 'svelte-i18n';
    import { describeEntry, type DescribableEntry } from '$lib/admin/describe';
    import type { Formats } from '$lib/admin/format';

    type Row = DescribableEntry & {
        id: string;
        at: number;
        uid: string | null;
        username: string | null;
        delta: number | null;
        targetName?: string | null;
    };

    export let rows: Row[];
    export let itemNames: Record<string, string>;
    export let now: number;
    export let f: Formats;
    export let empty: string;
</script>

{#if rows.length > 0}
    <ul class="events">
        {#each rows as r (r.id)}
            <li>
                <time>{f.when(r.at, now)}</time>
                <span class="what">
                    {#if r.username}
                        <a class="who" href="/admin/activity?user={encodeURIComponent(r.uid ?? r.username)}">{r.username}</a>
                    {/if}
                    {#if r.targetName}<span class="to">→ {r.targetName}</span>{/if}
                    <span class="desc">{describeEntry(r, $t, itemNames)}</span>
                </span>
                {#if r.delta}
                    <span class="delta" class:p={r.delta > 0} class:m={r.delta < 0}>{f.signed(r.delta)}</span>
                {/if}
            </li>
        {/each}
    </ul>
{:else}
    <p class="empty">{empty}</p>
{/if}

<style>
    .events {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
    }
    li {
        display: flex;
        gap: 14px;
        align-items: baseline;
        padding: 11px 0;
        border-bottom: 1px solid var(--line);
        font-size: 14.5px;
        line-height: 1.45;
    }
    li:last-child {
        border-bottom: 0;
    }
    time {
        flex-shrink: 0;
        min-width: 44px;
        color: var(--dim);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
    }
    .what {
        flex: 1;
        min-width: 0;
        color: rgba(243, 243, 246, 0.82);
        overflow-wrap: anywhere;
    }
    .who {
        color: var(--text);
        font-weight: 500;
        text-decoration: none;
        margin-right: 6px;
    }
    .who:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
    }
    .to {
        color: var(--muted);
        margin-right: 6px;
    }
    .delta {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        font-weight: 500;
    }
    .p {
        color: var(--green);
    }
    .m {
        color: var(--red);
    }
    .empty {
        margin: 6px 0;
        color: var(--muted);
    }
</style>
