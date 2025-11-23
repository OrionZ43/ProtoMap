<script lang="ts">
    import type { PageData } from './$types';
    import { fade, fly } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';

    export let data: PageData;

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => { opacity.set(1); });

    function formatDate(date: Date) {
        return new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        }).format(date);
    }
function formatText(text: string) {
        let safeText = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const urlRegex = /(https?:\/\/[^\s]+)/g;

        return safeText.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyber-yellow hover:underline break-all">${url}</a>`;
        });
    }
</script>

<svelte:head>
    <title>Новости Сети | ProtoMap</title>
</svelte:head>

<div class="page-container" style="opacity: {$opacity}">
    <div class="header">
        <h1 class="title font-display glitch" data-text="НОВОСТИ СЕТИ">НОВОСТИ СЕТИ</h1>
        <p class="subtitle">//: Хроники обновлений и системные сообщения</p>
    </div>

    <div class="news-feed">
        {#if data.news.length > 0}
            {#each data.news as post, i (post.id)}
                <article class="news-card cyber-panel" in:fly="{{ y: 20, delay: i * 100, duration: 500 }}">
                    {#if post.image}
                        <div class="card-image">
                            <img src={post.image} alt={post.title} loading="lazy" />
                            <div class="image-overlay"></div>
                        </div>
                    {/if}

                    <div class="card-content">
                        <div class="meta">
                            <span class="date">{formatDate(post.createdAt)}</span>
                            {#if post.tags}
                                <div class="tags">
                                    {#each post.tags as tag}
                                        <span class="tag">#{tag}</span>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <h2 class="post-title font-display">{post.title}</h2>

                        <div class="post-text">
                            {#each post.content.split('\n') as paragraph}
                                <p>{@html formatText(paragraph)}</p>
                            {/each}
                        </div>
                    </div>
                </article>
            {/each}
        {:else}
            <div class="empty-state">
                <p>Каналы связи молчат. Новостей пока нет.</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .page-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem 1rem;
        min-height: 100vh;
    }

    .header { text-align: center; margin-bottom: 3rem; }
    .title { font-size: 3rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted-color); font-family: 'Chakra Petch', monospace; }

    .news-feed { display: flex; flex-direction: column; gap: 2rem; }

    .news-card {
        background: rgba(10, 15, 20, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0.5rem;
        overflow: hidden;
        transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
    }
    .news-card:hover {
        transform: translateY(-5px);
        border-color: var(--cyber-yellow);
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 15px rgba(252, 238, 10, 0.2);
    }

    .card-image { position: relative; height: 200px; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .card-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; }
    .news-card:hover .card-image img { transform: scale(1.05); }
    .image-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,15,20,1), transparent); opacity: 0.6; }

    .card-content { padding: 1.5rem; }

    .meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; font-size: 0.85rem; }
    .date { color: var(--text-muted-color); font-family: 'Chakra Petch', monospace; }

    .tags { display: flex; gap: 0.5rem; }
    .tag {
        color: var(--cyber-cyan);
        background: rgba(0, 240, 255, 0.1);
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid rgba(0, 240, 255, 0.2);
        font-family: 'Chakra Petch', monospace;
    }

    .post-title { font-size: 1.8rem; color: #fff; margin-bottom: 1rem; line-height: 1.2; }

    .post-text { color: #ccc; line-height: 1.6; }
    .post-text p { margin-bottom: 1rem; }
    .post-text p:last-child { margin-bottom: 0; }

    .empty-state { text-align: center; color: #666; padding: 4rem; font-family: 'Chakra Petch', monospace; }

    @media (max-width: 640px) {
        .title { font-size: 2rem; }
        .card-image { height: 150px; }
        .post-title { font-size: 1.4rem; }
    }
</style>