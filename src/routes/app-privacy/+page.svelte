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
    <title>{$t('app_privacy_policy.page_title')} | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h1 class="title font-display">{$t('app_privacy_policy.page_title')}</h1>
    <p class="subtitle">{$t('app_privacy_policy.last_updated')}</p>

    <div class="content-text">
        <p>{$t('app_privacy_policy.intro')}</p>

        <h3 class="section-title">{$t('app_privacy_policy.section_geo_title')}</h3>
        <p>{$t('app_privacy_policy.section_geo_text')}</p>
        <ul>
            {#each $t('app_privacy_policy.section_geo_list') as item}
                <li>{item}</li>
            {/each}
        </ul>
        <p>{$t('app_privacy_policy.section_geo_processing')}</p>
        <div class="subsection">
            <p><strong>• {$t('app_privacy_policy.section_geo_mode_auto')}</strong></p>
            <p><strong>• {$t('app_privacy_policy.section_geo_mode_manual')}</strong></p>
        </div>

        <h3 class="section-title">{$t('app_privacy_policy.section_media_title')}</h3>
        <p>{$t('app_privacy_policy.section_media_text')}</p>
        <ul>
            <li><strong>{$t('app_privacy_policy.section_media_camera')}</strong></li>
            <li><strong>{$t('app_privacy_policy.section_media_mic')}</strong></li>
            <li><strong>{$t('app_privacy_policy.section_media_storage')}</strong></li>
        </ul>

        <h3 class="section-title">{$t('app_privacy_policy.section_safety_title')}</h3>
        <p>{$t('app_privacy_policy.section_safety_text')}</p>
        <div class="alert-box">
            <p><strong>{$t('app_privacy_policy.section_safety_age')}</strong></p>
            <p><strong>{$t('app_privacy_policy.section_safety_csam')}</strong></p>
        </div>
        <p>{$t('app_privacy_policy.section_safety_measures')}</p>
        <ul>
            {#each $t('app_privacy_policy.section_safety_actions') as item}
                <li>{item}</li>
            {/each}
        </ul>

        <h3 class="section-title">{$t('app_privacy_policy.section_data_title')}</h3>
        <p>{$t('app_privacy_policy.section_data_text')}</p>
        <ul>
            {#each $t('app_privacy_policy.section_data_list') as item}
                <li>{item}</li>
            {/each}
        </ul>
        <p>{$t('app_privacy_policy.section_third_party')}</p>

        <h3 class="section-title">{$t('app_privacy_policy.section_delete_title')}</h3>
        <p>{$t('app_privacy_policy.section_delete_text')}</p>

        <h3 class="section-title">{$t('app_privacy_policy.section_contact_title')}</h3>
        <p>
            {$t('app_privacy_policy.section_contact_text')}
            <br>
            <a href="mailto:{$t('app_privacy_policy.contact_email')}" class="link">{$t('app_privacy_policy.contact_email')}</a>
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

    .subsection {
        background: rgba(255, 255, 255, 0.03);
        padding: 1rem;
        border-left: 2px solid var(--cyber-cyan, #00f0ff);
        margin: 1rem 0;
    }

    .alert-box {
        background: rgba(255, 0, 60, 0.1);
        border: 1px solid var(--cyber-red, #ff003c);
        padding: 1rem;
        margin: 1.5rem 0;
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