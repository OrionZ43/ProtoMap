<script lang="ts">
    import { auth } from "$lib/firebase";
    import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import NeonButton from "$lib/components/NeonButton.svelte";
    import { modal } from "$lib/stores/modalStore";
    import { fade } from "svelte/transition";

    let newPassword = "";
    let loading = false;
    let code = "";
    let email = "";
    let isCodeValid = false;
    let isCheckingCode = true;

    onMount(async () => {
        code = $page.url.searchParams.get("oobCode") || "";

        if (!code) {
            modal.error("Ошибка", "Неверная ссылка для сброса пароля.");
            goto("/");
            return;
        }

        try {
            email = await verifyPasswordResetCode(auth, code);
            isCodeValid = true;
        } catch (error) {
            console.error("Invalid code", error);
            modal.error("Ссылка устарела", "Эта ссылка для сброса пароля уже недействительна или была использована.");
            goto("/login");
        } finally {
            isCheckingCode = false;
        }
    });

    async function handlePasswordReset() {
        if (newPassword.length < 6) {
            modal.error("Ошибка", "Пароль должен быть не менее 6 символов.");
            return;
        }

        loading = true;
        try {
            await confirmPasswordReset(auth, code, newPassword);

            modal.success("Успешно!", "Ваш пароль был изменен. Теперь вы можете войти.");
            setTimeout(() => {
                goto("/login");
            }, 2000);
        } catch (error: any) {
            console.error("Reset error", error);
            modal.error("Ошибка", error.message || "Не удалось сменить пароль.");
        } finally {
            loading = false;
        }
    }
</script>

<svelte:head>
    <title>Новый пароль | ProtoMap</title>
</svelte:head>

<div class="page-container">
    <div class="form-container cyber-panel" in:fade>
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>

        <h2 class="form-title font-display">СБРОС ДОСТУПА</h2>

        {#if isCheckingCode}
            <p class="text-center text-gray-400 animate-pulse">Проверка кодов доступа...</p>
        {:else if isCodeValid}
            <p class="text-center text-sm text-gray-400 mb-6">
                Укажите новый пароль для аккаунта: <br>
                <span class="text-cyber-yellow font-bold">{email}</span>
            </p>

            <form on:submit|preventDefault={handlePasswordReset} class="space-y-6">
                <div class="form-group">
                    <label for="new-password" class="form-label font-display">НОВЫЙ ПАРОЛЬ</label>
                    <input
                        bind:value={newPassword}
                        type="password"
                        id="new-password"
                        class="input-field"
                        placeholder="••••••"
                        required
                    >
                </div>

                <NeonButton type="submit" disabled={loading} extraClass="w-full">
                    {loading ? 'ПРИМЕНЕНИЕ...' : 'СОХРАНИТЬ ПАРОЛЬ'}
                </NeonButton>
            </form>
        {:else}
            <div class="text-center">
                <p class="text-red-500 mb-4">Ошибка валидации ссылки.</p>
                <a href="/login" class="text-cyber-yellow hover:underline">Вернуться к входу</a>
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
    .form-container {
        @apply max-w-md w-full p-8 rounded-none shadow-2xl relative;
        background: rgba(10, 10, 10, 0.6);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
    }

    .form-title {
        @apply text-2xl font-bold text-center text-white mb-6;
        text-shadow: 0 0 10px rgba(252, 238, 10, 0.5);
    }

    .form-label {
        @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2;
    }

    .input-field {
        @apply block w-full p-2 bg-transparent text-gray-200;
        border: none;
        border-bottom: 1px solid var(--border-color, #30363d);
        border-radius: 0;
        font-family: 'Inter', sans-serif;
        font-size: 1.1em;
        transition: border-color 0.3s, box-shadow 0.3s;
    }

    .input-field:focus {
        @apply outline-none;
        border-bottom-color: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a);
    }

    .corner { position: absolute; width: 10px; height: 10px; border-color: var(--cyber-yellow); transition: all 0.3s; }
    .top-left { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; }
    .top-right { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; }
    .bottom-left { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; }
    .bottom-right { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; }
</style>