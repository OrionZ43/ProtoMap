<!-- src/lib/components/admin/PeekEvents.svelte -->
<!-- Короткий список записей журнала — превью плитки главной админки при наведении. -->
<script lang="ts">
    import { t } from 'svelte-i18n';
    import { describeEntry, type DescribableEntry } from '$lib/admin/describe';
    import type { Formats } from '$lib/admin/format';

    type Row = DescribableEntry & { id: string; at: number; username: string | null; delta: number | null };

    export let rows: Row[];
    export let itemNames: Record<string, string>;
    export let f: Formats;
    export let now: number;
    export let empty: string;
    export let limit = 4;
</script>

{#if rows.length > 0}
    <ul>
        {#each rows.slice(0, limit) as r (r.id)}
            <li>
                <time>{f.when(r.at, now)}</time>
                <span class="what">{#if r.username}<b>{r.username}</b> · {/if}{describeEntry(r, $t, itemNames)}</span>
                {#if r.delta}<span class="delta" class:p={r.delta > 0} class:m={r.delta < 0}>{f.signed(r.delta)}</span>{/if}
            </li>
        {/each}
    </ul>
    {#if rows.length > limit}<p class="more">+{rows.length - limit}</p>{/if}
{:else}
    <p class="empty">{empty}</p>
{/if}

<style>
    ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    li {
        display: flex;
        gap: 10px;
        align-items: baseline;
        min-width: 0;
        font-size: 13px;
        color: rgba(243, 243, 246, 0.8);
    }
    time {
        flex-shrink: 0;
        min-width: 38px;
        color: var(--dim);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }
    .what {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    b {
        color: #fff;
        font-weight: 500;
    }
    .delta {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
    }
    .p {
        color: var(--green);
    }
    .m {
        color: var(--red);
    }
    .empty,
    .more {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
    }
    .more {
        margin-top: 8px;
    }
</style>
