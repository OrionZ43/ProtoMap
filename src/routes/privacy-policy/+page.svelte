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
    <title>{$t('privacy.title')} | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h1 class="title font-display">{$t('privacy.title')}</h1>
    <p class="subtitle">{$t('privacy.subtitle')}</p>

    <div class="content-text">

        <!-- === DISCLAIMER === -->
        <div class="disclaimer-box">
            <strong class="text-red-500 font-display text-lg">{$t('privacy.disclaimer_header')}</strong>
            <p class="mt-2 text-sm">{@html $t('privacy.disclaimer_body')}</p>
        </div>

        <!-- === 1. INTRO === -->
        <h3 class="section-title">{$t('privacy.intro_header')}</h3>
        <p>{@html $t('privacy.intro_body')}</p>

        <h4 class="subsection-title">{$t('privacy.consent_header')}</h4>
        <p>{@html $t('privacy.consent_body')}</p>

        <!-- === 2. DATA COLLECTION === -->
        <h3 class="section-title">{$t('privacy.data_chapter.title')}</h3>
        <p>{$t('privacy.data_chapter.intro')}</p>

        <h4 class="subsection-title">{$t('privacy.data_chapter.account_title')}</h4>
        <p>{$t('privacy.data_chapter.account_text')}</p>
        <ul>
            {#each $t('privacy.data_chapter.account_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('privacy.data_chapter.tech_title')}</h4>
        <p>{$t('privacy.data_chapter.tech_text')}</p>
        <ul>
            {#each $t('privacy.data_chapter.tech_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('privacy.data_chapter.chat_title')}</h4>
        <div class="alert-box warning">
            <p>{$t('privacy.data_chapter.chat_warning')}</p>
        </div>
        <ul>
            {#each $t('privacy.data_chapter.chat_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('privacy.data_chapter.sticker_title')}</h4>
        <p>{$t('privacy.data_chapter.sticker_text')}</p>
        <p class="text-xs text-gray-400 mt-2 border-l-2 border-gray-600 pl-2">
            {$t('privacy.data_chapter.sticker_dmca')}
        </p>

        <h4 class="subsection-title">{$t('privacy.data_chapter.game_title')}</h4>
        <p>{$t('privacy.data_chapter.game_text')}</p>
        <ul>
            {#each $t('privacy.data_chapter.game_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <!-- === 3. GEOLOCATION === -->
        <h3 class="section-title">{$t('privacy.geo_chapter.title')}</h3>
        <p>{$t('privacy.geo_chapter.intro')}</p>

        <h4 class="subsection-title">{$t('privacy.geo_chapter.modes_title')}</h4>
        <p>{$t('privacy.geo_chapter.modes_text')}</p>

        <div class="pl-4 border-l-2 border-cyber-cyan my-4">
            <strong class="text-cyber-cyan">{$t('privacy.geo_chapter.auto_mode_title')}</strong>
            <p class="text-sm my-2">{$t('privacy.geo_chapter.auto_mode_desc')}</p>
            <ul>
                {#each $t('privacy.geo_chapter.auto_mode_list') as item} <li>{@html item}</li> {/each}
            </ul>
        </div>

        <div class="pl-4 border-l-2 border-yellow-500 my-4">
            <strong class="text-yellow-500">{$t('privacy.geo_chapter.manual_mode_title')}</strong>
            <p class="text-sm my-2">{$t('privacy.geo_chapter.manual_mode_desc')}</p>
            <ul>
                {#each $t('privacy.geo_chapter.manual_mode_list') as item} <li>{@html item}</li> {/each}
            </ul>
        </div>

        <h4 class="subsection-title">{$t('privacy.geo_chapter.storage_title')}</h4>
        <ul>
            {#each $t('privacy.geo_chapter.storage_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <div class="alert-box error mt-4">
            <p>{$t('privacy.geo_chapter.safety_warning')}</p>
        </div>

        <!-- === 4. RIGHTS === -->
        <h3 class="section-title">{$t('privacy.rights_chapter.title')}</h3>
        <p>{$t('privacy.rights_chapter.intro')}</p>

        <h4 class="subsection-title">{$t('privacy.rights_chapter.edit_title')}</h4>
        <p>{$t('privacy.rights_chapter.edit_text')}</p>

        <h4 class="subsection-title text-red-400">{$t('privacy.rights_chapter.delete_title')}</h4>
        <p>{$t('privacy.rights_chapter.delete_desc')}</p>
        <p class="mt-2">{$t('privacy.rights_chapter.delete_consequences_intro')}</p>
        <ul>
            {#each $t('privacy.rights_chapter.delete_consequences_list') as item} <li>{@html item}</li> {/each}
        </ul>
        <p class="text-xs text-gray-500 italic mt-2">{$t('privacy.rights_chapter.anonymization_note')}</p>

        <h4 class="subsection-title">{$t('privacy.rights_chapter.export_title')}</h4>
        <p>{$t('privacy.rights_chapter.export_text')}</p>

        <!-- === 5. PARTNERS === -->
        <h3 class="section-title">{$t('privacy.partners_chapter.title')}</h3>
        <p>{$t('privacy.partners_chapter.intro')}</p>

        <h4 class="subsection-title">{$t('privacy.partners_chapter.infra_title')}</h4>
        <ul>
            {#each $t('privacy.partners_chapter.infra_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('privacy.partners_chapter.services_title')}</h4>
        <ul>
            {#each $t('privacy.partners_chapter.services_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('privacy.partners_chapter.legal_title')}</h4>
        <p>{$t('privacy.partners_chapter.legal_text')}</p>

        <!-- === 6. SECURITY === -->
        <h3 class="section-title">{$t('privacy.security_chapter.title')}</h3>
        <p>{$t('privacy.security_chapter.intro')}</p>

        <h4 class="subsection-title">{$t('privacy.security_chapter.measures_title')}</h4>
        <ul>
            {#each $t('privacy.security_chapter.measures_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title text-yellow-500">{$t('privacy.security_chapter.warranty_title')}</h4>
        <p>{$t('privacy.security_chapter.warranty_text')}</p>
        <ul>
            {#each $t('privacy.security_chapter.warranty_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <!-- === 7. CONTACTS === -->
        <h3 class="section-title">{$t('privacy.contact_chapter.title')}</h3>

        <h4 class="subsection-title">{$t('privacy.contact_chapter.changes_title')}</h4>
        <p>{$t('privacy.contact_chapter.changes_text')}</p>

        <h4 class="subsection-title">{$t('privacy.contact_chapter.contact_title')}</h4>
        <p>{$t('privacy.contact_chapter.contact_text')}</p>
        <p class="mt-4 border-t border-gray-700 pt-4">
            {$t('privacy.contact_chapter.email_label')} <br>
            <a href="mailto:{$t('privacy.contact_chapter.email_value')}" class="link text-xl font-bold">
                {$t('privacy.contact_chapter.email_value')}
            </a>
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
        padding: 1.5rem;
        margin-bottom: 2.5rem;
        color: #ffccd5;
        border-radius: 4px;
    }

    .alert-box {
        padding: 1rem;
        margin: 1rem 0;
        border-left: 4px solid;
        background: rgba(0, 0, 0, 0.2);
        font-size: 0.9rem;
    }
    .alert-box.warning {
        border-color: #facc15; /* Yellow */
        color: #fef08a;
    }
    .alert-box.error {
        border-color: #ef4444; /* Red */
        color: #fecaca;
    }

    .title {
        font-size: 2.5rem;
        font-weight: 700;
        text-align: center;
        color: #fff;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        text-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
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
        line-height: 1.7;
        color: #d1d5db;
    }

    .content-text p {
        margin-bottom: 1rem;
        text-align: justify;
    }

    .section-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        margin-top: 3.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.5rem;
        text-transform: uppercase;
    }

    .subsection-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.1rem;
        font-weight: 700;
        color: #fff;
        margin-top: 2rem;
        margin-bottom: 0.8rem;
    }

    .content-text ul {
        list-style-type: none;
        padding-left: 0.5rem;
        margin-bottom: 1.5rem;
    }

    .content-text li {
        position: relative;
        padding-left: 1.5rem;
        margin-bottom: 0.6rem;
        font-size: 0.95rem;
    }

    .content-text li::before {
        content: '>';
        position: absolute;
        left: 0;
        color: var(--cyber-yellow, #fcee0a);
        font-weight: bold;
        font-family: 'Chakra Petch', monospace;
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
        text-shadow: 0 0 10px var(--cyber-cyan);
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