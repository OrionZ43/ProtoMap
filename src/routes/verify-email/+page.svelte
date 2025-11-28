<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { auth } from '$lib/firebase';
    import { applyActionCode } from 'firebase/auth';
    import { goto } from '$app/navigation';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { fade, scale } from 'svelte/transition';

    let status: 'loading' | 'success' | 'error' = 'loading';
    let message = "УСТАНОВЛЕНИЕ ЗАЩИЩЕННОГО СОЕДИНЕНИЯ...";

    onMount(async () => {
        const code = $page.url.searchParams.get('oobCode');

        if (!code) {
            status = 'error';
            message = "ОШИБКА ПРОТОКОЛА: КОД ОТСУТСТВУЕТ.";
            return;
        }

        try {
            // Применяем код подтверждения
            await applyActionCode(auth, code);

            // Если пользователь залогинен, обновляем его данные сразу
            if (auth.currentUser) {
                await auth.currentUser.reload();
            }

            status = 'success';
            message = "ИДЕНТИФИКАЦИЯ ПОДТВЕРЖДЕНА. ДОСТУП РАЗРЕШЕН.";

            // Автопереход через 3 секунды
            setTimeout(() => {
                goto('/');
            }, 4000);

        } catch (error: any) {
            console.error("Verification error:", error);
            status = 'error';
            if (error.code === 'auth/invalid-action-code') {
                message = "КОД НЕДЕЙСТВИТЕЛЕН ИЛИ УЖЕ ИСПОЛЬЗОВАН.";
            } else if (error.code === 'auth/expired-action-code') {
                message = "ВРЕМЯ ДЕЙСТВИЯ ССЫЛКИ ИСТЕКЛО.";
            } else {
                message = "СБОЙ СИСТЕМЫ ПРИ ВЕРИФИКАЦИИ.";
            }
        }
    });
</script>

<svelte:head>
    <title>Верификация | ProtoMap</title>
</svelte:head>

<div class="page-container">
    <div class="verification-terminal cyber-panel" in:fade>
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>

        <!-- АНИМИРОВАННЫЙ СКАНЕР -->
        <div class="scanner-container">
            <div class="scanner-line" class:error={status === 'error'} class:success={status === 'success'}></div>
        </div>

        <h1 class="title font-display">
            {#if status === 'loading'}
                // ОБРАБОТКА ДАННЫХ...
            {:else if status === 'success'}
                // УСПЕХ
            {:else}
                // ОШИБКА
            {/if}
        </h1>

        <p class="status-message font-mono" class:text-red-500={status === 'error'} class:text-green-400={status === 'success'}>
            > {message}<span class="blink">_</span>
        </p>

        {#if status !== 'loading'}
            <div class="action-area" in:scale>
                <NeonButton href="/" color={status === 'error' ? 'red' : 'cyan'}>
                    ВЕРНУТЬСЯ В СЕТЬ
                </NeonButton>
            </div>
        {/if}
    </div>
</div>

<style>
    .page-container {
        min-height: calc(100vh - 64px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
    }

    .verification-terminal {
        @apply max-w-md w-full p-8 relative text-center;
        background: rgba(10, 12, 15, 0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
    }

    .title {
        font-size: 1.5rem;
        font-weight: bold;
        color: #fff;
        margin-bottom: 1.5rem;
        text-shadow: 0 0 10px rgba(255,255,255,0.3);
    }

    .status-message {
        color: #94a3b8;
        margin-bottom: 2rem;
        min-height: 3rem;
    }
    .status-message.text-red-500 { color: #ef4444; text-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
    .status-message.text-green-400 { color: #4ade80; text-shadow: 0 0 10px rgba(74, 222, 128, 0.4); }

    /* SCANNER ANIMATION */
    .scanner-container {
        width: 100%;
        height: 4px;
        background: rgba(255,255,255,0.1);
        margin-bottom: 2rem;
        position: relative;
        overflow: hidden;
    }
    .scanner-line {
        width: 30%;
        height: 100%;
        background: var(--cyber-yellow, #00f0ff);
        box-shadow: 0 0 10px var(--cyber-yellow, #00f0ff);
        position: absolute;
        animation: scan 2s infinite linear;
    }
    .scanner-line.success { background: #4ade80; box-shadow: 0 0 10px #4ade80; width: 100%; animation: none; }
    .scanner-line.error { background: #ef4444; box-shadow: 0 0 10px #ef4444; width: 100%; animation: none; }

    @keyframes scan {
        0% { left: -30%; }
        100% { left: 100%; }
    }

    .blink { animation: blink 1s infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    /* CORNERS */
    .corner { position: absolute; width: 15px; height: 15px; border-color: var(--cyber-yellow); transition: all 0.3s; }
    .top-left { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; }
    .top-right { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; }
    .bottom-left { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; }
    .bottom-right { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; }
</style>