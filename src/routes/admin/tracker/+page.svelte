<!-- src/routes/admin/tracker/+page.svelte -->
<!--
    «Роадмап»: задачи по колонкам «ждёт — в работе — готово», фильтры по
    платформе, исполнителю и приоритету. Новая задача и правка — в карточке
    (Sheet.svelte), удаление — с подтверждением. Вид — общие элементы админки.
-->
<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { flip } from 'svelte/animate';
    import { quintOut } from 'svelte/easing';
    import { t } from 'svelte-i18n';
    import { modal } from '$lib/stores/modalStore';
    import Sheet from '$lib/components/admin/Sheet.svelte';
    import type { PageData } from './$types';
    import type { Task } from './+page.server';

    export let data: PageData;

    const PLATFORMS = ['web', 'app', 'backend', 'design'] as const;
    const PRIORITIES = ['low', 'medium', 'critical'] as const;
    // Новым задачам — только действующая команда; iposdev остаётся у старых.
    const TEAM = ['orion', 'system'] as const;
    const LANES = ['todo', 'in_progress', 'done'] as const;

    const AVATARS: Record<string, string> = {
        orion: '/casino/orioncasino.png',
        iposdev: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=iposdev',
        system: '/logo.svg'
    };
    const PLATFORM_TONE: Record<string, string> = { web: 'violet', app: 'green', backend: 'yellow', design: 'red' };

    let filterPlatform = 'all';
    let filterAssignee = 'all';
    let filterPriority = 'all';
    let creating = false;
    let editing: Task | null = null;
    let busy = false;

    $: assignees = ['all', ...TEAM, ...(data.tasks.some((x) => x.assignee === 'iposdev') ? ['iposdev'] : [])];
    // В карточке задачи iposdev остаётся только у тех задач, где он уже стоит.
    $: formAssignees = editing?.assignee === 'iposdev' ? [...TEAM, 'iposdev'] : [...TEAM];
    $: filtered = data.tasks.filter((x) =>
        (filterPlatform === 'all' || x.platform === filterPlatform) &&
        (filterAssignee === 'all' || x.assignee === filterAssignee) &&
        (filterPriority === 'all' || x.priority === filterPriority)
    );
    $: lanes = {
        todo: filtered.filter((x) => x.status === 'todo'),
        in_progress: filtered.filter((x) => x.status === 'in_progress'),
        done: filtered.filter((x) => x.status === 'done')
    } as Record<string, Task[]>;

    const shortId = (id: string) => 'T·' + id.slice(0, 4).toUpperCase();

    // Ответ сервера: успех — список обновится сам (update), ошибка — окном.
    const act: SubmitFunction = () => {
        busy = true;
        return async ({ result, update }) => {
            await update();
            busy = false;
            if (result.type === 'success') {
                creating = false;
                editing = null;
            } else if (result.type === 'failure') {
                const code = (result.data as { code?: string } | undefined)?.code ?? 'failed';
                modal.error($t('admin_roadmap.result.fail_title'), $t(`admin_roadmap.result.${code}`));
            }
        };
    };

    function confirmDelete(e: MouseEvent, task: Task) {
        const form = (e.currentTarget as HTMLElement).closest('form');
        modal.confirm(
            $t('admin_roadmap.delete_confirm_title'),
            $t('admin_roadmap.delete_confirm_text', { values: { title: task.title } }),
            () => form?.requestSubmit()
        );
    }
</script>

<svelte:head>
    <title>{$t('admin_roadmap.title')} | ProtoMap</title>
</svelte:head>

<header class="adm-head">
    <div>
        <h1>{$t('admin_roadmap.title')}</h1>
        <p>{$t('admin_roadmap.subtitle')}</p>
    </div>
    <button type="button" class="adm-btn primary" on:click={() => (creating = true)}>
        <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        {$t('admin_roadmap.new')}
    </button>
</header>

<div class="filters">
    <div class="group">
        <span class="adm-label">{$t('admin_roadmap.filters.platform')}</span>
        <div class="adm-chips">
            <button type="button" class="adm-chip" class:on={filterPlatform === 'all'} on:click={() => (filterPlatform = 'all')}>{$t('admin_roadmap.filters.all')}</button>
            {#each PLATFORMS as p}
                <button type="button" class="adm-chip" class:on={filterPlatform === p} on:click={() => (filterPlatform = p)}>{$t(`admin_roadmap.platform.${p}`)}</button>
            {/each}
        </div>
    </div>
    <div class="group">
        <span class="adm-label">{$t('admin_roadmap.filters.assignee')}</span>
        <div class="adm-chips">
            {#each assignees as a}
                <button type="button" class="adm-chip" class:on={filterAssignee === a} on:click={() => (filterAssignee = a)}>
                    {a === 'all' ? $t('admin_roadmap.filters.all') : $t(`admin_roadmap.assignee.${a}`)}
                </button>
            {/each}
        </div>
    </div>
    <div class="group">
        <span class="adm-label">{$t('admin_roadmap.filters.priority')}</span>
        <div class="adm-chips">
            <button type="button" class="adm-chip" class:on={filterPriority === 'all'} on:click={() => (filterPriority = 'all')}>{$t('admin_roadmap.filters.all')}</button>
            {#each PRIORITIES as p}
                <button type="button" class="adm-chip" class:on={filterPriority === p} on:click={() => (filterPriority = p)}>{$t(`admin_roadmap.priority.${p}`)}</button>
            {/each}
        </div>
    </div>
</div>

<div class="kanban">
    {#each LANES as lane}
        <section class="adm-panel lane lane-{lane}">
            <header class="lane-head">
                <h2><span class="dot"></span>{$t(`admin_roadmap.lanes.${lane}`)}</h2>
                <span class="count">{lanes[lane].length}</span>
            </header>
            <div class="cards">
                {#each lanes[lane] as task (task.id)}
                    <article class="card prio-{task.priority}" class:is-done={lane === 'done'} animate:flip={{ duration: 280, easing: quintOut }}>
                        <div class="card-top">
                            <span class="adm-badge {PLATFORM_TONE[task.platform]}">{$t(`admin_roadmap.platform.${task.platform}`)}</span>
                            <span class="prio">{$t(`admin_roadmap.priority.${task.priority}`)}</span>
                            <img class="who" src={AVATARS[task.assignee]} alt={$t(`admin_roadmap.assignee.${task.assignee}`)}
                                title={$t(`admin_roadmap.assignee.${task.assignee}`)} referrerpolicy="no-referrer" />
                        </div>
                        <button type="button" class="card-body" on:click={() => (editing = task)}>
                            <h3>{task.title}</h3>
                            {#if task.description}<p>{task.description}</p>{/if}
                        </button>
                        <div class="card-foot">
                            <span class="id">{shortId(task.id)}</span>
                            <div class="card-actions">
                                {#if lane === 'todo'}
                                    <form method="POST" action="?/delete" use:enhance={act}>
                                        <input type="hidden" name="id" value={task.id} />
                                        <button type="button" class="adm-btn icon small danger-ghost" title={$t('admin_roadmap.actions.delete')}
                                            aria-label={$t('admin_roadmap.actions.delete')} on:click={(e) => confirmDelete(e, task)}>
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                                        </button>
                                    </form>
                                    <form method="POST" action="?/updateStatus" use:enhance={act}>
                                        <input type="hidden" name="id" value={task.id} />
                                        <input type="hidden" name="status" value="in_progress" />
                                        <button class="adm-btn small" disabled={busy}>
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z" /></svg>
                                            {$t('admin_roadmap.actions.start')}
                                        </button>
                                    </form>
                                {:else if lane === 'in_progress'}
                                    <form method="POST" action="?/updateStatus" use:enhance={act}>
                                        <input type="hidden" name="id" value={task.id} />
                                        <input type="hidden" name="status" value="todo" />
                                        <button class="adm-btn icon small" disabled={busy} title={$t('admin_roadmap.actions.back')} aria-label={$t('admin_roadmap.actions.back')}>
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                                        </button>
                                    </form>
                                    <form method="POST" action="?/updateStatus" use:enhance={act}>
                                        <input type="hidden" name="id" value={task.id} />
                                        <input type="hidden" name="status" value="done" />
                                        <button class="adm-btn small success" disabled={busy}>
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                                            {$t('admin_roadmap.actions.done')}
                                        </button>
                                    </form>
                                {:else}
                                    <form method="POST" action="?/updateStatus" use:enhance={act}>
                                        <input type="hidden" name="id" value={task.id} />
                                        <input type="hidden" name="status" value="in_progress" />
                                        <button class="adm-btn icon small" disabled={busy} title={$t('admin_roadmap.actions.reopen')} aria-label={$t('admin_roadmap.actions.reopen')}>
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                                        </button>
                                    </form>
                                    <form method="POST" action="?/delete" use:enhance={act}>
                                        <input type="hidden" name="id" value={task.id} />
                                        <button type="button" class="adm-btn icon small danger-ghost" title={$t('admin_roadmap.actions.delete')}
                                            aria-label={$t('admin_roadmap.actions.delete')} on:click={(e) => confirmDelete(e, task)}>
                                            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                                        </button>
                                    </form>
                                {/if}
                            </div>
                        </div>
                    </article>
                {:else}
                    <p class="adm-note empty-lane">{$t('admin_roadmap.empty_lane')}</p>
                {/each}
            </div>
        </section>
    {/each}
</div>

{#if creating || editing}
    <Sheet
        id={editing ? 'task-edit' : 'task-new'}
        title={editing ? $t('admin_roadmap.form.edit_title', { values: { id: shortId(editing.id) } }) : $t('admin_roadmap.form.new_title')}
        closeLabel={$t('admin_roadmap.form.cancel')}
        on:close={() => { creating = false; editing = null; }}
    >
        <form method="POST" action={editing ? '?/edit' : '?/create'} use:enhance={act} class="task-form">
            {#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
            <label class="adm-field full">
                <span class="adm-label">{$t('admin_roadmap.form.title')}</span>
                <input type="text" name="title" class="adm-input" required value={editing?.title ?? ''}
                    placeholder={$t('admin_roadmap.form.title_ph')} autocomplete="off" />
            </label>
            <label class="adm-field">
                <span class="adm-label">{$t('admin_roadmap.form.platform')}</span>
                <select name="platform" class="adm-select">
                    {#each PLATFORMS as p}
                        <option value={p} selected={(editing?.platform ?? 'web') === p}>{$t(`admin_roadmap.platform.${p}`)}</option>
                    {/each}
                </select>
            </label>
            <label class="adm-field">
                <span class="adm-label">{$t('admin_roadmap.form.assignee')}</span>
                <select name="assignee" class="adm-select">
                    {#each formAssignees as a}
                        <option value={a} selected={(editing?.assignee ?? 'orion') === a}>{$t(`admin_roadmap.assignee.${a}`)}</option>
                    {/each}
                </select>
            </label>
            <label class="adm-field">
                <span class="adm-label">{$t('admin_roadmap.form.priority')}</span>
                <select name="priority" class="adm-select">
                    {#each PRIORITIES as p}
                        <option value={p} selected={(editing?.priority ?? 'medium') === p}>{$t(`admin_roadmap.priority.${p}`)}</option>
                    {/each}
                </select>
            </label>
            <label class="adm-field full">
                <span class="adm-label">{$t('admin_roadmap.form.details')}</span>
                <textarea name="description" class="adm-textarea" rows="4" placeholder={$t('admin_roadmap.form.details_ph')}>{editing?.description ?? ''}</textarea>
            </label>
            <div class="form-actions full">
                <button type="button" class="adm-btn" on:click={() => { creating = false; editing = null; }}>{$t('admin_roadmap.form.cancel')}</button>
                <button type="submit" class="adm-btn primary" disabled={busy}>{editing ? $t('admin_roadmap.form.save') : $t('admin_roadmap.form.create')}</button>
            </div>
        </form>
    </Sheet>
{/if}

<style>
    .filters { display: flex; flex-wrap: wrap; gap: 14px 28px; margin-bottom: 20px; }
    .group { display: flex; flex-direction: column; gap: 8px; }

    .kanban { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .adm-panel.lane { padding: 16px; min-height: 360px; }
    .lane-head { display: flex; align-items: center; justify-content: space-between; margin: 2px 4px 14px; }
    .lane-head h2 { display: flex; align-items: center; gap: 10px; margin: 0; font: 500 13px var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--soft); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); }
    .lane-in_progress .dot { background: var(--yellow); box-shadow: 0 0 0 4px rgba(252, 238, 10, .15); }
    .lane-done .dot { background: var(--green); }
    .adm-panel.lane-in_progress { border-color: rgba(252, 238, 10, .16); }
    .count { min-width: 28px; padding: 2px 8px; border-radius: 999px; background: rgba(255, 255, 255, .06); color: var(--muted); font-size: 13px; text-align: center; font-variant-numeric: tabular-nums; }
    .cards { display: flex; flex-direction: column; gap: 10px; }
    .adm-note.empty-lane { padding: 20px 4px; text-align: center; color: var(--dim); }

    .card { position: relative; padding: 14px 14px 12px 18px; border-radius: 16px; border: 1px solid var(--line); background: rgba(255, 255, 255, .03); overflow: hidden; transition: border-color .2s ease, background .2s ease; }
    .card::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--dim); }
    .card.prio-medium::before { background: var(--yellow); }
    .card.prio-critical::before { background: var(--red); }
    .card.prio-critical { background: linear-gradient(90deg, rgba(255, 107, 129, .07), rgba(255, 255, 255, .02) 60%); }
    .card:hover { border-color: var(--line-strong); background-color: rgba(255, 255, 255, .05); }
    .card.is-done { opacity: .7; }
    .card.is-done h3 { text-decoration: line-through; text-decoration-color: var(--dim); }

    .card-top { display: flex; align-items: center; gap: 8px; }
    .prio { font-size: 12px; color: var(--dim); }
    .prio-critical .prio { color: #ffb3c0; }
    .prio-medium .prio { color: #fff6a3; }
    .who { width: 24px; height: 24px; margin-left: auto; border-radius: 50%; object-fit: cover; border: 1px solid var(--line-strong); background: #0a0a0c; }

    .card-body { display: block; width: 100%; margin: 10px 0 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .card-body h3 { margin: 0; font: 500 15.5px/1.35 var(--body); color: var(--text); overflow-wrap: anywhere; }
    .card-body p { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .card-body:hover h3 { text-decoration: underline; text-underline-offset: 3px; }
    .card-body:focus-visible { outline: 2px solid var(--yellow); outline-offset: 4px; border-radius: 6px; }

    .card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
    .id { font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }
    .card-actions { display: flex; gap: 6px; }
    .adm-btn.danger-ghost { color: var(--dim); }
    .adm-btn.danger-ghost:hover:not(:disabled) { color: #ffb3c0; border-color: rgba(255, 107, 129, .4); background: rgba(255, 107, 129, .08); }

    .task-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .full { grid-column: 1 / -1; }
    .form-actions { display: flex; justify-content: flex-end; gap: 10px; }

    @media (max-width: 1000px) {
        .kanban { grid-template-columns: 1fr; }
        .adm-panel.lane { min-height: 0; }
    }
    @media (max-width: 600px) {
        .task-form { grid-template-columns: 1fr; }
    }
</style>
