<script lang="ts">
    import { enhance } from '$app/forms';
    import { modal } from '$lib/stores/modalStore';
    import type { ActionData } from './$types';
    import { fade, slide } from 'svelte/transition';

    export let form: ActionData;

    let isSubmitting = false;
    // Предпросмотр изображения
    let imageUrl = '';

    $: if (form?.success) {
        modal.success("Опубликовано!", "Новость успешно добавлена в ленту.");
        // Сбрасываем форму (визуально)
        imageUrl = '';
    } else if (form?.message) {
        modal.error("Ошибка", form.message);
    }
</script>

<svelte:head>
    <title>Propaganda Control | Overlord</title>
</svelte:head>

<div class="news-editor-wrapper" in:fade={{duration: 500}}>

    <header class="page-header">
        <h2 class="text-3xl font-bold text-white font-display tracking-widest mb-2">МОДУЛЬ ПРОПАГАНДЫ</h2>
        <p class="text-gray-500 font-mono text-sm">/// GLOBAL BROADCAST SYSTEM</p>
    </header>

    <div class="editor-grid">

        <!-- ФОРМА РЕДАКТИРОВАНИЯ -->
        <div class="editor-panel cyber-glass">
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
                class="editor-form"
            >
                <!-- ЗАГОЛОВОК -->
                <div class="form-group">
                    <label class="cyber-label">ЗАГОЛОВОК ТРАНСЛЯЦИИ</label>
                    <input type="text" name="title" required placeholder="Пример: THE GLITCH PIT 2.0" class="cyber-input header-input" autocomplete="off" />
                </div>

                <!-- ТЕКСТ -->
                <div class="form-group">
                    <label class="cyber-label">ТЕКСТ СООБЩЕНИЯ</label>
                    <textarea name="content" required rows="12" placeholder="Введите текст новости..." class="cyber-input text-area"></textarea>
                </div>

                <div class="meta-grid">
                    <!-- КАРТИНКА -->
                    <div class="form-group">
                        <label class="cyber-label">URL ИЗОБРАЖЕНИЯ</label>
                        <input type="url" name="imageUrl" bind:value={imageUrl} placeholder="https://..." class="cyber-input" />
                    </div>

                    <!-- ТЕГИ -->
                    <div class="form-group">
                        <label class="cyber-label">ТЕГИ (CSV)</label>
                        <input type="text" name="tags" placeholder="update, event, system" class="cyber-input" />
                    </div>
                </div>

                <div class="actions-bar">
                    <button type="submit" class="broadcast-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'ШИФРОВАНИЕ...' : 'ЗАПУСТИТЬ В ЭФИР'}
                        <span class="btn-glow"></span>
                    </button>
                </div>
            </form>
        </div>

        <!-- ПРЕВЬЮ (Визуализация того, как это будет выглядеть) -->
        <div class="preview-panel">
            <h3 class="preview-title">ПРЕДПРОСМОТР СИГНАЛА</h3>

            <div class="news-card-preview cyber-glass">
                {#if imageUrl}
                    <div class="card-image" transition:slide>
                        <img src={imageUrl} alt="Preview" />
                        <div class="image-overlay"></div>
                    </div>
                {:else}
                    <div class="card-image-placeholder">
                        <span>НЕТ ИЗОБРАЖЕНИЯ</span>
                    </div>
                {/if}

                <div class="card-content">
                    <div class="meta-mock">
                        <span class="date">ТОЛЬКО ЧТО</span>
                        <div class="tags-mock">
                            <span class="tag">#preview</span>
                        </div>
                    </div>
                    <div class="title-mock">ЗАГОЛОВОК НОВОСТИ</div>
                    <div class="text-mock">
                        <div class="line w-full"></div>
                        <div class="line w-11/12"></div>
                        <div class="line w-4/5"></div>
                    </div>
                </div>
            </div>
        </div>

    </div>
</div>

<style>
    .news-editor-wrapper { max-width: 1200px; margin: 0 auto; }
    .page-header { text-align: center; margin-bottom: 3rem; }

    .editor-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 2rem;
        align-items: start;
    }

    .cyber-glass {
        background: rgba(20, 25, 35, 0.4);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }

    .editor-panel { padding: 2rem; }
    .editor-form { display: flex; flex-direction: column; gap: 1.5rem; }

    .cyber-label {
        display: block; font-family: 'Chakra Petch', monospace; font-weight: bold;
        color: #64748b; font-size: 0.75rem; letter-spacing: 0.1em; margin-bottom: 0.5rem;
    }

    .cyber-input {
        width: 100%; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px; padding: 1rem; color: #fff; font-family: 'Inter', sans-serif;
        transition: all 0.2s; outline: none;
    }
    .cyber-input:focus {
        background: rgba(0, 0, 0, 0.4);
        border-color: var(--cyber-yellow);
        box-shadow: 0 0 20px rgba(0, 243, 255, 0.1);
    }

    .header-input { font-size: 1.2rem; font-weight: bold; font-family: 'Chakra Petch', monospace; }
    .text-area { font-size: 1rem; line-height: 1.6; resize: vertical; }

    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

    .actions-bar { margin-top: 1rem; display: flex; justify-content: flex-end; }

    .broadcast-btn {
        position: relative; padding: 1rem 3rem; background: var(--cyber-yellow);
        color: #000; font-weight: 900; font-family: 'Chakra Petch', sans-serif;
        border-radius: 12px; cursor: pointer; overflow: hidden;
        transition: transform 0.2s; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .broadcast-btn:hover { transform: scale(1.02); box-shadow: 0 0 30px rgba(0, 243, 255, 0.4); }
    .broadcast-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

    /* PREVIEW PANEL */
    .preview-title {
        font-family: 'Chakra Petch', monospace; font-size: 0.8rem; color: #64748b;
        margin-bottom: 1rem; text-align: center; letter-spacing: 0.1em;
    }

    .news-card-preview {
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .card-image { position: relative; height: 180px; overflow: hidden; }
    .card-image img { width: 100%; height: 100%; object-fit: cover; }
    .image-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(20,25,35,1), transparent); opacity: 0.6; }

    .card-image-placeholder {
        height: 180px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;
        color: #444; font-family: 'Chakra Petch', monospace; font-size: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .card-content { padding: 1.5rem; }
    .meta-mock { display: flex; justify-content: space-between; margin-bottom: 1rem; }
    .date { font-size: 0.7rem; color: #64748b; font-family: 'Chakra Petch', monospace; }
    .tag { font-size: 0.7rem; color: var(--cyber-yellow); background: rgba(0, 243, 255, 0.1); padding: 2px 6px; border-radius: 4px; }

    .title-mock { font-family: 'Chakra Petch', sans-serif; font-weight: bold; font-size: 1.2rem; color: #fff; margin-bottom: 1rem; opacity: 0.5; }
    .text-mock .line { height: 10px; background: rgba(255,255,255,0.1); margin-bottom: 8px; border-radius: 2px; }

    @media (max-width: 1024px) {
        .editor-grid { grid-template-columns: 1fr; }
        .preview-panel { display: none; } /* Скрываем превью на мобилках */
    }
</style>