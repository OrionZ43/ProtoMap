<!-- src/routes/admin/tracker/+page.svelte -->
<script lang="ts">
    import { enhance } from '$app/forms';
    import { fade, slide, scale } from 'svelte/transition';
    import { flip } from 'svelte/animate';
    import { quintOut } from 'svelte/easing';
    import type { PageData } from './$types';

    export let data: PageData;

    // Фильтры
    let filterPlatform = 'all';
    let filterAssignee = 'all';
    let filterPriority = 'all';

    $: filtered = data.tasks.filter(t =>
        (filterPlatform === 'all' || t.platform === filterPlatform) &&
        (filterAssignee === 'all' || t.assignee === filterAssignee) &&
        (filterPriority === 'all' || t.priority === filterPriority)
    );

    $: todo     = filtered.filter(t => t.status === 'todo');
    $: progress = filtered.filter(t => t.status === 'in_progress');
    $: done     = filtered.filter(t => t.status === 'done');

    let showCreate  = false;
    let editingTask: any = null;

    function shortId(id: string) { return 'T·' + id.slice(0,4).toUpperCase(); }

    const AVATARS: Record<string,string> = {
        orion:   '/casino/orioncasino.png',
        iposdev: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=iposdev',
        system:  '/logo.svg'
    };

    const PLATFORM_COLOR: Record<string,string> = {
        web:     '#60a5fa',
        app:     '#c084fc',
        backend: '#facc15',
        design:  '#f472b6'
    };

    const PRIORITY_LABEL: Record<string,string> = {
        low:      'LOW',
        medium:   'MED',
        critical: 'CRIT'
    };
</script>

<svelte:head><title>Neural Planner | Overlord</title></svelte:head>

<div class="planner" in:fade={{ duration: 400 }}>
    <div class="grid-bg"></div>

    <!-- HEADER -->
    <header class="planner-header">
        <div class="header-left">
            <h1 class="planner-title">NEURAL_PLANNER</h1>
            <!-- Фильтры -->
            <div class="filters">
                <div class="filter-group">
                    <span class="filter-sep">PLATFORM:</span>
                    {#each ['all','web','app','backend','design'] as p}
                        <button class="ftag" class:ftag-on={filterPlatform === p}
                                on:click={() => filterPlatform = p}>
                            {p === 'all' ? 'ALL' : p.toUpperCase()}
                        </button>
                    {/each}
                </div>
                <div class="filter-group">
                    <span class="filter-sep">WHO:</span>
                    {#each ['all','orion','iposdev','system'] as a}
                        <button class="ftag" class:ftag-on={filterAssignee === a}
                                on:click={() => filterAssignee = a}>
                            {a.toUpperCase()}
                        </button>
                    {/each}
                </div>
                <div class="filter-group">
                    <span class="filter-sep">PRIO:</span>
                    {#each ['all','low','medium','critical'] as p}
                        <button class="ftag"
                                class:ftag-on={filterPriority === p}
                                class:ftag-crit={p === 'critical' && filterPriority === 'critical'}
                                on:click={() => filterPriority = p}>
                            {p === 'all' ? 'ALL' : PRIORITY_LABEL[p]}
                        </button>
                    {/each}
                </div>
            </div>
        </div>
        <button class="new-btn" on:click={() => showCreate = !showCreate}>
            {showCreate ? '✕ CLOSE' : '+ NEW DIRECTIVE'}
        </button>
    </header>

    <!-- CREATE FORM -->
    {#if showCreate}
        <div class="form-wrap" transition:slide={{ duration: 250 }}>
            <form method="POST" action="?/create"
                  use:enhance={() => { showCreate = false; return async ({ update }) => update(); }}
                  class="directive-form">
                <h3 class="form-tag">> INITIATE_PROTOCOL</h3>
                <div class="form-grid">
                    <div class="fg full">
                        <label>TITLE</label>
                        <input type="text" name="title" class="fi" required placeholder="Task name..." />
                    </div>
                    <div class="fg">
                        <label>MODULE</label>
                        <select name="platform" class="fi">
                            <option value="web">WEB_CLIENT</option>
                            <option value="app">MOBILE_APP</option>
                            <option value="backend">SERVER_CORE</option>
                            <option value="design">VISUAL_ARTS</option>
                        </select>
                    </div>
                    <div class="fg">
                        <label>OPERATOR</label>
                        <select name="assignee" class="fi">
                            <option value="orion">ORION</option>
                            <option value="iposdev">IPOSDEV</option>
                            <option value="system">SYSTEM</option>
                        </select>
                    </div>
                    <div class="fg">
                        <label>PRIORITY</label>
                        <select name="priority" class="fi">
                            <option value="low">LOW</option>
                            <option value="medium" selected>MEDIUM</option>
                            <option value="critical">CRITICAL</option>
                        </select>
                    </div>
                    <div class="fg full">
                        <label>DETAILS</label>
                        <input type="text" name="description" class="fi" placeholder="Technical specs..." />
                    </div>
                </div>
                <button type="submit" class="exec-btn">EXECUTE</button>
            </form>
        </div>
    {/if}

    <!-- EDIT MODAL -->
    {#if editingTask}
        <div class="modal-overlay" transition:fade on:click|self={() => editingTask = null}>
            <div class="edit-modal" transition:scale={{ duration: 180, easing: quintOut }}>
                <h3 class="form-tag">> EDIT: {shortId(editingTask.id)}</h3>
                <form method="POST" action="?/edit"
                      use:enhance={() => { editingTask = null; return async ({ update }) => update(); }}>
                    <input type="hidden" name="id" value={editingTask.id} />
                    <div class="form-grid">
                        <div class="fg full">
                            <label>TITLE</label>
                            <input type="text" name="title" class="fi" value={editingTask.title} required />
                        </div>
                        <div class="fg">
                            <label>OPERATOR</label>
                            <select name="assignee" class="fi">
                                <option value="orion"   selected={editingTask.assignee === 'orion'}>ORION</option>
                                <option value="iposdev" selected={editingTask.assignee === 'iposdev'}>IPOSDEV</option>
                                <option value="system"  selected={editingTask.assignee === 'system'}>SYSTEM</option>
                            </select>
                        </div>
                        <div class="fg">
                            <label>PRIORITY</label>
                            <select name="priority" class="fi">
                                <option value="low"      selected={editingTask.priority === 'low'}>LOW</option>
                                <option value="medium"   selected={editingTask.priority === 'medium'}>MEDIUM</option>
                                <option value="critical" selected={editingTask.priority === 'critical'}>CRITICAL</option>
                            </select>
                        </div>
                        <div class="fg full">
                            <label>DETAILS</label>
                            <input type="text" name="description" class="fi" value={editingTask.description} />
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" on:click={() => editingTask = null}>CANCEL</button>
                        <button type="submit" class="exec-btn">SAVE</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- KANBAN -->
    <div class="kanban">

        <!-- TODO -->
        <div class="lane">
            <div class="lane-head">
                <div class="lane-name">
                    <span class="lane-dot" style="background:#475569"></span>
                    PENDING
                </div>
                <span class="lane-count">{todo.length}</span>
            </div>
            <div class="lane-body">
                {#each todo as task (task.id)}
                    <div class="card prio-{task.priority}" animate:flip={{ duration: 280, easing: quintOut }}>
                        <div class="card-top">
                            <span class="card-id">{shortId(task.id)}</span>
                            <div class="card-badges">
                                <span class="pbadge" style="color:{PLATFORM_COLOR[task.platform]}">{task.platform}</span>
                                <img src={AVATARS[task.assignee]} alt={task.assignee} class="assignee-av" title={task.assignee} />
                            </div>
                        </div>
                        <div class="card-body" on:click={() => editingTask = task} role="button" tabindex="0"
                             on:keydown={(e) => e.key === 'Enter' && (editingTask = task)}>
                            <h4 class="card-title">{task.title}</h4>
                            {#if task.description}<p class="card-desc">{task.description}</p>{/if}
                        </div>
                        <div class="card-foot">
                            <form method="POST" action="?/delete" use:enhance>
                                <input type="hidden" name="id" value={task.id} />
                                <button class="ctrl-btn del" title="Delete">×</button>
                            </form>
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="status" value="in_progress" />
                                <button class="ctrl-btn go" title="Start">▶</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- IN PROGRESS -->
        <div class="lane lane-active">
            <div class="lane-head">
                <div class="lane-name">
                    <span class="lane-dot pulse" style="background:#fcee0a"></span>
                    PROCESSING
                </div>
                <span class="lane-count warn">{progress.length}</span>
            </div>
            <div class="lane-body">
                {#each progress as task (task.id)}
                    <div class="card card-active prio-{task.priority}" animate:flip={{ duration: 280, easing: quintOut }}>
                        <div class="scanline"></div>
                        <div class="card-top">
                            <span class="card-id cy">{shortId(task.id)}</span>
                            <div class="card-badges">
                                <span class="pbadge" style="color:{PLATFORM_COLOR[task.platform]}">{task.platform}</span>
                                <img src={AVATARS[task.assignee]} alt={task.assignee} class="assignee-av" />
                            </div>
                        </div>
                        <div class="card-body" on:click={() => editingTask = task} role="button" tabindex="0"
                             on:keydown={(e) => e.key === 'Enter' && (editingTask = task)}>
                            <h4 class="card-title cy">{task.title}</h4>
                            {#if task.description}<p class="card-desc">{task.description}</p>{/if}
                        </div>
                        <div class="card-foot">
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="status" value="todo" />
                                <button class="ctrl-btn back" title="Back">◀</button>
                            </form>
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="status" value="done" />
                                <button class="ctrl-btn done" title="Done">✔</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- DONE -->
        <div class="lane lane-done">
            <div class="lane-head">
                <div class="lane-name">
                    <span class="lane-dot" style="background:#4ade80"></span>
                    ONLINE
                </div>
                <span class="lane-count ok">{done.length}</span>
            </div>
            <div class="lane-body">
                {#each done as task (task.id)}
                    <div class="card card-done" animate:flip={{ duration: 280, easing: quintOut }}>
                        <div class="card-top">
                            <span class="card-id muted">{shortId(task.id)}</span>
                            <img src={AVATARS[task.assignee]} alt={task.assignee} class="assignee-av dimmed" />
                        </div>
                        <h4 class="card-title muted struck">{task.title}</h4>
                        <div class="card-foot justify-end">
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id} />
                                <input type="hidden" name="status" value="in_progress" />
                                <button class="ctrl-btn back" title="Reopen">↩</button>
                            </form>
                            <form method="POST" action="?/delete" use:enhance>
                                <input type="hidden" name="id" value={task.id} />
                                <button class="ctrl-btn del" title="Archive">×</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

    </div>
</div>

<style>
    :root { --cy:#fcee0a; --cc:#00f3ff; --cr:#ff003c; --cg:#39ff14; }

    .planner { padding: 1.5rem; min-height: 100%; position: relative; color: #e2e8f0; }

    .grid-bg {
        position: absolute; inset: 0; z-index: 0; pointer-events: none;
        background-size: 32px 32px;
        background-image:
            linear-gradient(rgba(255,255,255,.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
    }

    /* HEADER */
    .planner-header {
        position: relative; z-index: 1;
        display: flex; justify-content: space-between; align-items: flex-start;
        margin-bottom: 1.5rem; padding-bottom: 1.25rem;
        border-bottom: 1px solid rgba(0,243,255,.15);
        flex-wrap: wrap; gap: 1rem;
    }
    .planner-title {
        font-family: 'Chakra Petch', monospace; font-size: 1.6rem; font-weight: 900;
        color: #fff; letter-spacing: .08em; margin-bottom: .6rem;
        text-shadow: 0 0 20px rgba(0,243,255,.3);
    }

    /* FILTERS */
    .filters { display: flex; flex-direction: column; gap: .4rem; }
    .filter-group { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
    .filter-sep { font-family: 'Chakra Petch', monospace; font-size: .6rem; color: #334155; letter-spacing: .15em; min-width: 55px; }
    .ftag {
        background: transparent; border: 1px solid rgba(255,255,255,.07);
        color: #475569; padding: .15rem .5rem; font-size: .65rem;
        font-family: 'Chakra Petch', monospace; cursor: pointer; border-radius: 2px;
        transition: all .15s;
    }
    .ftag:hover   { color: #e2e8f0; border-color: rgba(255,255,255,.2); }
    .ftag.ftag-on { background: rgba(0,243,255,.1); border-color: var(--cc); color: var(--cc); }
    .ftag.ftag-crit { background: rgba(255,0,60,.1); border-color: var(--cr); color: var(--cr); }

    /* BUTTONS */
    .new-btn {
        background: rgba(0,243,255,.08); border: 1px solid rgba(0,243,255,.3);
        color: var(--cc); padding: .55rem 1.25rem;
        font-family: 'Chakra Petch', monospace; font-weight: 700; font-size: .8rem;
        cursor: pointer; letter-spacing: .1em; transition: all .2s; white-space: nowrap;
    }
    .new-btn:hover { background: var(--cc); color: #000; box-shadow: 0 0 16px rgba(0,243,255,.3); }

    /* FORM */
    .form-wrap { position: relative; z-index: 1; margin-bottom: 1.5rem; }
    .directive-form, .edit-modal form {
        background: rgba(9,11,17,.95); border: 1px solid var(--cc);
        padding: 1.5rem; box-shadow: 0 0 30px rgba(0,243,255,.08);
    }
    .form-tag {
        font-family: 'JetBrains Mono', monospace; font-size: .75rem;
        color: #475569; margin-bottom: 1rem;
        border-bottom: 1px dashed rgba(255,255,255,.07); padding-bottom: .5rem;
    }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: .75rem; }
    @media(max-width:640px) { .form-grid { grid-template-columns: 1fr; } }
    .fg { display: flex; flex-direction: column; gap: .25rem; }
    .fg.full { grid-column: 1 / -1; }
    .fg label { font-family: 'Chakra Petch', monospace; font-size: .6rem; color: var(--cc); letter-spacing: .15em; }
    .fi {
        background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1);
        color: #fff; padding: .5rem .65rem; font-size: .85rem; outline: none;
        font-family: 'Chakra Petch', monospace; transition: border-color .2s;
    }
    .fi:focus { border-color: var(--cy); }
    .fi option { background: #0f172a; }

    .exec-btn {
        background: var(--cy); color: #000; font-weight: 900;
        font-family: 'Chakra Petch', monospace; border: none;
        padding: .65rem 2rem; cursor: pointer; margin-top: 1rem;
        letter-spacing: .1em; transition: box-shadow .2s; width: 100%;
    }
    .exec-btn:hover { box-shadow: 0 0 16px rgba(252,238,10,.4); }

    .modal-actions { display: flex; gap: .75rem; margin-top: 1rem; }
    .cancel-btn {
        flex: 1; padding: .65rem; background: transparent;
        border: 1px solid rgba(255,255,255,.1); color: #64748b;
        font-family: 'Chakra Petch', monospace; font-weight: 700;
        cursor: pointer; transition: all .2s;
    }
    .cancel-btn:hover { border-color: #94a3b8; color: #fff; }

    /* KANBAN */
    .kanban {
        position: relative; z-index: 1;
        display: grid; grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem; align-items: start;
    }
    @media(max-width:900px) { .kanban { grid-template-columns: 1fr; } }

    .lane {
        background: rgba(10,12,18,.6); border: 1px solid rgba(255,255,255,.05);
        border-radius: 4px; padding: 1rem; min-height: 400px;
    }
    .lane-active { border-color: rgba(252,238,10,.1); }
    .lane-done   { opacity: .8; }

    .lane-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 1rem; padding-bottom: .6rem;
        border-bottom: 1px solid rgba(255,255,255,.05);
    }
    .lane-name {
        display: flex; align-items: center; gap: .5rem;
        font-family: 'Chakra Petch', monospace; font-size: .75rem;
        font-weight: 700; letter-spacing: .12em; color: #94a3b8;
    }
    .lane-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .lane-dot.pulse { animation: blink 1.5s infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }

    .lane-count {
        font-family: 'Chakra Petch', monospace; font-size: .7rem;
        background: rgba(255,255,255,.06); padding: .1rem .4rem;
        border-radius: 2px; color: #475569;
    }
    .lane-count.warn { color: var(--cy); }
    .lane-count.ok   { color: #4ade80; }

    .lane-body { display: flex; flex-direction: column; gap: .6rem; }

    /* CARDS */
    .card {
        background: rgba(20,25,35,.7); border: 1px solid rgba(255,255,255,.06);
        border-left: 3px solid #334155; border-radius: 3px; padding: .8rem;
        position: relative; overflow: hidden; transition: transform .2s, background .2s;
    }
    .card:hover { transform: translateY(-2px); background: rgba(30,35,45,.9); }

    .prio-low      { border-left-color: #60a5fa; }
    .prio-medium   { border-left-color: var(--cy); }
    .prio-critical {
        border-left-color: var(--cr);
        background: repeating-linear-gradient(
            45deg, rgba(20,25,35,.7), rgba(20,25,35,.7) 12px,
            rgba(255,0,60,.04) 12px, rgba(255,0,60,.04) 24px
        );
    }

    .card-active { border-color: rgba(252,238,10,.15); }
    .card-done   { border-left-color: #1e293b; }

    .scanline {
        position: absolute; top: 0; left: 0; width: 100%; height: 2px;
        background: linear-gradient(90deg, transparent, var(--cy), transparent);
        opacity: .4; animation: scan-y 2.5s linear infinite;
    }
    @keyframes scan-y { 0%{top:0;opacity:0} 20%{opacity:.4} 80%{opacity:.4} 100%{top:100%;opacity:0} }

    .card-top {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: .4rem;
    }
    .card-id {
        font-family: 'JetBrains Mono', monospace; font-size: .62rem; color: #475569;
    }
    .card-id.cy    { color: var(--cy); }
    .card-id.muted { color: #1e293b; }

    .card-badges { display: flex; align-items: center; gap: .4rem; }
    .pbadge { font-family: 'Chakra Petch', monospace; font-size: .58rem; font-weight: 700; }

    .assignee-av { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,.1); }
    .assignee-av.dimmed { filter: grayscale(1); opacity: .4; }

    .card-body { cursor: pointer; }
    .card-title { font-weight: 700; font-size: .88rem; color: #e2e8f0; line-height: 1.35; margin-bottom: .25rem; }
    .card-title.cy     { color: var(--cy); }
    .card-title.muted  { color: #334155; }
    .card-title.struck { text-decoration: line-through; }
    .card-desc { font-size: .72rem; color: #475569; line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

    .card-foot {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: .6rem; padding-top: .5rem;
        border-top: 1px solid rgba(255,255,255,.04);
    }
    .card-foot.justify-end { justify-content: flex-end; gap: .4rem; }

    .ctrl-btn {
        background: transparent; border: 1px solid transparent;
        color: #334155; width: 26px; height: 26px;
        border-radius: 3px; cursor: pointer; font-size: .85rem;
        display: flex; align-items: center; justify-content: center;
        transition: all .15s;
    }
    .ctrl-btn:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.1); }
    .ctrl-btn.del:hover  { color: var(--cr); border-color: rgba(255,0,60,.3); }
    .ctrl-btn.go:hover   { color: #4ade80; border-color: rgba(74,222,128,.3); }
    .ctrl-btn.done:hover { color: #4ade80; border-color: rgba(74,222,128,.3); }
    .ctrl-btn.back:hover { color: #60a5fa; border-color: rgba(96,165,250,.3); }

    /* MODAL */
    .modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.85);
        z-index: 100; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(6px);
    }
    .edit-modal {
        width: 90%; max-width: 560px;
        background: rgba(9,11,17,.98); border: 1px solid var(--cc);
        padding: 1.75rem; box-shadow: 0 0 40px rgba(0,243,255,.1);
    }
</style>