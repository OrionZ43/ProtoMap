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
    <h1 class="title font-display">{$t('terms.title')}</h1>
    <p class="subtitle">{$t('terms.subtitle')}</p>

    <div class="content-text">

        <!-- === DISCLAIMER (ГЛАВНЫЙ) === -->
        <div class="disclaimer-box warning">
            <strong class="font-display text-lg">{$t('terms.disclaimer_block.title')}</strong>
            <p class="mt-2 text-sm">{@html $t('terms.disclaimer_block.text')}</p>
        </div>

        <!-- === 1. INTRO & LICENSE === -->
        <h3 class="section-title">{$t('terms.intro_chapter.title')}</h3>

        <h4 class="subsection-title">{$t('terms.intro_chapter.definitions_title')}</h4>
        <p>{$t('terms.intro_chapter.definitions_text')}</p>
        <ul>
            {#each $t('terms.intro_chapter.definitions_list') as item} <li>{@html item}</li> {/each}
        </ul>
        <p class="mt-2">{$t('terms.intro_chapter.scope_text')}</p>

        <h4 class="subsection-title">{$t('terms.intro_chapter.acceptance_title')}</h4>
        <p>{$t('terms.intro_chapter.acceptance_text')}</p>
        <ul>
            {#each $t('terms.intro_chapter.acceptance_list') as item} <li>{@html item}</li> {/each}
        </ul>
        <div class="alert-box error mt-4 font-bold text-center">
            {$t('terms.intro_chapter.rejection_warning')}
        </div>

        <h4 class="subsection-title">{$t('terms.intro_chapter.license_title')}</h4>
        <p>{$t('terms.intro_chapter.license_text')}</p>

        <!-- === 2. BEHAVIOR (CODE OF CONDUCT) === -->
        <h3 class="section-title">{$t('terms.behavior_chapter.title')}</h3>

        <h4 class="subsection-title">{$t('terms.behavior_chapter.ugc_title')}</h4>
        <p>{$t('terms.behavior_chapter.ugc_text')}</p>
        <ul>
            {#each $t('terms.behavior_chapter.ugc_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title text-red-400">{$t('terms.behavior_chapter.zero_tolerance_title')}</h4>
        <p>{$t('terms.behavior_chapter.zero_tolerance_text')}</p>
        <ul>
            {#each $t('terms.behavior_chapter.zero_tolerance_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.behavior_chapter.stickers_title')}</h4>
        <p>{$t('terms.behavior_chapter.stickers_text')}</p>
        <ul>
            {#each $t('terms.behavior_chapter.stickers_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.behavior_chapter.tech_abuse_title')}</h4>
        <p>{$t('terms.behavior_chapter.tech_abuse_text')}</p>
        <ul>
            {#each $t('terms.behavior_chapter.tech_abuse_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.behavior_chapter.enforcement_title')}</h4>
        <p>{$t('terms.behavior_chapter.enforcement_text')}</p>
        <ul>
            {#each $t('terms.behavior_chapter.enforcement_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <!-- === 3. VIRTUAL ASSETS === -->
        <h3 class="section-title">{$t('terms.virtual_chapter.title')}</h3>

        <h4 class="subsection-title">{$t('terms.virtual_chapter.currency_title')}</h4>
        <p>{$t('terms.virtual_chapter.currency_text')}</p>
        <ul>
            {#each $t('terms.virtual_chapter.currency_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.virtual_chapter.casino_title')}</h4>
        <p>{$t('terms.virtual_chapter.casino_text')}</p>
        <ul>
            {#each $t('terms.virtual_chapter.casino_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.virtual_chapter.rmt_title')}</h4>
        <p>{$t('terms.virtual_chapter.rmt_text')}</p>
        <div class="alert-box error mt-2">
            <p>{$t('terms.virtual_chapter.rmt_warning')}</p>
        </div>

        <h4 class="subsection-title">{$t('terms.virtual_chapter.management_title')}</h4>
        <p>{$t('terms.virtual_chapter.management_text')}</p>
        <ul>
            {#each $t('terms.virtual_chapter.management_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <!-- === 4. WARRANTIES (AS IS) === -->
        <h3 class="section-title">{$t('terms.warranty_chapter.title')}</h3>

        <h4 class="subsection-title">{$t('terms.warranty_chapter.asis_title')}</h4>
        <p>{$t('terms.warranty_chapter.asis_text')}</p>
        <ul>
            {#each $t('terms.warranty_chapter.asis_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.warranty_chapter.real_world_title')}</h4>
        <p>{$t('terms.warranty_chapter.real_world_text')}</p>
        <ul>
            {#each $t('terms.warranty_chapter.real_world_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <!-- === 5. FINAL & EASTER EGG === -->
        <h3 class="section-title">{$t('terms.final_chapter.title')}</h3>

        <h4 class="subsection-title text-red-400">{$t('terms.final_chapter.termination_title')}</h4>
        <p>{$t('terms.final_chapter.termination_text')}</p>
        <ul>
            {#each $t('terms.final_chapter.termination_list') as item} <li>{@html item}</li> {/each}
        </ul>

        <h4 class="subsection-title">{$t('terms.final_chapter.updates_title')}</h4>
        <p>{$t('terms.final_chapter.updates_text')}</p>

        <h4 class="subsection-title">{$t('terms.final_chapter.severability_title')}</h4>
        <p>{$t('terms.final_chapter.severability_text')}</p>

        <!-- ПАСХАЛКА (FORCE MAJEURE) -->
        <div class="easter-egg-box mt-8">
            <h4 class="subsection-title text-purple-400">{$t('terms.final_chapter.easter_egg_title')}</h4>
            <p>{$t('terms.final_chapter.easter_egg_text')}</p>
            <ul>
                {#each $t('terms.final_chapter.easter_egg_list') as item} <li>{@html item}</li> {/each}
            </ul>
        </div>

        <!-- КОНТАКТЫ -->
        <h4 class="subsection-title">{$t('terms.final_chapter.contact_title')}</h4>
        <p>
            {$t('terms.final_chapter.contact_text')}
            <br>
            <a href="mailto:{$t('terms.final_chapter.contact_email')}" class="link text-xl font-bold">
                {$t('terms.final_chapter.contact_email')}
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

    /* Блоки предупреждений */
    .disclaimer-box, .alert-box {
        padding: 1rem;
        border-radius: 4px;
        margin-bottom: 1.5rem;
    }

    .disclaimer-box.warning, .alert-box.warning {
        background: rgba(252, 238, 10, 0.1);
        border: 1px solid var(--cyber-yellow, #fcee0a);
        color: #fff;
    }

    .alert-box.error {
        background: rgba(255, 0, 60, 0.1);
        border: 1px solid var(--cyber-red, #ff003c);
        color: #ffccd5;
    }

    /* Пасхалка */
    .easter-egg-box {
        background: rgba(189, 0, 255, 0.05);
        border: 1px dashed #bd00ff;
        padding: 1.5rem;
        border-radius: 8px;
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