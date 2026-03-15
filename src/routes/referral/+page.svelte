<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { t } from 'svelte-i18n';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { getAuth, onAuthStateChanged } from 'firebase/auth';
    import { getFirestore, doc, getDoc } from 'firebase/firestore';
    import { userStore } from '$lib/stores';

    const opacity = tweened(0, { duration: 500, easing: quintOut });

    // Пользователи зарегистрированные ДО этой даты не видят Welcome Bonus
    const PROGRAM_LAUNCH = new Date('2026-03-14T00:00:00.000Z');

    let user: any           = null;
    let loading             = true;
    let isNewUser           = false;
    let codeLoading         = false;
    let claimLoading        = false;

    let myCode: string | null = null;
    let totalReferred       = 0;
    let monthlyCount        = 0;
    let yourRank: number | null = null;
    let leaderboard: any[]  = [];
    let bonusAlreadyClaimed = false;
    let conditions          = { email: false, telegram: false, chat: false };

    let inputCode           = '';
    let claimResult: { success?: boolean; newUserEarned?: number; referrerEarned?: number; error?: string } | null = null;
    let copied              = false;
    let timeLeft            = '';
    let timerInterval: any;

    const functions               = getFunctions();
    const getOrCreateReferralCode = httpsCallable(functions, 'getOrCreateReferralCode');
    const claimReferralFn         = httpsCallable(functions, 'claimReferral');
    const getReferralStatus       = httpsCallable(functions, 'getReferralStatus');

    onMount(async () => {
        opacity.set(1);
        const auth = getAuth();
        onAuthStateChanged(auth, async (u) => {
            user = u;
            if (u) {
                try {
                    const db      = getFirestore();
                    const userDoc = await getDoc(doc(db, 'users', u.uid));
                    if (userDoc.exists()) {
                        const createdAt = userDoc.data().createdAt?.toDate?.() ?? null;
                        isNewUser = createdAt ? createdAt >= PROGRAM_LAUNCH : false;
                    }
                } catch (e) { console.error(e); }
                await loadStatus();
            }
            loading = false;
        });
        return () => clearInterval(timerInterval);
    });

    async function loadStatus() {
        try {
            const res = (await getReferralStatus()) as any;
            const d   = res.data;
            myCode              = d.code;
            totalReferred       = d.totalReferred      ?? 0;
            monthlyCount        = d.monthlyCount       ?? 0;
            yourRank            = d.yourRank;
            leaderboard         = d.leaderboard        ?? [];
            bonusAlreadyClaimed = d.bonusAlreadyClaimed ?? false;
            conditions          = d.conditions         ?? { email: false, telegram: false, chat: false };
            startTimer();
        } catch (e) { console.error(e); }
    }

    async function handleGetCode() {
        codeLoading = true;
        try {
            const res = (await getOrCreateReferralCode()) as any;
            const d   = res.data;
            myCode        = d.code;
            totalReferred = d.totalReferred;
            monthlyCount  = d.monthlyCount;
            yourRank      = d.yourRank;
            leaderboard   = d.leaderboard ?? [];
        } catch (e) { console.error(e); }
        finally { codeLoading = false; }
    }

    async function handleClaim() {
        if (!inputCode.trim()) return;
        claimLoading = true;
        claimResult  = null;
        try {
            const res = (await claimReferralFn({ code: inputCode.trim().toUpperCase() })) as any;
            claimResult = { success: true, newUserEarned: res.data.newUserEarned, referrerEarned: res.data.referrerEarned };
            bonusAlreadyClaimed = true;

            // Обновляем баланс в userStore без перезагрузки страницы
            const db      = getFirestore();
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists() && $userStore.user) {
                userStore.update(s => ({
                    ...s,
                    user: s.user ? { ...s.user, casino_credits: userDoc.data().casino_credits } : null
                }));
            }

            await loadStatus();
        } catch (e: any) {
            claimResult = { error: e?.message ?? 'Ошибка активации кода.' };
        } finally { claimLoading = false; }
    }

    function copyCode() {
        if (!myCode) return;
        navigator.clipboard.writeText(myCode);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    function startTimer() {
        clearInterval(timerInterval);
        const now = new Date();
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const tick = () => {
            const diff = end.getTime() - Date.now();
            if (diff <= 0) { timeLeft = '00:00:00'; return; }
            const d = Math.floor(diff / 86_400_000);
            const h = Math.floor((diff % 86_400_000) / 3_600_000);
            const m = Math.floor((diff % 3_600_000)  / 60_000);
            const s = Math.floor((diff % 60_000)      / 1_000);
            timeLeft = `${d}д ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        };
        tick();
        timerInterval = setInterval(tick, 1000);
    }

    const RANK_LABELS = ['👑', '⚡', '🔥'];
    const RANK_GLOWS  = ['rgba(252,238,10,0.35)', 'rgba(192,192,192,0.25)', 'rgba(205,127,50,0.25)'];

    $: showWelcomeBlock = isNewUser && !bonusAlreadyClaimed;
</script>

<svelte:head>
    <title>{$t('referral.page_title')} | ProtoMap</title>
</svelte:head>

<div class="page-wrap" style="opacity: {$opacity}">
    <div class="bg-blob blob-1"></div>
    <div class="bg-blob blob-2"></div>
    <div class="bg-blob blob-3"></div>

    <div class="content-wrap">

        <!-- ═══ ШАПКА ══════════════════════════════════════════════ -->
        <header class="page-header" in:fade={{ delay: 80, duration: 600 }}>
            <div class="header-tag">{$t('referral.header_tag')}</div>
            <h1 class="page-title glitch" data-text={$t('referral.title')}>{$t('referral.title')}</h1>
            <p class="page-sub">{$t('referral.subtitle')}</p>
            {#if timeLeft}
                <div class="timer-wrap" in:fade={{ delay: 300 }}>
                    <span class="timer-label">{$t('referral.timer_label')}</span>
                    <span class="timer-value font-display">{timeLeft}</span>
                </div>
            {/if}
        </header>

        <!-- ═══ КАРТОЧКИ НАГРАД ════════════════════════════════════ -->
        <section class="rewards-row" in:fade={{ delay: 180, duration: 500 }}>
            {#if showWelcomeBlock || (user && isNewUser)}
                <div class="reward-card rc-new">
                    <div class="rc-icon">🎁</div>
                    <div class="rc-amount">{$t('referral.reward_new_amount')}</div>
                    <div class="rc-label">{$t('referral.reward_new_label')}</div>
                </div>
                <div class="reward-sep">+</div>
            {/if}
            <div class="reward-card rc-invite">
                <div class="rc-icon">💎</div>
                <div class="rc-amount">{$t('referral.reward_invite_amount')}</div>
                <div class="rc-label">{$t('referral.reward_invite_label')}</div>
            </div>
            <div class="reward-sep">=</div>
            <div class="reward-card rc-winner">
                <div class="rc-icon">👑</div>
                <div class="rc-amount">{$t('referral.reward_winner_amount')}</div>
                <div class="rc-label">{$t('referral.reward_winner_label')}</div>
            </div>
        </section>

        <div class="main-grid">
            <!-- ═══ ЛЕВАЯ КОЛОНКА ══════════════════════════════════ -->
            <div class="left-col">

                {#if loading}
                    <div class="panel skeleton-panel" in:fade>
                        <div class="skel-line"></div>
                        <div class="skel-line short"></div>
                        <div class="skel-line"></div>
                    </div>

                {:else if !user}
                    <div class="panel" in:fade={{ delay: 280 }}>
                        <div class="panel-header"><span class="panel-tag">{$t('referral.login_tag')}</span></div>
                        <p class="muted-text">{$t('referral.login_text')}</p>
                        <a href="/login" class="btn-primary">{$t('referral.login_btn')}</a>
                    </div>

                {:else}
                    <!-- ── Welcome Bonus ──────────────────────────── -->
                    {#if showWelcomeBlock}
                        <div class="panel bonus-panel" in:fade={{ delay: 260, duration: 500 }}>
                            <div class="panel-header">
                                <span class="panel-tag">{$t('referral.welcome_tag')}</span>
                                <span class="badge-pc">{$t('referral.welcome_badge_pc')}</span>
                            </div>
                            <div class="bonus-bg-text" aria-hidden="true">500 PC</div>
                            <p class="bonus-desc">{@html $t('referral.welcome_desc')}</p>

                            <ul class="checklist">
                                <li class="check-item" class:check-done={conditions.email}>
                                    <span class="check-icon">{conditions.email ? '✓' : '○'}</span>
                                    <div class="check-content">
                                        <span class="check-title">{$t('referral.check_email')}</span>
                                        {#if !conditions.email}<span class="check-hint">{$t('referral.check_email_hint')}</span>{/if}
                                    </div>
                                </li>
                                <li class="check-item" class:check-done={conditions.telegram}>
                                    <span class="check-icon">{conditions.telegram ? '✓' : '○'}</span>
                                    <div class="check-content">
                                        <span class="check-title">{$t('referral.check_telegram')}</span>
                                        {#if !conditions.telegram}<span class="check-hint">{$t('referral.check_telegram_hint')}</span>{/if}
                                    </div>
                                </li>
                                <li class="check-item" class:check-done={conditions.chat}>
                                    <span class="check-icon">{conditions.chat ? '✓' : '○'}</span>
                                    <div class="check-content">
                                        <span class="check-title">{$t('referral.check_chat')}</span>
                                        <span class="check-hint">{$t('referral.check_chat_hint')}</span>
                                    </div>
                                </li>
                            </ul>

                            <div class="claim-row">
                                <input
                                    class="code-input"
                                    bind:value={inputCode}
                                    placeholder={$t('referral.code_placeholder')}
                                    maxlength="40"
                                    on:keydown={(e) => e.key === 'Enter' && handleClaim()}
                                />
                                <button class="btn-claim" on:click={handleClaim}
                                    disabled={claimLoading || !inputCode.trim()}>
                                    {claimLoading ? $t('referral.claim_loading') : $t('referral.claim_btn')}
                                </button>
                            </div>

                            {#if claimResult}
                                <div class="result-msg"
                                     class:result-ok={claimResult.success}
                                     class:result-err={claimResult.error}
                                     in:slide>
                                    {#if claimResult.success}
                                        {@html $t('referral.claim_success', { values: { earned: claimResult.newUserEarned, referrer: claimResult.referrerEarned } })}
                                    {:else}
                                        ⚠️ {claimResult.error}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- ── Бонус уже получен ──────────────────────── -->
                    {#if isNewUser && bonusAlreadyClaimed}
                        <div class="panel panel-success" in:fade={{ delay: 260 }}>
                            <div class="panel-header">
                                <span class="panel-tag">{$t('referral.welcome_tag')}</span>
                                <span class="badge-done">{$t('referral.welcome_badge_claimed')}</span>
                            </div>
                            <p class="muted-text">{$t('referral.welcome_claimed')}</p>
                        </div>
                    {/if}

                    <!-- ── Мой код ─────────────────────────────────── -->
                    <div class="panel" in:fade={{ delay: 320, duration: 500 }}>
                        <div class="panel-header">
                            <span class="panel-tag">{$t('referral.your_code_tag')}</span>
                            {#if myCode}
                                <div class="stats-mini font-display">
                                    <span class="stat-hi">{monthlyCount}</span>
                                    <span class="stat-lo">{$t('referral.stat_this_month')}</span>
                                    <span class="stat-dot">·</span>
                                    <span class="stat-hi">{totalReferred}</span>
                                    <span class="stat-lo">{$t('referral.stat_total')}</span>
                                    {#if yourRank}
                                        <span class="stat-dot">·</span>
                                        <span class="stat-hi stat-rank">#{yourRank}</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        {#if myCode}
                            <div class="code-box">
                                <span class="code-text font-display">{myCode}</span>
                                <button class="copy-btn" on:click={copyCode}>
                                    {#if copied}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                        <span>{$t('referral.copied')}</span>
                                    {:else}
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        <span>{$t('referral.copy')}</span>
                                    {/if}
                                </button>
                            </div>
                            <p class="share-hint">{@html $t('referral.share_hint')}</p>
                        {:else}
                            <p class="muted-text">{$t('referral.no_code_text')}</p>
                            <button class="btn-primary" on:click={handleGetCode} disabled={codeLoading}>
                                {codeLoading ? $t('referral.generating') : $t('referral.get_code_btn')}
                            </button>
                        {/if}
                    </div>
                {/if}

                <!-- ── Правила ──────────────────────────────────────── -->
                <div class="panel" in:fade={{ delay: 440, duration: 500 }}>
                    <div class="panel-header"><span class="panel-tag">{$t('referral.rules_tag')}</span></div>
                    <p class="muted-text" style="margin-bottom:1.25rem">{$t('referral.rules_intro')}</p>
                    <ol class="rules-list">
                        <li>
                            <span class="rule-n">01</span>
                            <div><strong>{$t('referral.rule_1_title')}</strong><span>{$t('referral.rule_1_desc')}</span></div>
                        </li>
                        <li>
                            <span class="rule-n">02</span>
                            <div><strong>{$t('referral.rule_2_title')}</strong><span>{$t('referral.rule_2_desc')}</span></div>
                        </li>
                        <li>
                            <span class="rule-n">03</span>
                            <div>
                                <strong>{$t('referral.rule_3_title')}</strong>
                                <span>{$t('referral.rule_3_desc')}</span>
                            </div>
                        </li>
                    </ol>
                    <p class="rules-note">{$t('referral.rules_note')}</p>
                </div>
            </div>

            <!-- ═══ ПРАВАЯ КОЛОНКА ════════════════════════════════ -->
            <div class="right-col">

                <!-- Лидерборд -->
                <div class="panel" in:fade={{ delay: 300, duration: 500 }}>
                    <div class="panel-header">
                        <span class="panel-tag">{$t('referral.leaderboard_tag')}</span>
                        <span class="month-badge">
                            {new Date().toLocaleString('ru', { month: 'long', year: 'numeric' }).toUpperCase()}
                        </span>
                    </div>

                    {#if leaderboard.length === 0}
                        <div class="lb-empty">
                            <span>📡</span>
                            <span>{$t('referral.leaderboard_empty')}</span>
                        </div>
                    {:else}
                        <ol class="lb-list">
                            {#each leaderboard as entry, i}
                                <li class="lb-row"
                                    class:lb-gold={i===0} class:lb-silver={i===1} class:lb-bronze={i===2}
                                    class:lb-me={entry.uid === user?.uid}
                                    style="--glow:{RANK_GLOWS[i] ?? 'transparent'}"
                                    in:slide={{ delay: 60 * i, duration: 280 }}>
                                    <span class="lb-rank">{i < 3 ? RANK_LABELS[i] : `#${i+1}`}</span>
                                    <a href="/profile/{entry.username}" class="lb-name">
                                        {entry.username}
                                        {#if entry.uid === user?.uid}<span class="you-tag">{$t('referral.leaderboard_you')}</span>{/if}
                                    </a>
                                    <span class="lb-refs font-display">{entry.monthlyCount}<span class="lb-unit">ref</span></span>
                                    <span class="lb-pc font-display">+{(entry.monthlyCount * 250).toLocaleString()} PC</span>
                                </li>
                            {/each}
                        </ol>
                    {/if}

                    <div class="lb-footer">
                        <span>{$t('referral.leaderboard_prize_label')}</span>
                        <span class="lb-prize font-display">{$t('referral.leaderboard_prize')}</span>
                    </div>
                </div>

                <!-- Инструкция -->
                <div class="panel" in:fade={{ delay: 420, duration: 500 }}>
                    <div class="panel-header"><span class="panel-tag">{$t('referral.howto_tag')}</span></div>
                    <div class="howto">
                        <div class="ht-step"><span class="ht-n">01</span><span>{$t('referral.howto_1')}</span></div>
                        <div class="ht-arrow">↓</div>
                        <div class="ht-step"><span class="ht-n">02</span><span>{$t('referral.howto_2')}</span></div>
                        <div class="ht-arrow">↓</div>
                        <div class="ht-step"><span class="ht-n">03</span><span>{@html $t('referral.howto_3')}</span></div>
                        <div class="ht-arrow">↓</div>
                        <div class="ht-step ht-step--win"><span class="ht-n">04</span><span>{@html $t('referral.howto_4')}</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    :root { --cy:#fcee0a; --cc:#00f0ff; --cr:#ff003c; --cp:#bd00ff; }
    .page-wrap { min-height:100vh;background:#060609;position:relative;overflow:hidden;padding:2rem 1rem 5rem; }
    .bg-blob { position:absolute;border-radius:50%;filter:blur(130px);pointer-events:none;opacity:0.15; }
    .blob-1 { width:600px;height:600px;background:var(--cp);top:-10%;left:-15%;animation:d1 22s ease-in-out infinite; }
    .blob-2 { width:500px;height:500px;background:var(--cy);bottom:5%;right:-10%;animation:d2 28s ease-in-out infinite; }
    .blob-3 { width:350px;height:350px;background:var(--cc);top:40%;left:50%;animation:d3 18s ease-in-out infinite; }
    @keyframes d1{0%,100%{transform:translate(0,0)}50%{transform:translate(70px,50px)}}
    @keyframes d2{0%,100%{transform:translate(0,0)}50%{transform:translate(-50px,-70px)}}
    @keyframes d3{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-45%,-55%)}}
    .content-wrap{position:relative;z-index:1;max-width:1100px;margin:0 auto;}
    .page-header{text-align:center;margin-bottom:2.5rem;}
    .header-tag{font-family:'Chakra Petch',monospace;font-size:.7rem;color:var(--cc);letter-spacing:.3em;opacity:.65;margin-bottom:.6rem;}
    .page-title{font-family:'Chakra Petch',monospace;font-size:clamp(2rem,6vw,3.8rem);font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.08em;line-height:1;margin-bottom:.6rem;position:relative;display:inline-block;}
    .glitch::before,.glitch::after{content:attr(data-text);position:absolute;top:0;left:0;width:100%;height:100%;}
    .glitch::before{left:2px;text-shadow:-2px 0 var(--cr);animation:g1 3s infinite linear alternate-reverse;clip-path:polygon(0 20%,100% 20%,100% 40%,0 40%);}
    .glitch::after{left:-2px;text-shadow:2px 0 var(--cc);animation:g2 4s infinite linear alternate-reverse;clip-path:polygon(0 60%,100% 60%,100% 80%,0 80%);}
    @keyframes g1{0%{clip-path:polygon(0 20%,100% 20%,100% 40%,0 40%)}100%{clip-path:polygon(0 55%,100% 55%,100% 75%,0 75%)}}
    @keyframes g2{0%{clip-path:polygon(0 60%,100% 60%,100% 80%,0 80%)}100%{clip-path:polygon(0 10%,100% 10%,100% 30%,0 30%)}}
    .page-sub{color:#64748b;font-size:.95rem;font-family:'Chakra Petch',monospace;letter-spacing:.04em;}
    .timer-wrap{display:inline-flex;align-items:center;gap:.75rem;margin-top:1.2rem;background:rgba(252,238,10,.06);border:1px solid rgba(252,238,10,.28);border-radius:3px;padding:.45rem 1.2rem;}
    .timer-label{font-family:'Chakra Petch',monospace;font-size:.65rem;color:var(--cy);opacity:.65;letter-spacing:.2em;}
    .timer-value{font-size:1.05rem;color:var(--cy);text-shadow:0 0 10px rgba(252,238,10,.55);letter-spacing:.1em;}
    .rewards-row{display:flex;align-items:center;justify-content:center;gap:1.25rem;margin-bottom:2.5rem;flex-wrap:wrap;}
    .reward-card{text-align:center;padding:1.1rem 1.75rem;border:1px solid rgba(255,255,255,.08);border-radius:3px;background:rgba(255,255,255,.025);clip-path:polygon(0 12px,12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%);transition:border-color .3s,box-shadow .3s;}
    .rc-new{border-color:rgba(0,240,255,.2);}.rc-invite{border-color:rgba(0,240,255,.15);}.rc-winner{border-color:rgba(252,238,10,.3);box-shadow:0 0 18px rgba(252,238,10,.07);}
    .rc-new:hover{border-color:rgba(0,240,255,.4);box-shadow:0 0 18px rgba(0,240,255,.1);}
    .rc-invite:hover{border-color:rgba(0,240,255,.35);}
    .rc-winner:hover{border-color:rgba(252,238,10,.55);box-shadow:0 0 25px rgba(252,238,10,.14);}
    .rc-icon{font-size:1.6rem;margin-bottom:.2rem;}.rc-amount{font-family:'Chakra Petch',monospace;font-size:1.6rem;font-weight:900;}
    .rc-new .rc-amount,.rc-invite .rc-amount{color:var(--cc);text-shadow:0 0 14px rgba(0,240,255,.38);}
    .rc-winner .rc-amount{color:var(--cy);text-shadow:0 0 14px rgba(252,238,10,.45);}
    .rc-label{font-size:.75rem;color:#64748b;margin-top:.2rem;letter-spacing:.04em;}
    .reward-sep{font-size:1.8rem;color:#1e293b;font-weight:900;}
    .main-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start;}
    @media(max-width:768px){.main-grid{grid-template-columns:1fr;}}
    .panel{background:rgba(9,11,17,.88);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.07);border-radius:2px;clip-path:polygon(0 16px,16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%);padding:1.4rem;margin-bottom:1.2rem;}
    .panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;padding-bottom:.7rem;border-bottom:1px solid rgba(255,255,255,.055);flex-wrap:wrap;gap:.5rem;}
    .panel-tag{font-family:'Chakra Petch',monospace;font-size:.68rem;color:var(--cy);letter-spacing:.2em;opacity:.8;}
    .bonus-panel{border-color:rgba(0,240,255,.18);position:relative;overflow:hidden;}
    .bonus-bg-text{position:absolute;top:50%;right:-1rem;transform:translateY(-50%);font-family:'Chakra Petch',monospace;font-size:5rem;font-weight:900;color:rgba(0,240,255,.04);pointer-events:none;user-select:none;white-space:nowrap;letter-spacing:.05em;}
    .panel-success{border-color:rgba(74,222,128,.15);background:rgba(74,222,128,.025);}
    .badge-done{font-family:'Chakra Petch',monospace;font-size:.65rem;color:#4ade80;border:1px solid rgba(74,222,128,.3);padding:.15rem .5rem;border-radius:2px;letter-spacing:.1em;}
    .badge-pc{font-family:'Chakra Petch',monospace;font-size:.7rem;color:var(--cc);border:1px solid rgba(0,240,255,.3);padding:.15rem .5rem;border-radius:2px;letter-spacing:.1em;}
    .bonus-desc{font-size:.85rem;color:#64748b;line-height:1.65;margin-bottom:1.25rem;position:relative;z-index:1;}
    .bonus-desc :global(strong){color:var(--cy);}
    .checklist{list-style:none;padding:0;display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.25rem;position:relative;z-index:1;}
    .check-item{display:flex;align-items:flex-start;gap:.85rem;padding:.6rem .75rem;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:2px;transition:border-color .25s;}
    .check-item.check-done{border-color:rgba(74,222,128,.2);background:rgba(74,222,128,.03);}
    .check-icon{font-family:'Chakra Petch',monospace;font-size:.88rem;flex-shrink:0;width:1.1rem;text-align:center;color:#334155;margin-top:.05rem;}
    .check-item.check-done .check-icon{color:#4ade80;}
    .check-content{display:flex;flex-direction:column;gap:.12rem;}
    .check-title{font-size:.84rem;color:#cbd5e1;}.check-item.check-done .check-title{color:#4ade80;}
    .check-hint{font-size:.73rem;color:#475569;line-height:1.45;}
    .claim-row{display:flex;gap:.5rem;position:relative;z-index:1;}
    .code-input{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#fff;font-family:'Chakra Petch',monospace;font-size:.88rem;padding:.58rem .7rem;letter-spacing:.07em;outline:none;transition:border-color .2s;}
    .code-input:focus{border-color:var(--cc);}.code-input::placeholder{color:#334155;}
    .btn-claim{background:rgba(0,240,255,.08);border:1px solid rgba(0,240,255,.35);color:var(--cc);font-family:'Chakra Petch',monospace;font-size:.82rem;letter-spacing:.15em;padding:0 1.1rem;cursor:pointer;transition:all .2s;}
    .btn-claim:hover:not(:disabled){background:rgba(0,240,255,.18);box-shadow:0 0 10px rgba(0,240,255,.18);}
    .btn-claim:disabled{opacity:.35;cursor:not-allowed;}
    .result-msg{margin-top:.7rem;padding:.55rem .7rem;font-size:.8rem;border-radius:2px;font-family:'Chakra Petch',monospace;letter-spacing:.03em;position:relative;z-index:1;}
    .result-ok{background:rgba(0,255,100,.06);border:1px solid rgba(0,255,100,.22);color:#4ade80;}
    .result-err{background:rgba(255,0,60,.06);border:1px solid rgba(255,0,60,.22);color:#f87171;}
    .stats-mini{display:flex;align-items:center;gap:.4rem;font-size:.78rem;}
    .stat-hi{color:#e2e8f0;}.stat-lo{color:#475569;font-size:.63rem;}.stat-dot{color:#1e293b;}.stat-rank{color:var(--cy);}
    .code-box{display:flex;align-items:center;gap:.7rem;background:rgba(0,240,255,.04);border:1px solid rgba(0,240,255,.22);border-radius:3px;padding:.7rem 1rem;margin-bottom:1.1rem;}
    .code-text{flex:1;font-size:1.1rem;color:var(--cc);letter-spacing:.12em;text-shadow:0 0 10px rgba(0,240,255,.38);}
    .copy-btn{display:flex;align-items:center;gap:.35rem;background:transparent;border:1px solid rgba(0,240,255,.28);color:var(--cc);padding:.3rem .7rem;border-radius:2px;cursor:pointer;font-family:'Chakra Petch',monospace;font-size:.65rem;letter-spacing:.1em;transition:all .2s;white-space:nowrap;}
    .copy-btn svg{width:13px;height:13px;}.copy-btn:hover{background:rgba(0,240,255,.1);box-shadow:0 0 8px rgba(0,240,255,.18);}
    .share-hint{font-size:.8rem;color:#475569;line-height:1.6;border-left:2px solid rgba(252,238,10,.25);padding-left:.7rem;}
    .share-hint :global(strong){color:var(--cy);}
    .rules-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:.9rem;}
    .rules-list li{display:flex;align-items:flex-start;gap:.9rem;}
    .rule-n{font-family:'Chakra Petch',monospace;font-size:1.4rem;font-weight:900;color:rgba(252,238,10,.22);line-height:1;flex-shrink:0;width:2rem;}
    .rules-list strong{display:block;color:#e2e8f0;font-size:.88rem;margin-bottom:.15rem;}
    .rules-list span{display:block;color:#64748b;font-size:.78rem;line-height:1.5;}
    .rules-note{margin-top:1.1rem;padding-top:.9rem;border-top:1px solid rgba(255,255,255,.055);font-size:.75rem;color:#475569;}
    .month-badge{font-family:'Chakra Petch',monospace;font-size:.62rem;color:#64748b;letter-spacing:.1em;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);padding:.18rem .45rem;border-radius:2px;}
    .lb-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:.35rem;}
    .lb-row{display:grid;grid-template-columns:2.2rem 1fr auto auto;align-items:center;gap:.65rem;padding:.55rem .7rem;border:1px solid transparent;border-radius:2px;background:rgba(255,255,255,.018);transition:all .2s;}
    .lb-row:hover{background:rgba(255,255,255,.04);box-shadow:0 0 10px var(--glow,transparent);}
    .lb-gold{border-color:rgba(252,238,10,.2)!important;background:rgba(252,238,10,.035)!important;}
    .lb-silver{border-color:rgba(192,192,192,.14)!important;}
    .lb-bronze{border-color:rgba(205,127,50,.14)!important;}
    .lb-me{border-color:rgba(0,240,255,.22)!important;background:rgba(0,240,255,.035)!important;}
    .lb-rank{font-size:1rem;text-align:center;}
    .lb-name{color:#e2e8f0;font-size:.88rem;text-decoration:none;display:flex;align-items:center;gap:.35rem;transition:color .2s;}
    .lb-name:hover{color:var(--cy);}
    .you-tag{font-family:'Chakra Petch',monospace;font-size:.58rem;color:var(--cc);border:1px solid var(--cc);padding:.08rem .28rem;letter-spacing:.1em;}
    .lb-refs{font-size:.8rem;color:#94a3b8;}.lb-unit{font-size:.6rem;color:#475569;}.lb-pc{font-size:.75rem;color:rgba(252,238,10,.65);}
    .lb-empty{display:flex;flex-direction:column;align-items:center;gap:.65rem;padding:2.5rem 0;color:#334155;font-family:'Chakra Petch',monospace;font-size:.82rem;letter-spacing:.1em;}
    .lb-footer{display:flex;flex-direction:column;align-items:center;gap:.25rem;margin-top:1.1rem;padding-top:.9rem;border-top:1px solid rgba(255,255,255,.055);font-size:.75rem;color:#475569;text-align:center;}
    .lb-prize{font-size:1.05rem;color:var(--cy);text-shadow:0 0 10px rgba(252,238,10,.38);}
    .howto{display:flex;flex-direction:column;gap:.2rem;}
    .ht-step{display:flex;align-items:flex-start;gap:.9rem;padding:.7rem .75rem;background:rgba(255,255,255,.018);border-left:2px solid rgba(252,238,10,.18);}
    .ht-step--win{border-left-color:rgba(252,238,10,.45);background:rgba(252,238,10,.03);}
    .ht-n{font-family:'Chakra Petch',monospace;font-size:1.15rem;font-weight:900;color:rgba(252,238,10,.28);flex-shrink:0;line-height:1.3;}
    .ht-step span:last-child{font-size:.82rem;color:#64748b;line-height:1.65;}
    .ht-step :global(strong){color:var(--cy);}
    .ht-arrow{text-align:center;color:#1e293b;font-size:.9rem;padding:.05rem 0;}
    .muted-text{font-size:.85rem;color:#64748b;line-height:1.55;}
    .btn-primary{display:inline-flex;align-items:center;gap:.5rem;font-family:'Chakra Petch',monospace;font-size:.82rem;letter-spacing:.14em;color:#000;background:var(--cy);border:none;padding:.62rem 1.6rem;cursor:pointer;clip-path:polygon(0 8px,8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);transition:box-shadow .2s,opacity .2s;text-decoration:none;}
    .btn-primary:hover:not(:disabled){box-shadow:0 0 18px rgba(252,238,10,.38);}
    .btn-primary:disabled{opacity:.45;cursor:not-allowed;}
    .skeleton-panel{min-height:130px;display:flex;flex-direction:column;gap:1rem;justify-content:center;}
    .skel-line{height:11px;background:rgba(255,255,255,.045);border-radius:2px;animation:sk 1.5s ease-in-out infinite;}
    .skel-line.short{width:55%;}
    @keyframes sk{0%,100%{opacity:.35}50%{opacity:.7}}
    .font-display{font-family:'Chakra Petch',monospace;}
</style>