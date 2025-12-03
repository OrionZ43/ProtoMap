<script lang="ts">
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { t } from 'svelte-i18n';

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => {
        opacity.set(1);
    });
</script>

<svelte:head>
    <title>{$t('terms.title')} | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h2 class="title font-display">{$t('terms.title')}</h2>
    <p class="subtitle">{$t('terms.subtitle')}</p>

    <div class="content-text">
        <div class="disclaimer-box">
            <strong class="text-red-500">{$t('terms.disclaimer_title')}</strong>
            <p>{$t('terms.disclaimer_text')}</p>
        </div>

        <p>{$t('terms.intro')}</p>

        <h3 class="section-title">{$t('terms.sec1_title')}</h3>
        <ul>
            {#each $t('terms.sec1_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('terms.sec2_title')}</h3>
        <p>{$t('terms.sec2_intro')}</p>
        <ul>
            {#each $t('terms.sec2_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('terms.sec3_title')}</h3>
        <p>{$t('terms.sec3_intro')}</p>
        <ul>
            {#each $t('terms.sec3_list') as item}
                <li>{@html item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('terms.sec4_title')}</h3>
        <ul>
            {#each $t('terms.sec4_list') as item}
                <li>{@html item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('terms.sec5_title')}</h3>
        <p>{$t('terms.sec5_intro')}</p>
        <ul>
            {#each $t('terms.sec5_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('terms.sec6_title')}</h3>
        <p>{$t('terms.sec6_intro')}</p>
        <ul>
            {#each $t('terms.sec6_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('terms.sec7_title')}</h3>
        <ul>
            {#each $t('terms.sec7_list') as item}
                <li>{item}</li>
            {/each}
        </ul>
        <p>
            {$t('terms.sec7_contact')}
            <a href="https://t.me/Orion_Z43" target="_blank" class="link">@Orion_Z43</a>.
        </p>
    </div>
</div>

<style>
    .legal-container {
        max-width: 900px;
        margin: 2.5rem auto;
        padding: 3rem;
        background: rgba(10, 12, 15, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
    }
    .disclaimer-box {
        background: rgba(255, 0, 60, 0.1);
        border: 1px solid var(--cyber-red, #ff003c);
        padding: 1rem;
        margin-bottom: 2rem;
        font-size: 0.9rem;
        color: #ffccd5;
    }
    .title {
        font-size: 2.5rem;
        font-weight: 700;
        text-align: center;
        color: #fff;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .subtitle {
        text-align: center;
        color: var(--text-muted-color, #909dab);
        margin-bottom: 3rem;
        font-family: 'Chakra Petch', monospace;
        font-size: 0.9rem;
    }
    .content-text {
        font-size: 1rem;
        line-height: 1.8;
        color: #d1d5db;
    }
    .content-text p { margin-bottom: 1.5rem; text-align: justify; }

    .section-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        margin-top: 3rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.5rem;
    }
    .content-text ul {
        list-style-type: none;
        padding-left: 1rem;
        margin-bottom: 1.5rem;
    }
    .content-text li {
        position: relative;
        padding-left: 2rem;
        margin-bottom: 0.8rem;
    }
    .content-text li::before {
        content: '>';
        position: absolute;
        left: 0;
        color: var(--cyber-yellow, #fcee0a);
        font-weight: bold;
    }
    .link {
        color: var(--cyber-cyan, #00f0ff);
        text-decoration: none;
        border-bottom: 1px dashed var(--cyber-cyan);
        transition: all 0.2s;
    }
    .link:hover {
        color: #fff;
        border-bottom-style: solid;
    }
    @media (max-width: 640px) {
        .legal-container { margin: 1rem; padding: 1.5rem; }
        .title { font-size: 1.8rem; }
        .content-text { font-size: 0.95rem; }
    }
</style>