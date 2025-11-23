<script lang="ts">
    import { enhance } from '$app/forms';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { modal } from '$lib/stores/modalStore';
    import type { ActionData } from './$types';

    export let form: ActionData;

    let isSubmitting = false;

    $: if (form?.success) {
        modal.success("Опубликовано!", "Новость успешно добавлена в ленту.");
    } else if (form?.message) {
        modal.error("Ошибка", form.message);
    }
</script>

<svelte:head>
    <title>Admin: Публикация | ProtoMap</title>
</svelte:head>

<div class="admin-container cyber-panel">
    <h1 class="font-display text-2xl mb-6 text-cyber-yellow">// ПУЛЬТ УПРАВЛЕНИЯ ЭФИРОМ</h1>

    <form
        method="POST"
        action="?/create"
        use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
                await update();
                isSubmitting = false;
            };
        }}
        class="space-y-6"
    >
        <div class="form-group">
            <label for="title">ЗАГОЛОВОК</label>
            <input type="text" id="title" name="title" required placeholder="Пример: Обновление 2.0" class="input-field" />
        </div>

        <div class="form-group">
            <label for="content">ТЕКСТ НОВОСТИ</label>
            <textarea id="content" name="content" required rows="6" placeholder="Что нового в Бездне?" class="input-field"></textarea>
            <p class="text-xs text-gray-500 mt-1">Переносы строк учитываются автоматически.</p>
        </div>

        <div class="form-group">
            <label for="imageUrl">ССЫЛКА НА ИЗОБРАЖЕНИЕ (Опционально)</label>
            <input type="url" id="imageUrl" name="imageUrl" placeholder="https://..." class="input-field" />
        </div>

        <div class="form-group">
            <label for="tags">ТЕГИ (через запятую)</label>
            <input type="text" id="tags" name="tags" placeholder="update, casino, event" class="input-field" />
        </div>

        <div class="pt-4">
            <NeonButton type="submit" disabled={isSubmitting} extraClass="w-full">
                {isSubmitting ? 'ПУБЛИКАЦИЯ...' : 'ОТПРАВИТЬ В ЭФИР'}
            </NeonButton>
        </div>
    </form>

    <div class="mt-8 text-center">
        <a href="/news" class="text-gray-500 hover:text-white underline">Вернуться к списку новостей</a>
    </div>
</div>

<style>
    .admin-container {
        max-width: 600px;
        margin: 4rem auto;
        padding: 2rem;
        background: rgba(10, 10, 10, 0.8);
        border: 1px solid var(--cyber-yellow);
    }

    label {
        display: block;
        font-family: 'Chakra Petch', monospace;
        color: var(--cyber-yellow);
        margin-bottom: 0.5rem;
        font-weight: bold;
    }

    .input-field {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid #333;
        padding: 0.75rem;
        color: #fff;
        font-family: 'Inter', sans-serif;
        transition: border-color 0.2s;
    }
    .input-field:focus {
        outline: none;
        border-color: var(--cyber-yellow);
        box-shadow: 0 0 10px rgba(0, 243, 255, 0.2);
    }
</style>