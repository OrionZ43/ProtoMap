<script lang="ts">
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { t } from 'svelte-i18n';

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => { opacity.set(1); });
</script>

<svelte:head>
    <title>{$t('nav.about')} | ProtoMap</title>
</svelte:head>

<div class="about-container cyber-panel pb-12" style="opacity: {$opacity}">

    <header class="about-header">
        <h2 class="title font-display glitch" data-text={$t('about_page.title')}>{$t('about_page.title')}</h2>
    </header>

    <div class="content-text">
        <p class="mb-12 intro-text text-lg">
            {@html $t('about_page.intro')}
        </p>

        <!-- === КОМАНДА === -->
        <div class="team-section">
            <h3 class="section-title">{$t('about_page.team_title')}</h3>

            <div class="team-grid">
                <!-- ORION -->
                <div class="team-card">
                    <div class="card-visual">
                        <div class="avatar-glow orion"></div>
                        <img
                            src="https://res.cloudinary.com/dzkypodvd/image/upload/v1763571062/protomap_avatars/XT2NDfkr9wUFl3d1Eh6imTEdlxt2.webp"
                            alt="Orion_Z43"
                            class="team-avatar"
                        />
                    </div>
                    <div class="card-content">
                        <div class="role text-cyber-yellow">{$t('about_page.role_architect')}</div>
                        <a href="https://t.me/Orion_Z43" target="_blank" class="name">Orion_Z43</a>
                        <p class="desc">{$t('about_page.desc_orion')}</p>
                    </div>
                </div>

                <!-- IPOSDEV -->
                <div class="team-card">
                    <div class="card-visual">
                        <div class="avatar-glow ipos"></div>
                        <img
                            src="https://res.cloudinary.com/dzkypodvd/image/upload/v1763932736/protomap_avatars/IubBQqbHINYegxaX5vNvhXT0oz22.webp"
                            alt="iposdev"
                            class="team-avatar"
                        />
                    </div>
                    <div class="card-content">
                        <div class="role text-purple-400">{$t('about_page.role_mobile')}</div>
                        <a href="https://t.me/iposdev" target="_blank" class="name">iposdev</a>
                        <p class="desc">{$t('about_page.desc_ipos')}</p>
                    </div>
                </div>
            </div>
        </div>

        <hr class="separator" />

        <!-- === ВИДЫ (ТЕКСТ) === -->
        <div class="species-text-section text-center mb-8">
            <h3 class="section-title">{$t('about_page.species_title')}</h3>
            <p class="text-gray-300">{@html $t('about_page.species_text')}</p>
        </div>

        <!-- === СОЗДАТЕЛИ (АВАТАРКИ) === -->
        <div class="origins-section">
            <h4 class="section-subtitle">{$t('about_page.origin_title')}</h4>

            <div class="team-grid origins-grid">
                <!-- MALICE-RISU -->
                <div class="team-card mini">
                    <div class="card-visual mini">
                        <div class="avatar-glow zor"></div>
                        <img
                            src="https://dthezntil550i.cloudfront.net/a2/0004296348/43dfb232-1515-4823-8770-17bcc444f7e8.gif"
                            alt="Malice-Risu"
                            class="team-avatar"
                        />
                    </div>
                    <div class="card-content">
                        <a href="https://runes-of-the-arbiter.fandom.com/wiki/Zenith%27s_Outer_Reach" target="_blank" class="name mini">Malice-Risu</a>
                        <p class="desc text-xs text-gray-500">{$t('about_page.credits_zor')}</p>
                    </div>
                </div>

                <!-- VADER-SAN -->
                <div class="team-card mini">
                    <div class="card-visual mini">
                        <div class="avatar-glow synth"></div>
                        <img
                            src="https://pbs.twimg.com/profile_images/1806727408369725440/i9aR5_Nj_400x400.jpg"
                            alt="Vader-San"
                            class="team-avatar"
                        />
                    </div>
                    <div class="card-content">
                        <a href="https://synthspecies.com/" target="_blank" class="name mini">Vader-San</a>
                        <p class="desc text-xs text-gray-500">{$t('about_page.credits_synth')}</p>
                    </div>
                </div>
            </div>
        </div>

        <hr class="separator" />

        <div class="community-section text-center">
            <p class="mb-6 text-lg">
                {@html $t('about_page.community_text')}
            </p>
            <a href="https://t.me/proto_map" target="_blank" class="join-btn">
                {$t('about_page.join_btn')}
            </a>
            <p class="text-xs text-gray-500 mt-8 font-mono opacity-50">
                {$t('about_page.disclaimer')}
            </p>
        </div>
    </div>
</div>

<style>
    .about-container {
        max-width: 900px; margin: 3rem auto; padding: 3rem;
        background: rgba(10, 10, 15, 0.8);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
    }

    .about-header { text-align: center; margin-bottom: 2rem; }
    .title { font-size: 3rem; font-weight: bold; color: #fff; margin-bottom: 0.5rem; position: relative; display: inline-block; }

    /* Глитч на заголовке */
    .glitch { position: relative; }
    .glitch::before, .glitch::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(10,10,15,0.8); overflow: hidden; }
    .glitch::before { left: 2px; text-shadow: -1px 0 #ff00c1; animation: glitch-anim-1 2s infinite linear alternate-reverse; }
    .glitch::after { left: -2px; text-shadow: 1px 0 #00fff9; animation: glitch-anim-2 3s infinite linear alternate-reverse; }
    @keyframes glitch-anim-1 { 0% { clip-path: inset(20% 0 80% 0); } 100% { clip-path: inset(80% 0 20% 0); } }
    @keyframes glitch-anim-2 { 0% { clip-path: inset(10% 0 60% 0); } 100% { clip-path: inset(30% 0 10% 0); } }

    .content-text { font-size: 1.1rem; line-height: 1.8; color: #e2e8f0; }
    .intro-text { text-align: center; max-width: 90%; margin: 0 auto 3rem auto; font-weight: 300; }

    /* TEAM SECTION */
    .section-title {
        font-family: 'Chakra Petch', monospace; font-size: 1.5rem; font-weight: bold;
        color: var(--cyber-yellow, #fcee0a); margin-bottom: 2rem;
        text-align: center; letter-spacing: 0.1em;
        text-shadow: 0 0 10px rgba(252, 238, 10, 0.3);
    }
    .section-subtitle {
        font-family: 'Chakra Petch', monospace; font-size: 0.9rem; font-weight: bold;
        color: #64748b; margin-bottom: 1.5rem; text-align: center; letter-spacing: 0.1em;
        text-transform: uppercase;
    }

    .team-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }

    .team-card {
        background: rgba(255,255,255,0.03); padding: 2rem; border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.05); transition: transform 0.3s, border-color 0.3s, background 0.3s;
        display: flex; flex-direction: column; align-items: center; text-align: center;
        position: relative; overflow: hidden;
    }
    .team-card:hover { transform: translateY(-5px); border-color: var(--cyber-yellow, #fcee0a); background: rgba(255,255,255,0.05); }

    /* Compact cards for Origins */
    .team-card.mini { padding: 1.5rem; background: rgba(0,0,0,0.2); }
    .card-visual.mini { width: 80px; height: 80px; margin-bottom: 1rem; }
    .name.mini { font-size: 1.2rem; }

    /* АВАТАРЫ */
    .card-visual { position: relative; width: 120px; height: 120px; margin-bottom: 1.5rem; }
    .team-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; position: relative; z-index: 1; border: 2px solid rgba(255,255,255,0.2); }

    .avatar-glow {
        position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px;
        border-radius: 50%; opacity: 0.5; filter: blur(20px); z-index: 0;
        animation: pulse-glow 3s infinite alternate;
    }
    .avatar-glow.orion { background: var(--cyber-yellow, #fcee0a); }
    .avatar-glow.ipos { background: #a855f7; }
    .avatar-glow.zor { background: #00f0ff; } /* Голубой для ZOR */
    .avatar-glow.synth { background: #ff5500; } /* Оранжевый для Синтов */

    @keyframes pulse-glow { 0% { opacity: 0.3; transform: scale(0.9); } 100% { opacity: 0.7; transform: scale(1.1); } }

    .role { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.15em; margin-bottom: 0.5rem; font-family: 'Chakra Petch', monospace; }
    .text-purple-400 { color: #c084fc; }

    .name { display: block; font-size: 1.8rem; font-weight: 800; color: #fff; text-decoration: none; margin-bottom: 0.5rem; transition: color 0.2s; }
    .name:hover { color: var(--cyber-yellow, #fcee0a); }

    .desc { font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; }

    .separator { border-top: 1px dashed rgba(255,255,255,0.1); margin: 3rem 0; }

    .join-btn {
        display: inline-block; padding: 1rem 2.5rem; background: transparent;
        border: 2px solid var(--cyber-cyan, #00f0ff); color: var(--cyber-cyan, #00f0ff);
        font-family: 'Chakra Petch', monospace; font-weight: bold; letter-spacing: 0.1em;
        transition: all 0.2s; text-decoration: none;
    }
    .join-btn:hover { background: var(--cyber-cyan, #00f0ff); color: #000; box-shadow: 0 0 20px var(--cyber-cyan, #00f0ff); transform: scale(1.05); }

    @media (max-width: 768px) {
        .about-container { margin: 1rem; padding: 1.5rem; }
        .title { font-size: 2rem; }
        .team-grid { grid-template-columns: 1fr; }
        .intro-text { max-width: 100%; }
        .origins-grid { grid-template-columns: 1fr 1fr; gap: 1rem; } /* Два в ряд на мобилке для создателей */
    }
</style>