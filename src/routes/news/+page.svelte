<script lang="ts">
    import type { PageData } from './$types';
    import { fade, fly } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { t, locale } from 'svelte-i18n';
    import { marked } from 'marked'; // <--- ИМПОРТИРУЕМ БИБЛИОТЕКУ

    export let data: PageData;

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => { opacity.set(1); });

    $: currentLang = $locale?.substring(0, 2) || 'ru';

    $: filteredNews = data.news.filter(post => {
        const postLang = post.lang || 'ru';
        return postLang === currentLang;
    });

    function formatDate(date: Date, currentLocale: string | null | undefined) {
        return new Intl.DateTimeFormat(currentLocale || 'ru', {
            day: 'numeric', month: 'long', year: 'numeric'
        }).format(date);
    }

    // Функция рендеринга Markdown
    function renderContent(content: string): string {
        // Настройки: breaks = true (энтер = новая строка)
        return marked.parse(content, { breaks: true, gfm: true }) as string;
    }
</script>

<svelte:head>
    <title>{$t('news_page.title')} | ProtoMap</title>
</svelte:head>

<div class="page-container" style="opacity: {$opacity}">
    <div class="header">
        <h1 class="title font-display glitch" data-text={$t('news_page.title')}>{$t('news_page.title')}</h1>
        <p class="subtitle">{$t('news_page.subtitle')}</p>
    </div>

    <div class="news-feed">
        {#if filteredNews.length > 0}
            {#each filteredNews as post, i (post.id)}
                <article class="news-card cyber-panel" in:fly="{{ y: 20, delay: i * 100, duration: 500 }}">
                    {#if post.image}
                        <div class="card-image">
                            <img src={post.image} alt={post.title} loading="lazy" />
                            <div class="image-overlay"></div>
                        </div>
                    {/if}

                    <div class="card-content">
                        <div class="meta">
                            <span class="date">{formatDate(post.createdAt, $locale)}</span>
                            {#if post.tags}
                                <div class="tags">
                                    {#each post.tags as tag}
                                        <span class="tag">#{tag}</span>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <h2 class="post-title font-display">{post.title}</h2>

                        <!-- СЮДА ВСТАВЛЯЕМ ОТФОРМАТИРОВАННЫЙ HTML -->
                        <div class="post-text markdown-body">
                            {@html renderContent(post.content)}
                        </div>
                    </div>
                </article>
            {/each}
        {:else}
            <div class="empty-state">
                <p>{$t('news_page.empty')}</p>
                <p class="text-xs text-gray-600 mt-2">LANGUAGE_SECTOR: {currentLang.toUpperCase()}</p>
            </div>
        {/if}
    </div>
</div>

<style>
    /* ... (Стили контейнера, шапки и карточки остаются прежними) ... */

    .page-container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; min-height: 100vh; }
    .header { text-align: center; margin-bottom: 3rem; }
    .title { font-size: 3rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted-color); font-family: 'Chakra Petch', monospace; }
    .news-feed { display: flex; flex-direction: column; gap: 2rem; }
    .news-card { background: rgba(10, 15, 20, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0.5rem; overflow: hidden; transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s; }
    .news-card:hover { transform: translateY(-5px); border-color: var(--cyber-yellow); box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 15px rgba(252, 238, 10, 0.2); }
    .card-image { position: relative; height: 200px; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .card-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; }
    .news-card:hover .card-image img { transform: scale(1.05); }
    .image-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,15,20,1), transparent); opacity: 0.6; }
    .card-content { padding: 1.5rem; }
    .meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; font-size: 0.85rem; }
    .date { color: var(--text-muted-color); font-family: 'Chakra Petch', monospace; }
    .tags { display: flex; gap: 0.5rem; }
    .tag { color: var(--cyber-cyan); background: rgba(0, 240, 255, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0, 240, 255, 0.2); font-family: 'Chakra Petch', monospace; }
    .post-title { font-size: 1.8rem; color: #fff; margin-bottom: 1rem; line-height: 1.2; }
    .empty-state { text-align: center; color: #666; padding: 4rem; font-family: 'Chakra Petch', monospace; }

    /* === МАГИЯ MARKDOWN СТИЛЕЙ === */
    /* Используем :global(), чтобы стили применились к HTML, который сгенерировал marked */

    .markdown-body :global(p) {
        margin-bottom: 1rem;
        line-height: 1.7;
        color: #d1d5db;
    }

    .markdown-body :global(strong) {
        color: var(--cyber-yellow);
        font-weight: 800;
        text-shadow: 0 0 5px rgba(252, 238, 10, 0.3);
    }

    .markdown-body :global(em) {
        color: var(--cyber-cyan);
        font-style: italic;
    }

    .markdown-body :global(a) {
        color: var(--cyber-cyan);
        text-decoration: none;
        border-bottom: 1px dashed var(--cyber-cyan);
        transition: all 0.2s;
    }
    .markdown-body :global(a:hover) {
        color: #fff;
        border-bottom-style: solid;
        text-shadow: 0 0 8px var(--cyber-cyan);
    }

    .markdown-body :global(h3), .markdown-body :global(h4) {
        color: #fff;
        font-family: 'Chakra Petch', monospace;
        margin-top: 2rem;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .markdown-body :global(ul), .markdown-body :global(ol) {
        margin-bottom: 1.5rem;
        padding-left: 1rem;
    }

    .markdown-body :global(li) {
        position: relative;
        padding-left: 1.5rem;
        margin-bottom: 0.5rem;
        color: #ccc;
    }

    /* Кибер-буллит для списка */
    .markdown-body :global(li::before) {
        content: '>';
        position: absolute;
        left: 0;
        color: var(--cyber-yellow);
        font-weight: bold;
    }

    .markdown-body :global(blockquote) {
        border-left: 3px solid var(--cyber-purple);
        background: rgba(189, 0, 255, 0.1);
        padding: 1rem;
        margin: 1.5rem 0;
        color: #e0e0e0;
        font-style: italic;
    }

    .markdown-body :global(code) {
        background: rgba(0,0,0,0.5);
        border: 1px solid #444;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
        color: #ff003c;
    }

    @media (max-width: 640px) {
        .title { font-size: 2rem; }
        .card-image { height: 150px; }
        .post-title { font-size: 1.4rem; }
    }
</style>