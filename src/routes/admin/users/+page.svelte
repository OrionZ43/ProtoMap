<!-- src/routes/admin/users/+page.svelte -->
<script lang="ts">
    import { enhance } from '$app/forms';
    import { modal } from '$lib/stores/modalStore';
    import type { ActionData } from './$types';
    import { slide, fade, fly, scale } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';

    export let form: ActionData;

    let isSearching      = false;
    let targetUser: any  = null;
    let candidates: any[] = [];
    let showMigrationModal = false;

    $: if (form) {
        if ((form as any).target) {
            targetUser = (form as any).target;
            candidates  = [];
            isSearching = false;
        } else if ((form as any).candidates) {
            candidates  = (form as any).candidates;
            targetUser  = null;
            isSearching = false;
        } else if ((form as any).message) {
            const f = form as any;
            if (!f.actionSuccess) {
                modal.error('ОШИБКА СИСТЕМЫ', f.message);
                isSearching = false;
            } else {
                modal.success('ПРОТОКОЛ ВЫПОЛНЕН', f.message);
                // Обновляем локальный стейт без перезапроса
                if (f.message.includes('ИЗОЛИРОВАН')    && targetUser) targetUser.isBanned = true;
                if (f.message.includes('ВОССТАНОВЛЕН')  && targetUser) targetUser.isBanned = false;
                if (f.message.includes('EMAIL ВЕРИФИЦ') && targetUser) targetUser.emailVerified = true;
                if (f.message.includes('Баланс')        && targetUser) {
                    const match = f.message.match(/([+-]?\d+)/);
                    if (match) targetUser.casino_credits += parseInt(match[0]);
                }
            }
        }
    }

    function selectCandidate(username: string) {
        const input = document.querySelector('input[name="query"]') as HTMLInputElement;
        if (input) {
            input.value = username;
            input.closest('form')?.requestSubmit();
        }
    }
</script>

<svelte:head>
    <title>Subjects Control | Overlord</title>
</svelte:head>

<div class="users-wrapper" in:fade={{ duration: 400 }}>

    <header class="page-header">
        <div>
            <h2 class="page-title">БАЗА ДАННЫХ СУБЪЕКТОВ</h2>
            <p class="page-sub">/// ACCESS LEVEL: UNLIMITED</p>
        </div>
        <button class="migration-btn" on:click={() => showMigrationModal = true}>
            ⚠️ MIGRATION PROTOCOL
        </button>
    </header>

    <!-- ПОИСК -->
    <div class="search-module">
        <form method="POST" action="?/search"
            use:enhance={() => {
                isSearching = true;
                targetUser  = null;
                return async ({ update }) => { await update(); };
            }}
            class="search-form">
            <div class="input-wrapper">
                <span class="search-icon">⌖</span>
                <input type="text" name="query"
                    placeholder="Идентификатор субъекта (username)..."
                    class="clean-input" autocomplete="off" />
            </div>
            <button type="submit" class="scan-btn" disabled={isSearching}>
                {isSearching ? 'SCANNING...' : 'НАЙТИ'}
            </button>
        </form>
    </div>

    <!-- Кандидаты -->
    {#if candidates.length > 0}
        <div class="candidates-list" transition:slide>
            <p class="candidates-title">НАЙДЕНО: {candidates.length}</p>
            <div class="candidates-grid">
                {#each candidates as u}
                    <button class="candidate-card" on:click={() => selectCandidate(u.username)}>
                        <img src={u.avatar_url || '/casino/orioncasino.png'} alt="" class="c-avatar" />
                        <span>{u.username}</span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    <!-- ДОСЬЕ -->
    {#if targetUser}
        <div class="dossier" in:fly={{ y: 40, duration: 500, easing: quintOut }}>

            <!-- Шапка досье -->
            <div class="dossier-head">
                <div class="dossier-avatar-wrap">
                    <img src={targetUser.avatar_url || '/casino/orioncasino.png'}
                         alt="Subject" class="dossier-avatar" />
                    <div class="status-ring" class:banned={targetUser.isBanned}></div>
                </div>

                <div class="dossier-meta">
                    <h3 class="dossier-name">{targetUser.username}</h3>
                    <div class="meta-tags">
                        <span class="mtag" class:mtag-banned={targetUser.isBanned}
                              class:mtag-active={!targetUser.isBanned}>
                            {targetUser.isBanned ? '🔴 ЗАБЛОКИРОВАН' : '🟢 АКТИВЕН'}
                        </span>
                        <span class="mtag" class:mtag-verified={targetUser.emailVerified}
                              class:mtag-unverified={!targetUser.emailVerified}>
                            {targetUser.emailVerified ? '✉️ EMAIL OK' : '✉️ НЕ ВЕРИФИЦИРОВАН'}
                        </span>
                        {#if targetUser.telegram_id}
                            <span class="mtag mtag-tg">📱 TG: {targetUser.telegram_id}</span>
                        {/if}
                    </div>
                    <div class="meta-rows">
                        <div class="mrow"><span class="mk">UID</span><code class="mv">{targetUser.uid}</code></div>
                        <div class="mrow"><span class="mk">EMAIL</span><span class="mv">{targetUser.email}</span></div>
                        <div class="mrow"><span class="mk">ДАТА</span><span class="mv">{targetUser.createdAt}</span></div>
                    </div>
                    <div class="dossier-stats">
                        <div class="dstat yellow">
                            <span class="dstat-l">БАЛАНС</span>
                            <span class="dstat-v">{targetUser.casino_credits.toLocaleString()} PC</span>
                        </div>
                        <div class="dstat blue">
                            <span class="dstat-l">ПРЕДМЕТЫ</span>
                            <span class="dstat-v">{targetUser.owned_items.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Панель управления -->
            <div class="control-grid">

                <!-- Инъекция средств -->
                <div class="ctrl-section">
                    <h4 class="ctrl-title green-t">// ИНЪЕКЦИЯ СРЕДСТВ</h4>
                    <form method="POST" action="?/modifyCredits" use:enhance class="btn-row">
                        <input type="hidden" name="uid" value={targetUser.uid} />
                        <button name="amount" value="1000"   class="cmd green">+1K</button>
                        <button name="amount" value="10000"  class="cmd green">+10K</button>
                        <button name="amount" value="100000" class="cmd green">+100K</button>
                    </form>
                </div>

                <!-- Карательные меры -->
                <div class="ctrl-section">
                    <h4 class="ctrl-title red-t">// КАРАТЕЛЬНЫЕ МЕРЫ</h4>
                    <form method="POST" action="?/modifyCredits" use:enhance class="btn-row">
                        <input type="hidden" name="uid" value={targetUser.uid} />
                        <button name="amount" value="-1000"  class="cmd red">-1K</button>
                        <button name="amount" value="-10000" class="cmd red">-10K</button>
                        <button name="amount" value="-{targetUser.casino_credits}"
                                class="cmd red outline">ОБНУЛИТЬ</button>
                    </form>
                </div>

                <!-- Лутбоксы -->
                <div class="ctrl-section full">
                    <h4 class="ctrl-title purple-t">// ЛУТБОКСЫ</h4>
                    <form method="POST" action="?/grantAllItems" use:enhance>
                        <input type="hidden" name="uid" value={targetUser.uid} />
                        <button class="cmd purple full-btn">ВЫДАТЬ GOD PACK (ВСЕ ПРЕДМЕТЫ)</button>
                    </form>
                </div>

                <!-- 🆕 Email верификация -->
                <div class="ctrl-section full">
                    <h4 class="ctrl-title cyan-t">// ВЕРИФИКАЦИЯ EMAIL</h4>
                    {#if targetUser.emailVerified}
                        <div class="already-verified">✅ Email уже подтверждён</div>
                    {:else}
                        <form method="POST" action="?/verifyEmail" use:enhance>
                            <input type="hidden" name="uid" value={targetUser.uid} />
                            <button class="cmd cyan full-btn">
                                ✉️ ВЕРИФИЦИРОВАТЬ ПРИНУДИТЕЛЬНО
                            </button>
                        </form>
                    {/if}
                </div>

                <!-- Протоколы безопасности -->
                <div class="ctrl-section full">
                    <h4 class="ctrl-title red-t">// ПРОТОКОЛЫ БЕЗОПАСНОСТИ</h4>
                    {#if targetUser.isBanned}
                        <form method="POST" action="?/unbanUser" use:enhance>
                            <input type="hidden" name="uid" value={targetUser.uid} />
                            <button class="cmd green full-btn">АМНИСТИЯ (РАЗБАНИТЬ)</button>
                        </form>
                    {:else}
                        <form method="POST" action="?/banUser" use:enhance class="ban-form">
                            <input type="hidden" name="uid" value={targetUser.uid} />
                            <input type="text" name="reason"
                                   placeholder="Причина блокировки..."
                                   class="reason-input" required />
                            <button class="cmd red">ЗАБЛОКИРОВАТЬ</button>
                        </form>
                    {/if}
                </div>

            </div>
        </div>
    {/if}

    <!-- Migration modal -->
    {#if showMigrationModal}
        <div class="modal-overlay" transition:fade on:click|self={() => showMigrationModal = false}>
            <div class="migration-panel" transition:scale={{ duration: 200 }}>
                <h3 class="mig-title">/// ACCOUNT TRANSFER</h3>
                <p class="mig-desc">
                    Перенесёт баланс, предметы и метку со старого аккаунта на новый.
                    Старый аккаунт будет заблокирован. <strong>Необратимо.</strong>
                </p>
                <form method="POST" action="?/migrate"
                      use:enhance={() => async ({ update }) => { await update(); showMigrationModal = false; }}>
                    <div class="mig-field">
                        <label class="mig-label red-t">SOURCE UID (откуда)</label>
                        <input type="text" name="sourceUid" required class="mig-input red-border"
                               placeholder="Старый UID" />
                    </div>
                    <div class="mig-arrow">⬇</div>
                    <div class="mig-field">
                        <label class="mig-label green-t">TARGET UID (куда)</label>
                        <input type="text" name="targetUid" required class="mig-input green-border"
                               placeholder="Новый UID" />
                    </div>
                    <div class="mig-actions">
                        <button type="button" class="mig-cancel"
                                on:click={() => showMigrationModal = false}>ОТМЕНА</button>
                        <button type="submit" class="mig-confirm">ВЫПОЛНИТЬ ПЕРЕНОС</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

</div>

<style>
    :root {
        --cc: #00f3ff; --cy: #fcee0a; --cr: #ff003c; --cp: #bd00ff; --cg: #39ff14;
    }

    .users-wrapper { max-width: 860px; margin: 0 auto; }

    /* HEADER */
    .page-header {
        display: flex; justify-content: space-between; align-items: flex-start;
        margin-bottom: 2.5rem;
    }
    .page-title {
        font-family: 'Chakra Petch', monospace; font-size: 1.8rem; font-weight: 900;
        color: #fff; letter-spacing: .08em; margin-bottom: .3rem;
    }
    .page-sub { font-family: 'Chakra Petch', monospace; font-size: .75rem; color: #334155; letter-spacing: .2em; }

    /* SEARCH */
    .search-module { margin-bottom: 2rem; }
    .search-form { display: flex; gap: .75rem; }
    .input-wrapper {
        flex: 1; display: flex; align-items: center; gap: .75rem;
        background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
        border-radius: 4px; padding: 0 1rem;
        transition: border-color .2s;
    }
    .input-wrapper:focus-within { border-color: var(--cy); }
    .search-icon { color: #334155; font-size: 1.1rem; }
    .clean-input {
        flex: 1; background: transparent; border: none; color: #fff;
        padding: .85rem 0; font-size: 1rem; outline: none;
        font-family: 'Chakra Petch', monospace;
    }
    .clean-input::placeholder { color: #334155; }
    .scan-btn {
        background: var(--cy); color: #000; font-weight: 900;
        font-family: 'Chakra Petch', monospace; border: none;
        padding: 0 1.75rem; border-radius: 3px; cursor: pointer;
        clip-path: polygon(0 6px,6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%);
        transition: box-shadow .2s;
    }
    .scan-btn:hover:not(:disabled) { box-shadow: 0 0 16px rgba(252,238,10,.4); }
    .scan-btn:disabled { opacity: .5; cursor: not-allowed; }

    /* CANDIDATES */
    .candidates-list { margin-bottom: 1.5rem; }
    .candidates-title { font-family: 'Chakra Petch', monospace; font-size: .65rem; color: #475569; letter-spacing: .2em; margin-bottom: .75rem; }
    .candidates-grid { display: flex; flex-wrap: wrap; gap: .5rem; }
    .candidate-card {
        display: flex; align-items: center; gap: .6rem; padding: .5rem .85rem;
        background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
        border-radius: 3px; cursor: pointer; color: #e2e8f0;
        font-family: 'Chakra Petch', monospace; font-size: .82rem;
        transition: all .2s;
    }
    .candidate-card:hover { border-color: var(--cy); color: var(--cy); }
    .c-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }

    /* DOSSIER */
    .dossier {
        background: rgba(9,11,17,.9); border: 1px solid rgba(255,255,255,.07);
        border-radius: 2px;
        clip-path: polygon(0 20px,20px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%);
    }

    .dossier-head {
        display: flex; gap: 2rem; padding: 2rem;
        border-bottom: 1px solid rgba(255,255,255,.05);
    }
    @media(max-width:640px) { .dossier-head { flex-direction: column; align-items: center; text-align: center; } }

    .dossier-avatar-wrap { position: relative; flex-shrink: 0; }
    .dossier-avatar {
        width: 120px; height: 120px; border-radius: 50%;
        object-fit: cover; border: 2px solid rgba(255,255,255,.1);
    }
    .status-ring {
        position: absolute; inset: -4px; border-radius: 50%;
        border: 2px solid var(--cg); box-shadow: 0 0 12px var(--cg);
        animation: pulse-ring 2s infinite;
    }
    .status-ring.banned { border-color: var(--cr); box-shadow: 0 0 12px var(--cr); }
    @keyframes pulse-ring { 0%,100%{opacity:1} 50%{opacity:.5} }

    .dossier-meta { flex: 1; }
    .dossier-name {
        font-family: 'Chakra Petch', monospace; font-size: 2rem;
        font-weight: 900; color: #fff; text-transform: uppercase;
        letter-spacing: .05em; margin-bottom: .75rem;
    }
    .meta-tags { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1rem; }
    .mtag {
        font-family: 'Chakra Petch', monospace; font-size: .65rem;
        padding: .2rem .55rem; border-radius: 2px; letter-spacing: .1em;
        border: 1px solid rgba(255,255,255,.1); color: #475569;
    }
    .mtag-active    { color: var(--cg); border-color: rgba(57,255,20,.3); background: rgba(57,255,20,.05); }
    .mtag-banned    { color: var(--cr); border-color: rgba(255,0,60,.3); background: rgba(255,0,60,.05); }
    .mtag-verified  { color: var(--cc); border-color: rgba(0,243,255,.3); background: rgba(0,243,255,.05); }
    .mtag-unverified{ color: #64748b; }
    .mtag-tg        { color: #60a5fa; border-color: rgba(96,165,250,.3); background: rgba(96,165,250,.05); }

    .meta-rows { display: flex; flex-direction: column; gap: .3rem; margin-bottom: 1.1rem; }
    .mrow { display: flex; align-items: baseline; gap: .75rem; font-size: .82rem; }
    .mk { font-family: 'Chakra Petch', monospace; font-size: .62rem; color: #475569; letter-spacing: .15em; min-width: 50px; }
    .mv { color: #94a3b8; word-break: break-all; }

    .dossier-stats { display: flex; gap: .75rem; }
    .dstat {
        padding: .5rem 1rem; border-radius: 2px;
        background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
        display: flex; flex-direction: column;
    }
    .dstat-l { font-family: 'Chakra Petch', monospace; font-size: .6rem; color: #475569; letter-spacing: .15em; }
    .dstat-v { font-family: 'Chakra Petch', monospace; font-size: 1.1rem; font-weight: 900; }
    .dstat.yellow .dstat-v { color: var(--cy); }
    .dstat.blue   .dstat-v { color: #60a5fa; }

    /* CONTROL GRID */
    .control-grid {
        padding: 1.75rem; display: grid;
        grid-template-columns: 1fr 1fr; gap: 1.5rem;
    }
    @media(max-width:640px) { .control-grid { grid-template-columns: 1fr; } }

    .ctrl-section { display: flex; flex-direction: column; gap: .6rem; }
    .ctrl-section.full { grid-column: 1 / -1; }

    .ctrl-title {
        font-family: 'Chakra Petch', monospace; font-size: .68rem;
        letter-spacing: .18em; opacity: .8; margin-bottom: .2rem;
    }
    .green-t  { color: var(--cg); }
    .red-t    { color: var(--cr); }
    .purple-t { color: var(--cp); }
    .cyan-t   { color: var(--cc); }

    .btn-row { display: flex; gap: .4rem; }

    .cmd {
        flex: 1; padding: .65rem .5rem; border-radius: 2px;
        font-family: 'Chakra Petch', monospace; font-size: .78rem; font-weight: 700;
        cursor: pointer; background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08); color: #e2e8f0;
        transition: all .2s;
    }
    .cmd:hover { transform: translateY(-1px); }
    .cmd.green:hover  { background: rgba(57,255,20,.1); border-color: var(--cg); color: var(--cg); box-shadow: 0 0 12px rgba(57,255,20,.2); }
    .cmd.red:hover    { background: rgba(255,0,60,.1); border-color: var(--cr); color: var(--cr); box-shadow: 0 0 12px rgba(255,0,60,.2); }
    .cmd.purple:hover { background: rgba(189,0,255,.1); border-color: var(--cp); color: var(--cp); box-shadow: 0 0 12px rgba(189,0,255,.2); }
    .cmd.cyan:hover   { background: rgba(0,243,255,.1); border-color: var(--cc); color: var(--cc); box-shadow: 0 0 12px rgba(0,243,255,.2); }
    .cmd.outline      { background: transparent; border-color: rgba(255,255,255,.1); }
    .cmd.full-btn     { width: 100%; }

    .already-verified {
        padding: .65rem 1rem; font-family: 'Chakra Petch', monospace;
        font-size: .8rem; color: #4ade80; letter-spacing: .05em;
        background: rgba(74,222,128,.05); border: 1px solid rgba(74,222,128,.2);
        border-radius: 2px;
    }

    .ban-form { display: flex; gap: .5rem; }
    .reason-input {
        flex: 1; background: rgba(255,0,60,.05); border: 1px solid rgba(255,0,60,.2);
        color: #fff; padding: 0 .75rem; border-radius: 2px; outline: none;
        font-family: 'Chakra Petch', monospace; font-size: .82rem;
    }
    .reason-input:focus { border-color: var(--cr); }

    /* MIGRATION MODAL */
    .modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.85);
        z-index: 100; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(6px);
    }
    .migration-panel {
        width: 90%; max-width: 480px;
        background: rgba(9,11,17,.98); border: 1px solid var(--cr);
        box-shadow: 0 0 40px rgba(255,0,60,.15);
        padding: 2rem;
        clip-path: polygon(0 16px,16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%);
    }
    .mig-title { font-family: 'Chakra Petch', monospace; font-size: 1.1rem; font-weight: 900; color: var(--cr); margin-bottom: .75rem; letter-spacing: .08em; }
    .mig-desc  { font-size: .82rem; color: #64748b; margin-bottom: 1.5rem; line-height: 1.6; }
    .mig-desc strong { color: var(--cr); }
    .mig-field { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .5rem; }
    .mig-label { font-family: 'Chakra Petch', monospace; font-size: .65rem; letter-spacing: .15em; }
    .mig-input {
        background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.1);
        color: #fff; padding: .6rem .75rem; outline: none;
        font-family: 'Chakra Petch', monospace; font-size: .88rem;
        transition: border-color .2s;
    }
    .red-border:focus   { border-color: var(--cr); }
    .green-border:focus { border-color: var(--cg); }
    .mig-arrow { text-align: center; font-size: 1.2rem; color: #334155; padding: .3rem 0; }
    .mig-actions { display: flex; gap: .75rem; margin-top: 1.5rem; }
    .mig-cancel {
        flex: 1; padding: .75rem; background: transparent;
        border: 1px solid #334155; color: #64748b;
        font-family: 'Chakra Petch', monospace; font-weight: 700;
        cursor: pointer; transition: all .2s;
    }
    .mig-cancel:hover { border-color: #94a3b8; color: #fff; }
    .mig-confirm {
        flex: 1; padding: .75rem; background: var(--cr); border: none; color: #fff;
        font-family: 'Chakra Petch', monospace; font-weight: 900;
        cursor: pointer; text-transform: uppercase; letter-spacing: .1em;
        transition: box-shadow .2s;
    }
    .mig-confirm:hover { box-shadow: 0 0 20px rgba(255,0,60,.4); }

    /* Migration btn */
    .migration-btn {
        background: rgba(255,0,60,.08); border: 1px solid rgba(255,0,60,.35);
        color: var(--cr); padding: .5rem 1.1rem;
        font-family: 'Chakra Petch', monospace; font-weight: 700; font-size: .78rem;
        cursor: pointer; letter-spacing: .1em; transition: all .2s;
        white-space: nowrap;
    }
    .migration-btn:hover { background: var(--cr); color: #000; box-shadow: 0 0 15px rgba(255,0,60,.3); }
</style>