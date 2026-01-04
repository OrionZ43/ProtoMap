<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, scale } from 'svelte/transition';
    import { t } from 'svelte-i18n';

    // 🔥 НОВЫЙ КЛЮЧ! Это сбросит просмотры у всех пользователей.
    const STORAGE_KEY = 'protomap_beta_announce_v1';

    let isVisible = false;

    onMount(() => {
        const hasSeenModal = localStorage.getItem(STORAGE_KEY);
        // Показываем, если ключа нет
        if (!hasSeenModal) {
            // Небольшая задержка для плавности появления после загрузки сайта
            setTimeout(() => {
                isVisible = true;
            }, 500);
        }
    });

    function closeModal() {
        isVisible = false;
        localStorage.setItem(STORAGE_KEY, 'true');
    }

    function goToBeta() {
        closeModal();
        window.location.href = '/mobile-beta';
    }
</script>

{#if isVisible}
    <div
        class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        transition:fade={{ duration: 300 }}
    >
        <div
            class="modal-container cyber-panel max-w-md w-full relative overflow-hidden"
            transition:scale={{ duration: 300, start: 0.9 }}
        >
            <!-- Полосы тревоги сверху -->
            <div class="hazard-stripe"></div>

            <div class="p-8 text-center relative z-10">

                <!-- Иконка -->
                <div class="icon-wrapper">
                    📣
                </div>

                <!-- Заголовок -->
                <h2 class="title font-display glitch" data-text={$t('splash_beta.title')}>
                    {$t('splash_beta.title')}
                </h2>

                <!-- Текст сообщения -->
                <!-- whitespace-pre-wrap сохраняет переносы строк из JSON -->
                <p class="message">
                    {@html $t('splash_beta.text')}
                </p>

                <!-- Кнопки -->
                <div class="actions">
                    <button class="action-btn" on:click={goToBeta}>
                        {$t('splash_beta.btn')}
                    </button>

                    <button class="close-text" on:click={closeModal}>
                        Остаться дезертиром (Закрыть)
                    </button>
                </div>
            </div>

            <!-- Угловые акценты -->
            <div class="corner bottom-left"></div>
            <div class="corner bottom-right"></div>
        </div>
    </div>
{/if}

<style>
    .modal-container {
        background: rgba(10, 10, 15, 0.95);
        border: 1px solid var(--cyber-yellow, #fcee0a);
        box-shadow: 0 0 40px rgba(252, 238, 10, 0.15);
    }

    /* Диагональные полосы сверху (Caution Tape) */
    .hazard-stripe {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 8px;
        background: repeating-linear-gradient(
            45deg,
            var(--cyber-yellow, #fcee0a),
            var(--cyber-yellow, #fcee0a) 10px,
            #000 10px,
            #000 20px
        );
        box-shadow: 0 5px 10px rgba(0,0,0,0.5);
    }

    .icon-wrapper {
        font-size: 3.5rem;
        margin-bottom: 1rem;
        animation: pulse-icon 1.5s infinite ease-in-out;
        filter: drop-shadow(0 0 10px rgba(252, 238, 10, 0.5));
    }

    .title {
        font-size: 1.8rem;
        color: var(--cyber-yellow, #fcee0a);
        margin-bottom: 1.5rem;
        text-shadow: 0 0 10px rgba(252, 238, 10, 0.5);
        line-height: 1.2;
    }

    .message {
        color: #d1d5db;
        font-size: 1rem;
        line-height: 1.6;
        margin-bottom: 2rem;
        white-space: pre-wrap; /* Важно для переносов строк */
    }

    /* Жирный текст внутри сообщения (если придет из JSON) */
    :global(.message strong) {
        color: #fff;
        font-weight: 800;
        text-shadow: 0 0 5px var(--cyber-yellow);
    }

    .actions {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        align-items: center;
    }

    .action-btn {
        width: 100%;
        padding: 1rem;
        background: var(--cyber-yellow, #fcee0a);
        color: #000;
        font-family: 'Chakra Petch', monospace;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        border: none;
        clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        transition: all 0.2s;
        cursor: pointer;
    }

    .action-btn:hover {
        background: #fff;
        box-shadow: 0 0 20px var(--cyber-yellow);
        transform: scale(1.02);
    }

    .close-text {
        font-size: 0.8rem;
        color: #666;
        text-decoration: underline;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: color 0.2s;
    }
    .close-text:hover { color: #aaa; }

    /* Уголки снизу для стиля */
    .corner {
        position: absolute;
        width: 10px; height: 10px;
        border: 2px solid var(--cyber-yellow);
        opacity: 0.5;
    }
    .bottom-left { bottom: 5px; left: 5px; border-width: 0 0 2px 2px; }
    .bottom-right { bottom: 5px; right: 5px; border-width: 0 2px 2px 0; }

    /* Анимации */
    @keyframes pulse-icon {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }

    /* Глитч эффект для заголовка */
    .glitch { position: relative; }
    .glitch::before, .glitch::after {
        content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(10, 10, 15, 0.95); overflow: hidden;
    }
    .glitch::before { text-shadow: -2px 0 #ff003c; animation: glitch-anim-1 2s infinite linear alternate-reverse; clip-path: inset(0 0 0 0); left: 2px; }
    .glitch::after { text-shadow: 2px 0 #00f0ff; animation: glitch-anim-2 3s infinite linear alternate-reverse; clip-path: inset(0 0 0 0); left: -2px; }

    @keyframes glitch-anim-1 {
        0% { clip-path: inset(20% 0 80% 0); } 20% { clip-path: inset(60% 0 10% 0); }
        40% { clip-path: inset(40% 0 50% 0); } 60% { clip-path: inset(80% 0 5% 0); }
        80% { clip-path: inset(10% 0 70% 0); } 100% { clip-path: inset(30% 0 20% 0); }
    }
    @keyframes glitch-anim-2 {
        0% { clip-path: inset(10% 0 60% 0); } 20% { clip-path: inset(30% 0 20% 0); }
        40% { clip-path: inset(70% 0 10% 0); } 60% { clip-path: inset(20% 0 50% 0); }
        80% { clip-path: inset(50% 0 30% 0); } 100% { clip-path: inset(0% 0 90% 0); }
    }
</style>