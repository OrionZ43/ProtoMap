<script lang="ts">
    import { enhance } from '$app/forms';
    import { modal } from '$lib/stores/modalStore';
    import type { ActionData } from './$types';
    import { slide, fade, fly, scale } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';

    export let form: ActionData;

    let isSearching = false;
    let targetUser: any = null;
    let candidates: any[] = [];
    let showMigrationModal = false;

    $: if (form) {
        if (form.target) {
            targetUser = form.target;
            candidates = [];
            isSearching = false;
        } else if (form.candidates) {
            candidates = form.candidates;
            targetUser = null;
            isSearching = false;
        } else if (form.message) {
            if (!form.actionSuccess) {
                modal.error("ОШИБКА СИСТЕМЫ", form.message);
                isSearching = false;
            } else {
                modal.success("ПРОТОКОЛ ВЫПОЛНЕН", form.message);
                if (form.message.includes('ИЗОЛИРОВАН') && targetUser) targetUser.isBanned = true;
                if (form.message.includes('ВОССТАНОВЛЕН') && targetUser) targetUser.isBanned = false;
                if (form.message.includes('Баланс') && targetUser) {
                    const match = form.message.match(/([+-]?\d+)/);
                    if (match) {
                        targetUser.casino_credits += parseInt(match[0]);
                    }
                }
            }
        }
    }

    function selectCandidate(username: string) {
        const input = document.querySelector('input[name="query"]') as HTMLInputElement;
        if (input) {
            input.value = username;
            const formElement = input.closest('form');
            formElement?.requestSubmit();
        }
    }
</script>

<svelte:head>
    <title>Subjects Control | Overlord</title>
</svelte:head>

<div class="users-wrapper" in:fade={{duration: 500}}>

    <header class="page-header">
        <h2 class="text-3xl font-bold text-white font-display tracking-widest mb-2">БАЗА ДАННЫХ СУБЪЕКТОВ</h2>
        <p class="text-gray-500 font-mono text-sm">/// ACCESS LEVEL: UNLIMITED</p>
    </header>

    <div class="actions-header flex justify-end mb-4">
        <button class="migration-btn" on:click={() => showMigrationModal = true}>
            ⚠️ MIGRATION PROTOCOL
        </button>
    </div>

    <div class="search-module cyber-glass">
        <form
            method="POST"
            action="?/search"
            use:enhance={() => {
                isSearching = true;
                targetUser = null;
                return async ({ update }) => { await update(); };
            }}
            class="search-form"
        >
            <div class="input-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" name="query" placeholder="Идентификатор субъекта (username)..." class="clean-input" autocomplete="off"/>
            </div>
            <button type="submit" class="scan-btn" disabled={isSearching}>
                {isSearching ? 'СКАНИРОВАНИЕ...' : 'НАЙТИ СУБЪЕКТА'}
            </button>
        </form>
    </div>

    {#if candidates.length > 0}
        <div class="candidates-list cyber-glass" transition:slide>
            <h3 class="list-title">ОБНАРУЖЕНО СОВПАДЕНИЙ: {candidates.length}</h3>
            <div class="list-grid">
                {#each candidates as user}
                    <button class="candidate-card" on:click={() => selectCandidate(user.username)}>
                        <img src={user.avatar_url || '/casino/orioncasino.png'} alt="Avatar" class="mini-avatar" />
                        <span class="candidate-name">{user.username}</span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    {#if targetUser}
        <div class="dossier-card cyber-glass" in:fly={{y: 50, duration: 600, easing: quintOut}}>
            <div class="corner tl"></div><div class="corner tr"></div>
            <div class="corner bl"></div><div class="corner br"></div>
            <div class="scan-line"></div>

            <div class="dossier-grid">
                <div class="profile-visual">
                    <div class="avatar-frame">
                        <img src={targetUser.avatar_url || '/casino/orioncasino.png'} alt="Subject" class="subject-img" />
                    </div>
                    {#if targetUser.isBanned}
                        <div class="status-badge banned">ЗАБЛОКИРОВАН</div>
                    {:else}
                        <div class="status-badge active">АКТИВЕН</div>
                    {/if}
                </div>

                <div class="profile-data">
                    <h3 class="subject-name">{targetUser.username}</h3>
                    <div class="meta-row">
                        <span class="meta-label">UID:</span>
                        <span class="meta-value font-mono">{targetUser.uid}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">EMAIL:</span>
                        <span class="meta-value">{targetUser.email}</span>
                    </div>

                    <div class="stats-row">
                        <div class="stat-pill yellow">
                            <span class="label">БАЛАНС</span>
                            <span class="val">{targetUser.casino_credits} PC</span>
                        </div>
                        <div class="stat-pill blue">
                            <span class="label">ПРЕДМЕТЫ</span>
                            <span class="val">{targetUser.owned_items.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="control-panel">

                <div class="control-section">
                    <h4 class="section-title text-green-400">// ИНЪЕКЦИЯ СРЕДСТВ</h4>
                    <form method="POST" action="?/modifyCredits" use:enhance class="btn-grid">
                        <input type="hidden" name="uid" value={targetUser.uid} />
                        <button name="amount" value="1000" class="cmd-btn green">+1K</button>
                        <button name="amount" value="10000" class="cmd-btn green">+10K</button>
                        <button name="amount" value="100000" class="cmd-btn green">+100K</button>
                    </form>
                </div>

                <div class="control-section">
                    <h4 class="section-title text-red-500">// КАРАТЕЛЬНЫЕ МЕРЫ</h4>
                    <form method="POST" action="?/modifyCredits" use:enhance class="btn-grid">
                        <input type="hidden" name="uid" value={targetUser.uid} />
                        <button name="amount" value="-1000" class="cmd-btn red">-1K</button>
                        <button name="amount" value="-10000" class="cmd-btn red">-10K</button>
                        <button name="amount" value="-{targetUser.casino_credits}" class="cmd-btn red outlined">ОБНУЛИТЬ</button>
                    </form>
                </div>

                <div class="control-section full-width">
                    <h4 class="section-title text-purple-400">// ЛУТБОКСЫ</h4>
                    <form method="POST" action="?/grantAllItems" use:enhance>
                        <input type="hidden" name="uid" value={targetUser.uid} />
                        <button class="cmd-btn purple w-full">ВЫДАТЬ GOD PACK (ВСЕ ПРЕДМЕТЫ)</button>
                    </form>
                </div>

                <div class="control-section full-width">
                    <h4 class="section-title text-red-500">// ПРОТОКОЛЫ БЕЗОПАСНОСТИ</h4>

                    {#if targetUser.isBanned}
                        <form method="POST" action="?/unbanUser" use:enhance>
                            <input type="hidden" name="uid" value={targetUser.uid} />
                            <button class="cmd-btn green w-full">АМНИСТИЯ (РАЗБАНИТЬ)</button>
                        </form>
                    {:else}
                        <form method="POST" action="?/banUser" use:enhance class="ban-form">
                            <input type="hidden" name="uid" value={targetUser.uid} />
                            <input type="text" name="reason" placeholder="Причина бана..." class="reason-input" required />
                            <button class="cmd-btn red w-full">ЗАБЛОКИРОВАТЬ ДОСТУП</button>
                        </form>
                    {/if}
                </div>

            </div>
        </div>
    {/if}

    {#if showMigrationModal}
        <div class="modal-overlay" transition:fade>
            <div class="migration-panel cyber-glass" transition:scale>
                <h3 class="text-xl font-bold text-red-500 mb-4 font-display">/// ACCOUNT TRANSFER</h3>
                <p class="text-sm text-gray-400 mb-6">
                    Внимание! Эта операция перенесет баланс, предметы и метку со старого аккаунта на новый.
                    Старый аккаунт будет заблокирован. Действие необратимо.
                </p>

                <form method="POST" action="?/migrate" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        showMigrationModal = false;
                    };
                }}>
                    <div class="input-group">
                        <label class="text-xs font-bold text-red-400">SOURCE UID (ОТКУДА ЗАБИРАЕМ)</label>
                        <input type="text" name="sourceUid" required class="cyber-input red" placeholder="Старый UID" />
                    </div>

                    <div class="icon-arrow">⬇️</div>

                    <div class="input-group">
                        <label class="text-xs font-bold text-green-400">TARGET UID (КУДА КЛАДЕМ)</label>
                        <input type="text" name="targetUid" required class="cyber-input green" placeholder="Новый UID" />
                    </div>

                    <div class="flex gap-3 mt-6">
                        <button type="button" class="cancel-btn" on:click={() => showMigrationModal = false}>ОТМЕНА</button>
                        <button type="submit" class="confirm-btn">ВЫПОЛНИТЬ ПЕРЕНОС</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}
</div>

<style>
    .users-wrapper { max-width: 900px; margin: 0 auto; }
    .page-header { margin-bottom: 3rem; text-align: center; }

    .cyber-glass {
        background: rgba(20, 25, 35, 0.4);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        overflow: hidden;
        position: relative;
    }

    .search-module { padding: 1rem; display: flex; align-items: center; margin-bottom: 3rem; }
    .search-form { display: flex; width: 100%; gap: 1rem; }
    .input-wrapper {
        flex-grow: 1; display: flex; align-items: center;
        background: rgba(0,0,0,0.2); border-radius: 12px; padding: 0 1rem;
        border: 1px solid rgba(255,255,255,0.05);
        transition: border-color 0.3s;
    }
    .input-wrapper:focus-within { border-color: var(--cyber-yellow); box-shadow: 0 0 15px rgba(0, 243, 255, 0.1); }
    .search-icon { font-size: 1.2rem; opacity: 0.5; margin-right: 0.5rem; }
    .clean-input {
        width: 100%; background: transparent; border: none; color: #fff; padding: 1rem 0;
        font-family: 'Inter', sans-serif; font-size: 1.1rem; outline: none;
    }
    .scan-btn {
        padding: 0 2rem; background: var(--cyber-yellow); color: #000; font-weight: 800;
        font-family: 'Chakra Petch', sans-serif; border-radius: 12px; cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s; white-space: nowrap;
    }
    .scan-btn:hover { transform: scale(1.02); box-shadow: 0 0 20px rgba(0, 243, 255, 0.4); }

    .candidates-list { padding: 1.5rem; margin-bottom: 2rem; }
    .list-title { font-family: 'Chakra Petch', monospace; color: #666; font-size: 0.8rem; margin-bottom: 1rem; }
    .list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .candidate-card {
        display: flex; align-items: center; gap: 1rem; padding: 0.8rem;
        background: rgba(255,255,255,0.05); border: 1px solid transparent; border-radius: 8px;
        cursor: pointer; transition: all 0.2s; text-align: left; width: 100%;
    }
    .candidate-card:hover { background: rgba(255,255,255,0.1); border-color: var(--cyber-yellow); }
    .mini-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
    .candidate-name { color: #fff; font-weight: bold; font-family: 'Chakra Petch', monospace; }

    .dossier-card { padding: 0; border: 1px solid rgba(255,255,255,0.1); }

    .corner { position: absolute; width: 15px; height: 15px; border-color: rgba(255,255,255,0.3); border-style: solid; }
    .tl { top: 0; left: 0; border-width: 2px 0 0 2px; border-radius: 20px 0 0 0; }
    .tr { top: 0; right: 0; border-width: 2px 2px 0 0; border-radius: 0 20px 0 0; }
    .bl { bottom: 0; left: 0; border-width: 0 0 2px 2px; border-radius: 0 0 0 20px; }
    .br { bottom: 0; right: 0; border-width: 0 2px 2px 0; border-radius: 0 0 20px 0; }

    .scan-line {
        position: absolute; top: 0; left: 0; width: 100%; height: 2px;
        background: linear-gradient(to right, transparent, var(--cyber-yellow), transparent);
        opacity: 0.3; animation: scan 3s linear infinite; pointer-events: none;
    }
    @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }

    .dossier-grid { display: flex; padding: 2.5rem; gap: 2.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); }

    .profile-visual { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
    .avatar-frame {
        width: 140px; height: 140px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.2); padding: 5px;
        box-shadow: 0 0 30px rgba(0,0,0,0.5);
    }
    .subject-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    .status-badge {
        background: rgba(57, 255, 20, 0.1); color: #39ff14; border: 1px solid #39ff14;
        padding: 2px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; letter-spacing: 0.1em;
    }
    .status-badge.banned {
        background: rgba(255, 0, 60, 0.2); color: #ff003c; border-color: #ff003c;
        box-shadow: 0 0 10px #ff003c;
    }
    .status-badge.active {
        background: rgba(57, 255, 20, 0.1); color: #39ff14; border-color: #39ff14;
    }

    .profile-data { flex-grow: 1; }
    .subject-name { font-size: 2.5rem; color: #fff; font-weight: 800; line-height: 1; margin-bottom: 1rem; text-transform: uppercase; }
    .meta-row { display: flex; gap: 1rem; font-size: 0.9rem; margin-bottom: 0.5rem; align-items: center; }
    .meta-label { color: #64748b; font-weight: bold; min-width: 60px; }
    .meta-value { color: #94a3b8; }

    .stats-row { display: flex; gap: 1rem; margin-top: 1.5rem; }
    .stat-pill {
        background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 12px;
        display: flex; flex-direction: column; min-width: 120px; border: 1px solid rgba(255,255,255,0.05);
    }
    .stat-pill .label { font-size: 0.65rem; color: #64748b; font-weight: bold; letter-spacing: 0.1em; margin-bottom: 2px; }
    .stat-pill .val { font-size: 1.2rem; font-family: 'Chakra Petch', monospace; font-weight: bold; }
    .stat-pill.yellow .val { color: var(--cyber-yellow); }
    .stat-pill.blue .val { color: #60a5fa; }

    .control-panel { padding: 2.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; background: rgba(0,0,0,0.2); }
    .section-title { font-size: 0.8rem; font-weight: bold; margin-bottom: 1rem; letter-spacing: 0.1em; opacity: 0.8; }
    .full-width { grid-column: 1 / -1; }

    .btn-grid { display: flex; gap: 0.5rem; }
    .cmd-btn {
        flex-grow: 1; padding: 0.75rem; border-radius: 8px; font-weight: bold; font-family: 'Chakra Petch', monospace;
        cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
        color: #fff; background: rgba(255,255,255,0.05);
    }
    .cmd-btn:hover { transform: translateY(-2px); }
    .cmd-btn:active { transform: translateY(1px); }

    .cmd-btn.green:hover { background: rgba(57, 255, 20, 0.1); border-color: #39ff14; color: #39ff14; box-shadow: 0 0 15px rgba(57, 255, 20, 0.2); }
    .cmd-btn.red:hover { background: rgba(255, 0, 60, 0.1); border-color: #ff003c; color: #ff003c; box-shadow: 0 0 15px rgba(255, 0, 60, 0.2); }
    .cmd-btn.purple:hover { background: rgba(189, 0, 255, 0.1); border-color: #bd00ff; color: #bd00ff; box-shadow: 0 0 15px rgba(189, 0, 255, 0.2); }

    .cmd-btn.outlined { border-color: rgba(255,255,255,0.1); background: transparent; }

    .ban-form { display: flex; gap: 1rem; }
    .reason-input {
        flex-grow: 1; background: rgba(0,0,0,0.3); border: 1px solid #333;
        padding: 0 1rem; color: #fff; border-radius: 8px; outline: none;
    }
    .reason-input:focus { border-color: #ff003c; }

    .migration-btn {
        background: rgba(255, 0, 60, 0.1);
        border: 1px solid #ff003c;
        color: #ff003c;
        padding: 0.5rem 1rem;
        font-family: 'Chakra Petch', monospace;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
    }
    .migration-btn:hover {
        background: #ff003c;
        color: black;
        box-shadow: 0 0 15px #ff003c;
    }

    .modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.8);
        z-index: 100; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(5px);
    }

    .migration-panel {
        width: 100%; max-width: 500px;
        padding: 2rem;
        border: 1px solid #ff003c;
        box-shadow: 0 0 30px rgba(255, 0, 60, 0.2);
    }

    .input-group { display: flex; flex-direction: column; gap: 0.5rem; }

    .cyber-input.red { border-color: #ff003c; }
    .cyber-input.green { border-color: #39ff14; }
    .cyber-input:focus { background: rgba(255,255,255,0.1); outline: none; }

    .icon-arrow { text-align: center; font-size: 1.5rem; margin: 0.5rem 0; }

    .cancel-btn {
        flex: 1; padding: 0.8rem; background: transparent; border: 1px solid #555; color: #aaa;
        font-weight: bold; cursor: pointer;
    }
    .confirm-btn {
        flex: 1; padding: 0.8rem; background: #ff003c; border: none; color: white;
        font-weight: bold; cursor: pointer; text-transform: uppercase;
        box-shadow: 0 0 15px rgba(255, 0, 60, 0.4);
    }
    .confirm-btn:hover { transform: scale(1.02); }

    @media (max-width: 768px) {
        .dossier-grid { flex-direction: column; text-align: center; }
        .profile-visual { width: 100%; }
        .meta-row { justify-content: center; }
        .stats-row { justify-content: center; }
        .control-panel { grid-template-columns: 1fr; }
        .ban-form { flex-direction: column; }
    }
</style>