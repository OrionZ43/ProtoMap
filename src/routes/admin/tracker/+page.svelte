<script lang="ts">
    import { enhance } from '$app/forms';
    import { fade, slide, scale } from 'svelte/transition';
    import { flip } from 'svelte/animate';
    import { quintOut } from 'svelte/easing';
    import type { PageData } from './$types';

    export let data: PageData;

    // === ФИЛЬТРЫ ===
    let filterPlatform: string = 'all';
    let filterAssignee: string = 'all';

    // Реактивная фильтрация
    $: filteredTasks = data.tasks.filter(t => {
        const matchPlatform = filterPlatform === 'all' || t.platform === filterPlatform;
        const matchAssignee = filterAssignee === 'all' || t.assignee === filterAssignee;
        return matchPlatform && matchAssignee;
    });

    $: todoTasks = filteredTasks.filter(t => t.status === 'todo');
    $: progressTasks = filteredTasks.filter(t => t.status === 'in_progress');
    $: doneTasks = filteredTasks.filter(t => t.status === 'done');

    // === UI STATE ===
    let showCreateForm = false;
    let editingTask: any = null; // Если не null, показываем модалку редактирования

    function getShortId(id: string) { return 'T-' + id.substring(0, 4).toUpperCase(); }

    // Аватарки для команды
    const AVATARS: any = {
        'orion': '/casino/orioncasino.png', // Твой аватар
        'iposdev': 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=iposdev', // Заглушка для друга
        'system': '/logo.svg'
    };
</script>

<svelte:head>
    <title>Neural Planner v2.0</title>
</svelte:head>

<div class="mission-control" in:fade={{duration: 500}}>
    <div class="grid-bg"></div>

    <!-- HEADER & FILTERS -->
    <header class="hud-header">
        <div class="header-left">
            <h1 class="glitch-title" data-text="NEURAL_PLANNER">NEURAL_PLANNER</h1>
            <div class="filters-bar">
                <span class="filter-label">FILTER:</span>
                <button class="filter-btn" class:active={filterPlatform === 'all'} on:click={() => filterPlatform = 'all'}>ALL</button>
                <button class="filter-btn" class:active={filterPlatform === 'web'} on:click={() => filterPlatform = 'web'}>WEB</button>
                <button class="filter-btn" class:active={filterPlatform === 'app'} on:click={() => filterPlatform = 'app'}>APP</button>
                <span class="separator">|</span>
                <button class="filter-btn" class:active={filterAssignee === 'orion'} on:click={() => filterAssignee = filterAssignee === 'orion' ? 'all' : 'orion'}>ORION</button>
                <button class="filter-btn" class:active={filterAssignee === 'iposdev'} on:click={() => filterAssignee = filterAssignee === 'iposdev' ? 'all' : 'iposdev'}>IPOS</button>
            </div>
        </div>

        <button class="cyber-btn" on:click={() => showCreateForm = !showCreateForm}>
            {showCreateForm ? 'CLOSE UPLINK' : 'NEW DIRECTIVE'}
        </button>
    </header>

    <!-- CREATE FORM -->
    {#if showCreateForm}
        <div class="form-wrapper" transition:slide>
            <form method="POST" action="?/create" use:enhance={() => { showCreateForm = false; return async ({ update }) => update(); }} class="tech-form">
                <h3 class="form-title">> INITIATE_PROTOCOL</h3>
                <div class="inputs-grid">
                    <div class="group">
                        <label>TITLE</label>
                        <input type="text" name="title" class="hud-input" required placeholder="Task name..."/>
                    </div>
                    <div class="group">
                        <label>MODULE</label>
                        <select name="platform" class="hud-input">
                            <option value="web">WEB_CLIENT</option>
                            <option value="app">MOBILE_APP</option>
                            <option value="backend">SERVER_CORE</option>
                            <option value="design">VISUAL_ARTS</option>
                        </select>
                    </div>
                    <div class="group">
                        <label>OPERATOR</label>
                        <select name="assignee" class="hud-input">
                            <option value="orion">ORION</option>
                            <option value="iposdev">IPOSDEV</option>
                            <option value="system">SYSTEM</option>
                        </select>
                    </div>
                    <div class="group">
                        <label>PRIORITY</label>
                        <select name="priority" class="hud-input">
                            <option value="low">LOW</option>
                            <option value="medium" selected>MEDIUM</option>
                            <option value="critical">CRITICAL</option>
                        </select>
                    </div>
                    <div class="group full">
                        <label>DETAILS</label>
                        <input type="text" name="description" class="hud-input" placeholder="Technical specifications..."/>
                    </div>
                </div>
                <button type="submit" class="submit-cmd">EXECUTE</button>
            </form>
        </div>
    {/if}

    <!-- EDIT MODAL -->
    {#if editingTask}
        <div class="modal-overlay" transition:fade on:click|self={() => editingTask = null}>
            <div class="modal-content tech-form" transition:scale>
                <h3 class="form-title">> EDIT_DIRECTIVE: {getShortId(editingTask.id)}</h3>
                <form method="POST" action="?/edit" use:enhance={() => { editingTask = null; return async ({ update }) => update(); }}>
                    <input type="hidden" name="id" value={editingTask.id} />
                    <div class="inputs-grid">
                        <div class="group full">
                            <label>TITLE</label>
                            <input type="text" name="title" class="hud-input" value={editingTask.title} required />
                        </div>
                        <div class="group">
                            <label>OPERATOR</label>
                            <select name="assignee" class="hud-input" value={editingTask.assignee}>
                                <option value="orion">ORION</option>
                                <option value="iposdev">IPOSDEV</option>
                                <option value="system">SYSTEM</option>
                            </select>
                        </div>
                        <div class="group">
                            <label>PRIORITY</label>
                            <select name="priority" class="hud-input" value={editingTask.priority}>
                                <option value="low">LOW</option>
                                <option value="medium">MEDIUM</option>
                                <option value="critical">CRITICAL</option>
                            </select>
                        </div>
                        <div class="group full">
                            <label>DETAILS</label>
                            <input type="text" name="description" class="hud-input" value={editingTask.description} />
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="cancel-cmd" on:click={() => editingTask = null}>CANCEL</button>
                        <button type="submit" class="submit-cmd">SAVE CHANGES</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- KANBAN BOARD -->
    <div class="kanban-grid">

        <!-- TODO -->
        <div class="lane todo">
            <div class="lane-header">
                <span class="lane-name">PENDING</span>
                <span class="count">{todoTasks.length}</span>
            </div>
            <div class="lane-body">
                {#each todoTasks as task (task.id)}
                    <div class="tech-card priority-{task.priority}" animate:flip={{duration: 300, easing: quintOut}}>
                        <div class="card-top">
                            <span class="id-tag">{getShortId(task.id)}</span>
                            <div class="assignee-avatar" title={task.assignee}>
                                <img src={AVATARS[task.assignee]} alt={task.assignee}>
                            </div>
                        </div>

                        <div class="card-main" on:click={() => editingTask = task}>
                            <h4 class="card-title">{task.title}</h4>
                            <span class="platform-tag {task.platform}">{task.platform}</span>
                        </div>

                        <div class="card-controls">
                            <form method="POST" action="?/delete" use:enhance><input type="hidden" name="id" value={task.id}><button class="ctrl-btn del">×</button></form>
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id}><input type="hidden" name="status" value="in_progress">
                                <button class="ctrl-btn next">►</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- PROGRESS -->
        <div class="lane progress">
            <div class="lane-header">
                <span class="lane-name text-cyber-yellow">PROCESSING</span>
                <span class="count warning">{progressTasks.length}</span>
            </div>
            <div class="lane-body">
                {#each progressTasks as task (task.id)}
                    <div class="tech-card priority-{task.priority} active" animate:flip={{duration: 300, easing: quintOut}}>
                        <div class="active-scanline"></div>
                        <div class="card-top">
                            <span class="id-tag text-cyber-yellow">{getShortId(task.id)}</span>
                            <div class="assignee-avatar" title={task.assignee}>
                                <img src={AVATARS[task.assignee]} alt={task.assignee}>
                            </div>
                        </div>

                        <div class="card-main" on:click={() => editingTask = task}>
                            <h4 class="card-title text-cyber-yellow">{task.title}</h4>
                            {#if task.description}<p class="card-desc">{task.description}</p>{/if}
                            <span class="platform-tag {task.platform}">{task.platform}</span>
                        </div>

                        <div class="card-controls">
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id}><input type="hidden" name="status" value="todo">
                                <button class="ctrl-btn prev">◄</button>
                            </form>
                            <form method="POST" action="?/updateStatus" use:enhance>
                                <input type="hidden" name="id" value={task.id}><input type="hidden" name="status" value="done">
                                <button class="ctrl-btn next">✔</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- DONE -->
        <div class="lane done">
            <div class="lane-header">
                <span class="lane-name text-green-400">ONLINE</span>
                <span class="count success">{doneTasks.length}</span>
            </div>
            <div class="lane-body">
                {#each doneTasks as task (task.id)}
                    <div class="tech-card done" animate:flip={{duration: 300, easing: quintOut}}>
                        <div class="card-top">
                            <span class="id-tag">{getShortId(task.id)}</span>
                            <div class="assignee-avatar dimmed">
                                <img src={AVATARS[task.assignee]} alt={task.assignee}>
                            </div>
                        </div>
                        <h4 class="card-title line-through text-gray-500">{task.title}</h4>
                        <div class="card-controls justify-end">
                            <form method="POST" action="?/delete" use:enhance>
                                <input type="hidden" name="id" value={task.id}>
                                <button class="ctrl-btn archive">ARCHIVE</button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

    </div>
</div>

<style>
    /* Базовые стили такие же, но с добавками */
    .mission-control { padding: 2rem; color: #e0f7fa; min-height: 100vh; position: relative; }
    .grid-bg { position: absolute; inset: 0; z-index: -1; background-size: 40px 40px; background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px); }

    .hud-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; border-bottom: 1px solid rgba(0,243,255,0.2); padding-bottom: 1rem; }
    .glitch-title { font-family: 'Chakra Petch', monospace; font-size: 2rem; font-weight: 800; color: white; text-shadow: 0 0 10px rgba(0,243,255,0.5); }

    /* FILTERS */
    .filters-bar { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
    .filter-label { font-size: 0.7rem; color: #64748b; font-weight: bold; margin-right: 0.5rem; }
    .filter-btn {
        background: transparent; border: 1px solid #333; color: #666;
        padding: 2px 8px; font-size: 0.7rem; font-family: 'Chakra Petch', monospace;
        cursor: pointer; transition: all 0.2s; border-radius: 4px;
    }
    .filter-btn:hover { color: white; border-color: #666; }
    .filter-btn.active { background: rgba(0,243,255,0.1); border-color: var(--cyber-cyan); color: var(--cyber-cyan); }
    .separator { color: #333; font-size: 0.8rem; }

    /* CARD STYLES */
    .tech-card {
        background: rgba(30,35,45,0.7); padding: 0.8rem; border-radius: 6px;
        border-left: 3px solid #555; margin-bottom: 1rem; position: relative;
        transition: transform 0.2s;
    }
    .tech-card:hover { transform: translateY(-2px); background: rgba(40,45,55,0.9); }

    .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .id-tag { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: #64748b; }

    .assignee-avatar { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #555; overflow: hidden; }
    .assignee-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .assignee-avatar.dimmed { filter: grayscale(1); opacity: 0.5; }

    .card-main { cursor: pointer; }
    .card-title { font-weight: bold; font-size: 0.9rem; margin-bottom: 0.3rem; line-height: 1.3; }
    .card-desc { font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .platform-tag {
        font-size: 0.6rem; padding: 1px 4px; border-radius: 3px; font-weight: bold; text-transform: uppercase;
        display: inline-block; margin-bottom: 0.5rem; border: 1px solid transparent;
    }
    .platform-tag.web { color: #60a5fa; border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.1); }
    .platform-tag.app { color: #c084fc; border-color: rgba(192,132,252,0.3); background: rgba(192,132,252,0.1); }
    .platform-tag.backend { color: #facc15; border-color: rgba(250,204,21,0.3); background: rgba(250,204,21,0.1); }
    .platform-tag.design { color: #f472b6; border-color: rgba(244,114,182,0.3); background: rgba(244,114,182,0.1); }

    /* Priorities */
    .priority-low { border-left-color: #60a5fa; }
    .priority-medium { border-left-color: var(--cyber-yellow); }
    .priority-critical { border-left-color: #ff003c; background: repeating-linear-gradient(45deg, rgba(30,35,45,0.7), rgba(30,35,45,0.7) 10px, rgba(255,0,60,0.05) 10px, rgba(255,0,60,0.05) 20px); }

    .active-scanline {
        position: absolute; top: 0; left: 0; width: 100%; height: 2px;
        background: var(--cyber-yellow); opacity: 0.5; animation: scan 2s infinite linear; pointer-events: none;
    }
    @keyframes scan { 0% { top: 0; opacity: 0; } 50% { opacity: 0.5; } 100% { top: 100%; opacity: 0; } }

    /* CONTROLS */
    .card-controls { display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.5rem; }
    .ctrl-btn { background: transparent; border: 1px solid transparent; color: #555; padding: 0 6px; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
    .ctrl-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .ctrl-btn.next:hover { color: #4ade80; }
    .ctrl-btn.del:hover { color: #ff003c; }

    /* COLUMNS */
    .kanban-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .lane { background: rgba(15, 20, 30, 0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 1rem; min-height: 60vh; }
    .lane-header { display: flex; justify-content: space-between; margin-bottom: 1rem; font-family: 'Chakra Petch', monospace; font-weight: bold; font-size: 0.9rem; }
    .count { background: #333; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .count.warning { color: var(--cyber-yellow); }
    .count.success { color: #4ade80; }

    /* MODAL */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
    .modal-content { width: 90%; max-width: 600px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem; }
    .cancel-btn, .cancel-cmd { background: transparent; border: 1px solid #555; color: #ccc; padding: 0.8rem 1.5rem; font-family: 'Chakra Petch', monospace; font-weight: bold; cursor: pointer; }
    .cancel-cmd:hover { border-color: #fff; color: #fff; }

    /* COMMON FORM STYLES */
    .form-wrapper { margin-bottom: 2rem; }
    .tech-form { background: rgba(15,20,25,0.95); padding: 2rem; border: 1px solid var(--cyber-cyan); box-shadow: 0 0 30px rgba(0,243,255,0.1); }
    .form-title { font-family: 'JetBrains Mono', monospace; color: #64748b; margin-bottom: 1rem; border-bottom: 1px dashed #333; padding-bottom: 0.5rem; }
    .inputs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .group { display: flex; flex-direction: column; gap: 0.3rem; }
    .group.full { grid-column: span 2; }
    .group label { font-size: 0.7rem; font-weight: bold; color: var(--cyber-cyan); letter-spacing: 0.1em; }
    .hud-input { background: rgba(0,0,0,0.3); border: 1px solid #333; color: white; padding: 0.6rem; font-family: 'Inter', sans-serif; width: 100%; }
    .hud-input:focus { border-color: var(--cyber-yellow); outline: none; }
    .submit-cmd { background: var(--cyber-yellow); color: black; font-weight: 800; border: none; padding: 0.8rem 2rem; cursor: pointer; font-family: 'Chakra Petch', monospace; width: 100%; margin-top: 1rem; }
    .submit-cmd:hover { box-shadow: 0 0 15px var(--cyber-yellow); }
    .cyber-btn { background: rgba(0,243,255,0.1); border: 1px solid var(--cyber-cyan); color: var(--cyber-cyan); padding: 0.5rem 1.5rem; font-weight: bold; font-family: 'Chakra Petch', monospace; cursor: pointer; }
    .cyber-btn:hover { background: var(--cyber-cyan); color: black; box-shadow: 0 0 15px var(--cyber-cyan); }

    @media(max-width: 768px) {
        .hud-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
        .filters-bar { flex-wrap: wrap; }
        .inputs-grid { grid-template-columns: 1fr; }
        .group.full { grid-column: span 1; }
    }
</style>