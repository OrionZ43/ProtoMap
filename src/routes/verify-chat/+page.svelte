<!-- src/routes/verify-chat/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { fade } from 'svelte/transition';
    import { tweened } from 'svelte/motion';
    import { quintOut } from 'svelte/easing';

    const opacity = tweened(0, { duration: 400, easing: quintOut });

    // Параметры из URL: ?tgId=...&sig=...
    let tgId = '';
    let sig  = '';

    let state: 'idle' | 'loading' | 'success' | 'error' = 'idle';
    let errorMsg = '';

    let container: HTMLDivElement;
    let widgetId: string | null = null;

    const TURNSTILE_SITE_KEY = '0x4AAAAAACYHm8usBkEdoF37';

    onMount(() => {
        opacity.set(1);

        tgId = $page.url.searchParams.get('tgId') ?? '';
        sig  = $page.url.searchParams.get('sig')  ?? '';

        if (!tgId || !sig) {
            state    = 'error';
            errorMsg = 'Некорректная ссылка. Попробуй снова через бота.';
            return;
        }

        loadTurnstile();
    });

    function loadTurnstile() {
        if ((window as any).turnstile) {
            renderWidget();
            return;
        }
        const script   = document.createElement('script');
        script.src     = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async   = true;
        script.defer   = true;
        script.onload  = () => renderWidget();
        script.onerror = () => {
            state    = 'error';
            errorMsg = 'Не удалось загрузить проверку Cloudflare. Обнови страницу.';
        };
        document.head.appendChild(script);
    }

    function renderWidget() {
        if (!container || !(window as any).turnstile) return;
        widgetId = (window as any).turnstile.render(container, {
            sitekey:   TURNSTILE_SITE_KEY,
            theme:     'dark',
            callback:  onVerified,
            'error-callback': onTurnstileError,
            'expired-callback': () => {
                state    = 'idle';
                errorMsg = '';
            },
        });
    }

    async function onVerified(token: string) {
        state = 'loading';
        try {
            const res = await fetch('/api/verify-chat', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ tgId, sig, token }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error ?? 'Ошибка верификации.');
            }
            state = 'success';
        } catch (e: any) {
            state    = 'error';
            errorMsg = e.message ?? 'Ошибка сервера. Попробуй снова.';
            // Сбрасываем виджет чтобы можно было попробовать снова
            if (widgetId && (window as any).turnstile) {
                (window as any).turnstile.reset(widgetId);
            }
        }
    }

    function onTurnstileError() {
        state    = 'error';
        errorMsg = 'Ошибка Cloudflare Turnstile. Обнови страницу.';
    }
</script>

<svelte:head>
    <title>// ВЕРИФИКАЦИЯ | ProtoMap</title>
</svelte:head>

<div class="page-wrap" style="opacity: {$opacity}">
    <div class="bg-blob blob-1"></div>
    <div class="bg-blob blob-2"></div>

    <div class="card" in:fade={{ delay: 100, duration: 500 }}>

        <!-- Логотип / иконка -->
        <div class="card-icon">
            {#if state === 'success'}
                <span class="icon-ok">✓</span>
            {:else if state === 'error'}
                <span class="icon-err">✕</span>
            {:else}
                <span class="icon-shield">🛡</span>
            {/if}
        </div>

        <div class="card-header-tag">// PERIMETER CHECK</div>

        {#if state === 'idle' || state === 'loading'}
            <h1 class="card-title">ВЕРИФИКАЦИЯ</h1>
            <p class="card-desc">
                Пройди проверку Cloudflare — это займёт секунду.<br>
                После этого ты получишь полный доступ к чату <strong>@proto_map</strong>.
            </p>

            <!-- Turnstile виджет -->
            <div class="turnstile-wrap" class:loading={state === 'loading'}>
                <div bind:this={container} class="turnstile-inner"></div>
                {#if state === 'loading'}
                    <div class="turnstile-overlay" in:fade={{ duration: 200 }}>
                        <div class="spinner"></div>
                        <span>Проверяем...</span>
                    </div>
                {/if}
            </div>

        {:else if state === 'success'}
            <h1 class="card-title title-ok">ДОСТУП ОТКРЫТ</h1>
            <p class="card-desc">
                Верификация пройдена. Ты подтверждён как живой участник. 🎉<br><br>
                Вернись в чат <strong>@proto_map</strong> — бот уже разблокировал тебя.
            </p>
            <a href="https://t.me/proto_map" target="_blank" rel="noopener" class="btn-back">
                ← ВЕРНУТЬСЯ В ЧАТ
            </a>

        {:else if state === 'error'}
            <h1 class="card-title title-err">ОШИБКА</h1>
            <p class="card-desc err-text">{errorMsg}</p>
            <button class="btn-retry" on:click={() => { state = 'idle'; loadTurnstile(); }}>
                ПОПРОБОВАТЬ СНОВА
            </button>
        {/if}

        <div class="card-footer">
            Защищено <span class="cf-badge">Cloudflare Turnstile</span> · ProtoMap Anti-Raid System
        </div>
    </div>
</div>

<style>
    :root { --cy:#fcee0a; --cc:#00f0ff; --cr:#ff003c; --cp:#bd00ff; }

    .page-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #060609;
        position: relative;
        overflow: hidden;
        padding: 1rem;
    }

    /* Фоновые блобы */
    .bg-blob { position:absolute;border-radius:50%;filter:blur(140px);pointer-events:none; }
    .blob-1 { width:500px;height:500px;background:var(--cp);opacity:.12;top:-15%;left:-15%;animation:d1 20s ease-in-out infinite; }
    .blob-2 { width:400px;height:400px;background:var(--cc);opacity:.1;bottom:-10%;right:-10%;animation:d2 25s ease-in-out infinite; }
    @keyframes d1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(60px,40px)} }
    @keyframes d2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-40px,-60px)} }

    /* Карточка */
    .card {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 420px;
        background: rgba(9, 11, 17, 0.92);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,.09);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
        padding: 2.5rem 2rem 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
    }

    /* Иконка */
    .card-icon {
        width: 4rem;
        height: 4rem;
        border-radius: 50%;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        margin-bottom: 1.25rem;
    }
    .icon-ok  { color: #4ade80; }
    .icon-err { color: var(--cr); }
    .icon-shield { filter: grayscale(0.3); }

    .card-header-tag {
        font-family: 'Chakra Petch', monospace;
        font-size: .65rem;
        color: var(--cc);
        letter-spacing: .3em;
        opacity: .6;
        margin-bottom: .6rem;
    }

    .card-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.6rem;
        font-weight: 900;
        color: #fff;
        text-align: center;
        margin: 0 0 1rem;
        letter-spacing: .08em;
        text-transform: uppercase;
    }
    .title-ok  { color: #4ade80; text-shadow: 0 0 20px rgba(74,222,128,.4); }
    .title-err { color: var(--cr); text-shadow: 0 0 20px rgba(255,0,60,.4); }

    .card-desc {
        font-size: .88rem;
        color: #64748b;
        text-align: center;
        line-height: 1.65;
        margin: 0 0 1.75rem;
    }
    .card-desc strong { color: #e2e8f0; }
    .err-text { color: #f87171; }

    /* Turnstile */
    .turnstile-wrap {
        position: relative;
        display: flex;
        justify-content: center;
        margin-bottom: 1.5rem;
        min-height: 65px;
    }
    .turnstile-overlay {
        position: absolute;
        inset: 0;
        background: rgba(9,11,17,.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: .5rem;
        font-family: 'Chakra Petch', monospace;
        font-size: .75rem;
        color: var(--cc);
        letter-spacing: .1em;
        border-radius: 4px;
    }
    .spinner {
        width: 22px; height: 22px;
        border: 2px solid rgba(0,240,255,.2);
        border-top-color: var(--cc);
        border-radius: 50%;
        animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Кнопки */
    .btn-back, .btn-retry {
        font-family: 'Chakra Petch', monospace;
        font-size: .8rem;
        letter-spacing: .14em;
        padding: .65rem 1.75rem;
        cursor: pointer;
        text-decoration: none;
        clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
        transition: box-shadow .2s;
        display: inline-block;
        margin-bottom: 1.5rem;
    }
    .btn-back {
        background: #4ade80;
        color: #000;
        border: none;
    }
    .btn-back:hover { box-shadow: 0 0 18px rgba(74,222,128,.4); }

    .btn-retry {
        background: transparent;
        color: var(--cy);
        border: 1px solid rgba(252,238,10,.35);
    }
    .btn-retry:hover { background: rgba(252,238,10,.08); box-shadow: 0 0 14px rgba(252,238,10,.2); }

    /* Футер */
    .card-footer {
        font-size: .68rem;
        color: #1e293b;
        text-align: center;
        margin-top: .5rem;
        letter-spacing: .04em;
    }
    .cf-badge {
        color: #334155;
        font-weight: 600;
    }

    @media (max-width: 460px) {
        .card { padding: 2rem 1.25rem 1.5rem; }
        .card-title { font-size: 1.35rem; }
    }
</style>