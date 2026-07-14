<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, scale, fly } from 'svelte/transition';
    import { elasticOut, quintOut } from 'svelte/easing';
    import { t } from 'svelte-i18n';

    // Новый ключ — сбрасывает просмотры у всех, кто видел старый (сломанный) баннер
    const STORAGE_KEY = 'protomap_app_release_v2';

    let isVisible = false;
    let step: 'idle' | 'in' | 'visible' = 'idle';

    onMount(() => {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (!seen) {
            setTimeout(() => {
                isVisible = true;
                step = 'in';
                setTimeout(() => step = 'visible', 600);
            }, 800);
        }
    });

    function closeModal() {
        isVisible = false;
        localStorage.setItem(STORAGE_KEY, 'true');
    }

    function goToPage() {
        closeModal();
        window.location.href = '/mobile-beta';
    }
</script>

{#if isVisible}
    <!-- Оверлей -->
    <div
        class="overlay"
        transition:fade={{ duration: 350 }}
        on:click|self={closeModal}
    >
        <!-- Карточка -->
        <div
            class="card"
            transition:scale={{ duration: 500, start: 0.88, easing: elasticOut }}
        >
            <!-- Декоративные угловые линии -->
            <div class="corner-line tl"></div>
            <div class="corner-line tr"></div>
            <div class="corner-line bl"></div>
            <div class="corner-line br"></div>

            <!-- Верхняя полоска с тегом -->
            <div class="tag-bar">
                <span class="tag-dot"></span>
                <span class="tag-text">NETWORK · ONLINE</span>
                <span class="tag-dot"></span>
            </div>

            <!-- Иконка + телефон -->
            {#if step === 'visible'}
                <div class="hero-row" in:fly={{ y: 16, duration: 500, delay: 50, easing: quintOut }}>
                    <!-- Телефончик из emoji + логотип -->
                    <div class="icon-phone">
                        <span class="phone-emoji">📱</span>
                        <div class="icon-badge">
                            <img
                                src="/mobile/protogen_pin.svg"
                                alt="ProtoMap"
                                class="badge-logo"
                            />
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Заголовок -->
            {#if step === 'visible'}
                <div in:fly={{ y: 12, duration: 450, delay: 100, easing: quintOut }}>
                    <h2 class="title">{$t('splash_beta.title')}</h2>
                </div>
            {/if}

            <!-- Текст -->
            {#if step === 'visible'}
                <div in:fly={{ y: 10, duration: 400, delay: 180, easing: quintOut }}>
                    <p class="body-text">
                        {@html $t('splash_beta.text')}
                    </p>
                </div>
            {/if}

            <!-- CTA кнопка -->
            {#if step === 'visible'}
                <div
                    class="actions"
                    in:fly={{ y: 8, duration: 380, delay: 260, easing: quintOut }}
                >
                    <button class="btn-primary" on:click={goToPage}>
                        <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor">
                            <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
                        </svg>
                        {$t('splash_beta.btn')}
                    </button>

                    <button class="btn-ghost" on:click={closeModal}>
                        {$t('splash_beta.dismiss')}
                    </button>
                </div>
            {/if}

            <!-- Нижняя строчка-статус -->
            <div class="status-bar">
                <span class="status-dot"></span>
                <span>APP LIVE ON GOOGLE PLAY</span>
            </div>
        </div>
    </div>
{/if}

<style>
    /* ── Оверлей ──────────────────────────────────────────────────── */
    .overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(0,0,0,0.75);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
    }

    /* ── Карточка ─────────────────────────────────────────────────── */
    .card {
        position: relative;
        width: 100%;
        max-width: 420px;
        background: rgba(6, 14, 10, 0.96);
        border: 1px solid rgba(57,255,20,0.25);
        box-shadow:
            0 0 0 1px rgba(57,255,20,0.08),
            0 0 40px rgba(57,255,20,0.08),
            0 30px 80px rgba(0,0,0,0.6);
        border-radius: 2px;
        padding: 1.75rem 1.75rem 1.25rem;
        overflow: hidden;
        /* Анимированная обводка */
        animation: card-glow 3s ease-in-out infinite;
    }

    @keyframes card-glow {
        0%,100% { box-shadow: 0 0 0 1px rgba(57,255,20,0.08), 0 0 30px rgba(57,255,20,0.06), 0 30px 80px rgba(0,0,0,0.6); }
        50%      { box-shadow: 0 0 0 1px rgba(57,255,20,0.18), 0 0 55px rgba(57,255,20,0.12), 0 30px 80px rgba(0,0,0,0.6); }
    }

    /* Угловые акценты */
    .corner-line {
        position: absolute;
        width: 14px; height: 14px;
        border-color: #39ff14;
    }
    .tl { top: 4px; left: 4px;   border-top: 1.5px solid; border-left: 1.5px solid; }
    .tr { top: 4px; right: 4px;  border-top: 1.5px solid; border-right: 1.5px solid; }
    .bl { bottom: 4px; left: 4px;  border-bottom: 1.5px solid; border-left: 1.5px solid; }
    .br { bottom: 4px; right: 4px; border-bottom: 1.5px solid; border-right: 1.5px solid; }

    /* ── Тег-бар ──────────────────────────────────────────────────── */
    .tag-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        margin-bottom: 1.5rem;
        font-family: 'Chakra Petch', monospace;
        font-size: 0.58rem;
        letter-spacing: 0.25em;
        color: rgba(57,255,20,0.6);
        text-transform: uppercase;
    }

    .tag-dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: #39ff14;
        box-shadow: 0 0 6px #39ff14;
        animation: dot-blink 2s ease-in-out infinite;
    }
    @keyframes dot-blink {
        0%,100% { opacity: 1; }
        50%      { opacity: 0.3; }
    }

    /* ── Герой ────────────────────────────────────────────────────── */
    .hero-row {
        display: flex;
        justify-content: center;
        margin-bottom: 1.25rem;
    }

    .icon-phone {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-emoji {
        font-size: 4rem;
        filter: drop-shadow(0 4px 16px rgba(57,255,20,0.3));
        animation: phone-float 3s ease-in-out infinite;
    }

    @keyframes phone-float {
        0%,100% { transform: translateY(0) rotate(-3deg); }
        50%      { transform: translateY(-6px) rotate(3deg); }
    }

    .icon-badge {
        position: absolute;
        top: -6px;
        right: -10px;
        width: 26px;
        height: 26px;
        background: #39ff14;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 12px rgba(57,255,20,0.6);
    }

    .badge-logo {
        width: 16px;
        height: 16px;
        filter: invert(0); /* логотип чёрный на зелёном — хорошо */
    }

    /* ── Текст ────────────────────────────────────────────────────── */
    .title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.15rem;
        font-weight: 900;
        color: #fff;
        text-align: center;
        letter-spacing: 0.06em;
        margin-bottom: 0.9rem;
        line-height: 1.25;
    }

    .body-text {
        font-size: 0.85rem;
        color: rgba(255,255,255,0.6);
        text-align: center;
        line-height: 1.65;
        margin-bottom: 1.5rem;
        white-space: pre-wrap;
    }

    .body-text :global(strong) {
        color: #39ff14;
        font-weight: 700;
    }

    /* ── Кнопки ───────────────────────────────────────────────────── */
    .actions {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin-bottom: 1.25rem;
    }

    .btn-primary {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.85rem 1.5rem;
        background: #39ff14;
        color: #000;
        font-family: 'Chakra Petch', monospace;
        font-weight: 900;
        font-size: 0.8rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: none;
        border-radius: 2px;
        cursor: pointer;
        clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
        transition: all 0.22s ease;
    }
    .btn-primary:hover {
        background: #fff;
        box-shadow: 0 0 30px rgba(57,255,20,0.5);
        transform: translateY(-1px);
    }
    .btn-primary:active { transform: translateY(0); }

    .btn-ghost {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.3);
        font-family: 'Chakra Petch', monospace;
        font-size: 0.72rem;
        letter-spacing: 0.1em;
        cursor: pointer;
        padding: 0.4rem;
        transition: color 0.2s;
        text-transform: uppercase;
    }
    .btn-ghost:hover { color: rgba(255,255,255,0.7); }

    /* ── Статус-бар ────────────────────────────────────────────────── */
    .status-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-family: 'Chakra Petch', monospace;
        font-size: 0.52rem;
        letter-spacing: 0.2em;
        color: rgba(57,255,20,0.45);
        text-transform: uppercase;
        padding-top: 0.75rem;
        border-top: 1px solid rgba(255,255,255,0.05);
    }

    .status-dot {
        width: 4px; height: 4px;
        border-radius: 50%;
        background: #39ff14;
        box-shadow: 0 0 5px #39ff14;
    }

    @media (max-width: 480px) {
        .card { padding: 1.4rem 1.25rem 1rem; }
        .title { font-size: 1rem; }
        .body-text { font-size: 0.8rem; }
    }
</style>