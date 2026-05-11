<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    onMount(() => {
        // Получаем все параметры, которые прислал Google (oobCode, mode, apiKey и т.д.)
        const params = $page.url.searchParams;
        const mode = params.get('mode'); // resetPassword, verifyEmail и т.д.

        // Формируем строку запроса, чтобы прокинуть коды дальше
        const queryString = params.toString();

        switch (mode) {
            case 'resetPassword':
                // Шлем на страницу сброса пароля
                goto(`/reset-password?${queryString}`);
                break;
            case 'verifyEmail':
                // Шлем на страницу верификации
                goto(`/verify-email?${queryString}`);
                break;
            default:
                // Если что-то пошло не так — на главную
                goto(`/?${queryString}`);
                break;
        }
    });
</script>

<div class="min-h-screen bg-black flex items-center justify-center">
    <p class="text-cyber-cyan font-mono animate-pulse">
        > ИДЕНТИФИКАЦИЯ ПРОТОКОЛА...
    </p>
</div>