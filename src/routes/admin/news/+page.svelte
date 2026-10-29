<!-- src/routes/admin/news/+page.svelte -->
<!--
    «Новости»: публикация в ленту /news. Предпросмотр справа рисует введённое
    так же, как лента (renderMarkdown), под формой — последние публикации.
    Вид — общие элементы админки (admin.css).
-->
<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { t, locale } from 'svelte-i18n';
    import { modal } from '$lib/stores/modalStore';
    import { renderMarkdown } from '$lib/utils/markdown';
    import { formats } from '$lib/admin/format';
    import type { PageData } from './$types';

    export let data: PageData;

    let lang: 'ru' | 'en' = 'ru';
    let title = '';
    let content = '';
    let imageUrl = '';
    let tags = '';
    let busy = false;
    let imageBroken = false;

    $: f = formats($locale);
    $: tagList = tags.split(',').map((s) => s.trim()).filter(Boolean);
    $: previewHtml = content.trim() ? renderMarkdown(content) : '';
    // Новая ссылка — новая попытка загрузить картинку.
    $: imageUrl, (imageBroken = false);

    const publish: SubmitFunction = () => {
        busy = true;
        return async ({ result, update }) => {
            await update({ reset: false });
            busy = false;
            if (result.type === 'success') {
                title = '';
                content = '';
                imageUrl = '';
                tags = '';
                modal.success($t('admin_news.result.ok_title'), $t('admin_news.result.ok'));
            } else if (result.type === 'failure') {
                const code = (result.data as { code?: string } | undefined)?.code ?? 'failed';
                modal.error($t('admin_news.result.fail_title'), $t(`admin_news.result.${code}`));
            }
        };
    };
</script>

<svelte:head>
    <title>{$t('admin_news.title')} | ProtoMap</title>
</svelte:head>

<header class="adm-head">
    <div>
        <h1>{$t('admin_news.title')}</h1>
        <p>{$t('admin_news.subtitle')}</p>
    </div>
    <a class="adm-btn" href="/news" target="_blank" rel="noopener">
        {$t('admin_news.open_site')}
        <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
    </a>
</header>

<div class="layout">
    <form class="adm-panel editor" method="POST" action="?/create" use:enhance={publish}>
        <div class="adm-field">
            <span class="adm-label">{$t('admin_news.lang')}</span>
            <div class="adm-chips" role="radiogroup" aria-label={$t('admin_news.lang')}>
                <label class="adm-chip" class:on={lang === 'ru'}>
                    <input type="radio" name="lang" value="ru" bind:group={lang} />
                    {$t('admin_news.lang_ru')}
                </label>
                <label class="adm-chip" class:on={lang === 'en'}>
                    <input type="radio" name="lang" value="en" bind:group={lang} />
                    {$t('admin_news.lang_en')}
                </label>
            </div>
        </div>

        <label class="adm-field">
            <span class="adm-label">{$t('admin_news.field_title')}</span>
            <input type="text" name="title" class="adm-input big" bind:value={title} required autocomplete="off"
                placeholder={$t('admin_news.field_title_ph')} />
        </label>

        <label class="adm-field">
            <span class="adm-label">{$t('admin_news.field_content')}</span>
            <textarea name="content" class="adm-textarea" rows="12" bind:value={content} required
                placeholder={$t('admin_news.field_content_ph')}></textarea>
        </label>

        <div class="two">
            <label class="adm-field">
                <span class="adm-label">{$t('admin_news.field_image')}</span>
                <input type="url" name="imageUrl" class="adm-input" bind:value={imageUrl} placeholder="https://…" />
            </label>
            <label class="adm-field">
                <span class="adm-label">{$t('admin_news.field_tags')}</span>
                <input type="text" name="tags" class="adm-input" bind:value={tags} placeholder={$t('admin_news.field_tags_ph')} />
            </label>
        </div>

        <div class="submit">
            <button type="submit" class="adm-btn primary" disabled={busy}>
                {busy ? $t('admin_news.publishing') : $t('admin_news.publish')}
            </button>
        </div>
    </form>

    <aside class="side">
        <h2 class="adm-panel-title">{$t('admin_news.preview')}</h2>
        <article class="adm-panel preview">
            {#if imageUrl && !imageBroken}
                <img class="cover" src={imageUrl} alt="" on:error={() => (imageBroken = true)} />
            {:else if imageUrl && imageBroken}
                <div class="cover empty">{$t('admin_news.image_broken')}</div>
            {/if}
            <div class="meta">
                <span>{$t('admin_news.preview_now')}</span>
                <span class="adm-badge">{lang.toUpperCase()}</span>
                {#each tagList as tag}<span class="tag">#{tag}</span>{/each}
            </div>
            <h3 class:placeholder={!title.trim()}>{title.trim() || $t('admin_news.preview_title')}</h3>
            {#if previewHtml}
                <div class="md">{@html previewHtml}</div>
            {:else}
                <p class="adm-note">{$t('admin_news.preview_empty')}</p>
            {/if}
        </article>

        <h2 class="adm-panel-title recent-title">{$t('admin_news.recent')}</h2>
        <div class="adm-panel recent">
            {#each data.recent as n (n.id)}
                <div class="item">
                    {#if n.image}<img src={n.image} alt="" loading="lazy" />{:else}<span class="thumb"></span>{/if}
                    <div class="item-text">
                        <span class="item-title">{n.title}</span>
                        <span class="item-meta">{n.createdAt ? f.when(n.createdAt, Date.now()) : '—'} · {n.lang.toUpperCase()}</span>
                    </div>
                </div>
            {:else}
                <p class="adm-note">{$t('admin_news.recent_empty')}</p>
            {/each}
        </div>
    </aside>
</div>

<style>
    .layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); gap: 24px; align-items: start; }
    .editor { display: flex; flex-direction: column; gap: 20px; }
    .adm-chip input { position: absolute; opacity: 0; pointer-events: none; }
    .adm-chip { position: relative; }
    .adm-chip:focus-within { outline: 2px solid var(--yellow); outline-offset: 2px; }
    .adm-input.big { font: 400 19px var(--display); }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .submit { display: flex; justify-content: flex-end; }

    /* ── Предпросмотр: как карточка в ленте ── */
    .side { position: sticky; top: 20px; }
    .adm-panel.preview { padding: 0; overflow: hidden; }
    .cover { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
    .cover.empty { display: grid; place-items: center; padding: 16px; background: rgba(255, 107, 129, .08); color: #ffb3c0; font-size: 13.5px; text-align: center; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 18px 20px 0; color: var(--dim); font-size: 13px; }
    .tag { color: var(--yellow); }
    .preview h3 { margin: 10px 20px 0; font: 400 22px/1.25 var(--display); overflow-wrap: anywhere; }
    .preview h3.placeholder { color: var(--dim); }
    .preview .adm-note { padding: 10px 20px 20px; }
    .md { padding: 10px 20px 20px; color: var(--soft); font-size: 15px; line-height: 1.6; overflow-wrap: anywhere; max-height: 520px; overflow-y: auto; }
    .md :global(p) { margin: 0 0 10px; }
    .md :global(h1), .md :global(h2), .md :global(h3) { margin: 14px 0 8px; font: 500 17px var(--body); color: var(--text); }
    .md :global(a) { color: var(--yellow); }
    .md :global(ul), .md :global(ol) { margin: 0 0 10px; padding-left: 20px; }
    .md :global(code) { font-size: 13px; color: #c9bbff; }
    .md :global(img) { max-width: 100%; border-radius: 12px; }

    .adm-panel-title.recent-title { margin-top: 26px; }
    .adm-panel.recent { padding: 8px 18px; }
    .item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .item:last-child { border-bottom: 0; }
    .item img, .thumb { width: 52px; height: 36px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: rgba(255, 255, 255, .05); }
    .item-text { display: flex; flex-direction: column; min-width: 0; }
    .item-title { color: var(--text); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-meta { color: var(--dim); font-size: 12.5px; }

    @media (max-width: 1024px) {
        .layout { grid-template-columns: 1fr; }
        .side { position: static; }
    }
    @media (max-width: 600px) {
        .two { grid-template-columns: 1fr; }
    }
</style>
