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
    <title>{$t('app_terms.page_title')} | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h1 class="title font-display">{$t('app_terms.page_title')}</h1>
    <p class="subtitle">{$t('app_terms.last_updated')}</p>

    <div class="content-text">
        <p>{$t('app_terms.intro')}</p>

        <h3 class="section-title">{$t('app_terms.sec_license_title')}</h3>
        <p>{$t('app_terms.sec_license_text')}</p>
        <ul>
            {#each $t('app_terms.sec_license_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('app_terms.sec_content_title')}</h3>
        <p>{$t('app_terms.sec_content_text')}</p>

        <div class="alert-box">
            <p><strong>{$t('app_terms.sec_content_policy')}</strong></p>
        </div>

        <ul>
            {#each $t('app_terms.sec_content_prohibited') as item}
                <li>{item}</li>
            {/each}
        </ul>
        <p>{$t('app_terms.sec_content_moderation')}</p>

        <h3 class="section-title">{$t('app_terms.sec_virtual_title')}</h3>
        <p>{$t('app_terms.sec_virtual_text')}</p>
        <ul>
            {#each $t('app_terms.sec_virtual_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('app_terms.sec_safety_title')}</h3>
        <p>{$t('app_terms.sec_safety_text')}</p>
        <ul>
            {#each $t('app_terms.sec_safety_list') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('app_terms.sec_termination_title')}</h3>
        <p>{$t('app_terms.sec_termination_text')}</p>

        <h3 class="section-title">{$t('app_terms.sec_disclaimer_title')}</h3>
        <p>{$t('app_terms.sec_disclaimer_text')}</p>

        <h3 class="section-title">{$t('app_terms.sec_contact_title')}</h3>
        <p>
            {$t('app_terms.sec_contact_text')}
            <br>
            <a href="mailto:{$t('app_terms.contact_email')}" class="link">{$t('app_terms.contact_email')}</a>
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

    .content-text p {
        margin-bottom: 1rem;
        text-align: justify;
    }

    .section-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        margin-top: 2.5rem;
        margin-bottom: 1rem;
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
        padding-left: 1.5rem;
        margin-bottom: 0.5rem;
    }

    .content-text li::before {
        content: '>';
        position: absolute;
        left: 0;
        color: var(--cyber-yellow, #fcee0a);
        font-weight: bold;
    }

    .alert-box {
        background: rgba(255, 0, 60, 0.1);
        border: 1px solid var(--cyber-red, #ff003c);
        padding: 1rem;
        margin: 1.5rem 0;
        color: #ffccd5;
    }

    .link {
        color: var(--cyber-cyan, #00f0ff);
        text-decoration: none;
        border-bottom: 1px dashed var(--cyber-cyan, #00f0ff);
        transition: all 0.2s;
    }

    .link:hover {
        color: #fff;
        border-bottom-style: solid;
    }

    @media (max-width: 640px) {
        .legal-container {
            margin: 1rem;
            padding: 1.5rem;
        }
        .title {
            font-size: 1.8rem;
        }
    }
</style>