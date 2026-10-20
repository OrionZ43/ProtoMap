<!-- src/lib/components/admin/PersonList.svelte -->
<!--
    Список людей в карточке главной админки: аватарка, ник (ссылка на профиль),
    подпись (когда был, когда пришёл, сколько сделал) и ссылка на его записи
    в журнале действий.
-->
<script lang="ts">
    export let people: Array<{ uid: string; username: string; avatar?: string | null; meta: string; online?: boolean }>;
    export let empty: string;
    export let journalLabel: string;

    // Кружки без аватарки.
    const PALETTE = ['#5be49b', '#fcee0a', '#c9bbff', '#ffb020', '#7ee8f2'];
</script>

{#if people.length > 0}
    <ul class="people">
        {#each people as p, i (p.uid)}
            <li>
                <a class="ava" href="/u/{p.uid}" style="--c: {PALETTE[i % PALETTE.length]}" tabindex="-1" aria-hidden="true">
                    {#if p.avatar}<img src={p.avatar} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{p.username.charAt(0).toUpperCase()}{/if}
                    {#if p.online}<i class="online"></i>{/if}
                </a>
                <div class="info">
                    <a class="name" href="/u/{p.uid}">{p.username}</a>
                    <span class="meta">{p.meta}</span>
                </div>
                <a class="journal" href="/admin/activity?user={encodeURIComponent(p.uid)}" title={journalLabel} aria-label="{journalLabel}: {p.username}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                </a>
            </li>
        {/each}
    </ul>
{:else}
    <p class="empty">{empty}</p>
{/if}

<style>
    .people {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 8px;
    }
    li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--line);
        min-width: 0;
    }
    .ava {
        position: relative;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        background: var(--c);
        color: #0a0a0c;
        font: 600 14px var(--display);
        text-decoration: none;
    }
    .ava img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
    }
    .online {
        position: absolute;
        right: -1px;
        bottom: -1px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--green);
        /* Обводка — цвет карточки (admin.css, --tile-base), чтобы точка «вырезала» аватарку. */
        border: 2px solid var(--tile-base, #121216);
    }
    .info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
    }
    .name {
        color: var(--text);
        font-weight: 500;
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .name:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
    }
    .meta {
        color: var(--muted);
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .journal {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: var(--dim);
        flex-shrink: 0;
        transition: color 0.2s ease, background 0.2s ease;
    }
    .journal:hover {
        color: var(--text);
        background: rgba(255, 255, 255, 0.06);
    }
    .journal svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
    }
    .empty {
        margin: 6px 0;
        color: var(--muted);
    }
</style>
