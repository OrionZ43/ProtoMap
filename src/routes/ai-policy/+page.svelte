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
    <title>{$t('ai_policy.title')} | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h2 class="title font-display">{$t('ai_policy.title')}</h2>
    <p class="subtitle">{$t('ai_policy.subtitle')}</p>

    <div class="content-text">
        <h3 class="section-title">{$t('ai_policy.intro_title')}</h3>
        <p>{$t('ai_policy.intro_text')}</p>

        <div class="info-grid">
            <div>
                <strong>{$t('ai_policy.reason_label')}</strong>
                <p>{$t('ai_policy.reason_text')}</p>
            </div>
            <div>
                <strong>{$t('ai_policy.fact_label')}</strong>
                <p>{$t('ai_policy.fact_text')}</p>
            </div>
        </div>

        <h3 class="section-title">{$t('ai_policy.moderation_title')}</h3>
        <p>{$t('ai_policy.moderation_text')}</p>

        <blockquote class="quote-box error">
            {$t('ai_policy.moderator_quote_1')}
        </blockquote>

        <blockquote class="quote-box">
            {$t('ai_policy.moderator_quote_2')}
        </blockquote>

        <p>{$t('ai_policy.moderation_outro')}</p>

        <div class="screenshots-container">
            <img src="/images/modmail_1.png" alt="Modmail Screenshot 1" class="screenshot">
            <img src="/images/modmail_2.png" alt="Modmail Screenshot 2" class="screenshot">
            <img src="/images/modmail_3.png" alt="Modmail Screenshot 3" class="screenshot">
        </div>

        <h3 class="section-title">{$t('ai_policy.philosophy_title')}</h3>

        <div class="points-list">
            <h4>{$t('ai_policy.point1_title')}</h4>
            <p>{$t('ai_policy.point1_text')}</p>

            <h4>{$t('ai_policy.point2_title')}</h4>
            <p>{$t('ai_policy.point2_text')}</p>

            <h4>{$t('ai_policy.point3_title')}</h4>
            <p>{@html $t('ai_policy.point3_text')}</p>
        </div>

        <h3 class="section-title">{$t('ai_policy.conclusion_title')}</h3>
        <p>{$t('ai_policy.conclusion_text')}</p>

        <p class="mt-12 text-center text-gray-500">{$t('ai_policy.eoc')}</p>
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
    }
    .subtitle {
        text-align: center;
        color: var(--text-muted-color, #909dab);
        margin-bottom: 3rem;
        font-family: 'Chakra Petch', monospace;
    }
    .content-text {
        font-size: 1rem;
        line-height: 1.8;
        color: #d1d5db;
    }
    .content-text p { margin-bottom: 1.5rem; }

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

    .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        background: rgba(255,255,255,0.02);
        padding: 1rem;
        border-left: 3px solid var(--cyber-cyan);
    }
    .info-grid strong {
        color: var(--cyber-cyan);
        font-weight: bold;
        display: block;
        margin-bottom: 0.5rem;
    }
    .info-grid p {
        margin: 0;
        color: #ccc;
    }

    .quote-box {
        background: rgba(255, 0, 60, 0.05);
        border-left: 3px solid var(--cyber-red, #ff003c);
        padding: 1rem 1.5rem;
        margin: 1rem 0;
        font-style: italic;
        color: #ffccd5;
    }

    .quote-box.error {
        border-left-color: #ff0000;
        background: rgba(255, 0, 0, 0.1);
        color: #ffaaaa;
        font-weight: bold;
    }

    .points-list h4 {
        font-size: 1.1rem;
        font-weight: bold;
        color: #fff;
        margin-top: 2rem;
        margin-bottom: 0.5rem;
    }

    .screenshots-container {
        margin: 2rem 0;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
    }
    .screenshot {
        width: 100%;
        display: block;
        border-bottom: 1px solid #333;
    }
    .screenshot:last-child {
        border-bottom: none;
    }

    @media (max-width: 640px) {
        .legal-container { margin: 1rem; padding: 1.5rem; }
        .title { font-size: 1.8rem; }
        .info-grid { grid-template-columns: 1fr; }
    }
</style>