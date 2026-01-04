<script lang="ts">
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { t } from 'svelte-i18n';
    import NeonButton from '$lib/components/NeonButton.svelte';

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => { opacity.set(1); });
</script>

<svelte:head>
    <title>Mobile Beta | ProtoMap</title>
</svelte:head>

<div class="beta-container page-container" style="opacity: {$opacity}">
    <div class="bg-blur-1"></div>

    <div class="content-panel cyber-panel">
        <h1 class="title font-display glitch" data-text={$t('beta.title')}>{$t('beta.title')}</h1>
        <p class="subtitle">{$t('beta.subtitle')}</p>

        <div class="intro-text">
            <p>{$t('beta.desc')}</p>
        </div>

        <div class="steps-grid">
            <!-- STEP 1 -->
            <div class="step-card">
                <div class="step-num">01</div>
                <h3 class="step-title">{$t('beta.step1_title')}</h3>
                <p class="step-desc">{$t('beta.step1_desc')}</p>
                <a href="https://groups.google.com/g/protomap-android-beta/" target="_blank" class="action-btn group-btn">
                    {$t('beta.btn_group')}
                </a>
            </div>

            <!-- ARROW (Desktop) -->
            <div class="arrow-container">
                <svg class="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
            </div>

            <!-- STEP 2 -->
            <div class="step-card highlight">
                <div class="step-num">02</div>
                <h3 class="step-title">{$t('beta.step2_title')}</h3>
                <p class="step-desc">{$t('beta.step2_desc')}</p>
                <a href="https://play.google.com/store/apps/details?id=by.iposdev.protomap" target="_blank" class="action-btn play-btn">
                    <!-- Google Play Icon -->
                    <svg class="w-6 h-6 mr-2" viewBox="0 0 512 512" fill="currentColor"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg>
                    {$t('beta.btn_download')}
                </a>
            </div>
        </div>

        <p class="footer-note">{$t('beta.footer')}</p>
    </div>
</div>

<style>
    .page-container {
        min-height: calc(100vh - 64px);
        display: flex; align-items: center; justify-content: center;
        padding: 2rem 1rem; position: relative; overflow: hidden;
    }
    .bg-blur-1 {
        position: absolute; top: 20%; left: 50%; transform: translateX(-50%);
        width: 300px; height: 300px; background: var(--cyber-cyan);
        filter: blur(150px); opacity: 0.2; z-index: 0;
    }

    .content-panel {
        max-width: 900px; width: 100%;
        padding: 3rem 2rem; z-index: 1; text-align: center;
    }

    .title { font-size: 2.5rem; color: #fff; margin-bottom: 0.5rem; }
    .subtitle { color: var(--cyber-yellow); font-family: 'Chakra Petch', monospace; font-weight: bold; letter-spacing: 0.1em; margin-bottom: 2rem; }
    .intro-text { font-size: 1.1rem; color: #ccc; max-width: 600px; margin: 0 auto 3rem auto; }

    .steps-grid {
        display: grid; grid-template-columns: 1fr auto 1fr; gap: 2rem; align-items: center;
    }

    .step-card {
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);
        padding: 2rem; border-radius: 12px; text-align: left;
        position: relative; transition: transform 0.3s, border-color 0.3s;
    }
    .step-card:hover { transform: translateY(-5px); border-color: var(--cyber-cyan); }
    .step-card.highlight { border-color: var(--cyber-green); background: rgba(57, 255, 20, 0.05); }
    .step-card.highlight:hover { border-color: #fff; box-shadow: 0 0 20px rgba(57, 255, 20, 0.2); }

    .step-num {
        font-size: 3rem; font-weight: 900; opacity: 0.1; position: absolute; top: 0; right: 1rem;
        font-family: 'Chakra Petch', monospace;
    }
    .step-title { font-weight: bold; color: #fff; margin-bottom: 0.5rem; font-family: 'Chakra Petch', monospace; }
    .step-desc { font-size: 0.9rem; color: #aaa; margin-bottom: 1.5rem; height: 3rem; }

    .action-btn {
        display: flex; align-items: center; justify-content: center;
        padding: 0.8rem 1rem; border-radius: 6px; font-weight: bold; font-family: 'Chakra Petch', monospace;
        text-decoration: none; transition: all 0.2s; font-size: 0.9rem;
    }
    .group-btn { border: 1px solid var(--cyber-cyan); color: var(--cyber-cyan); background: rgba(0, 243, 255, 0.1); }
    .group-btn:hover { background: var(--cyber-cyan); color: #000; box-shadow: 0 0 15px var(--cyber-cyan); }

    .play-btn { background: var(--cyber-green); color: #000; border: 1px solid var(--cyber-green); }
    .play-btn:hover { background: #fff; box-shadow: 0 0 20px var(--cyber-green); }

    .footer-note { margin-top: 3rem; color: #666; font-size: 0.8rem; }

    @media (max-width: 768px) {
        .steps-grid { grid-template-columns: 1fr; }
        .arrow-container { display: none; }
        .step-desc { height: auto; }
        .title { font-size: 2rem; }
    }
</style>