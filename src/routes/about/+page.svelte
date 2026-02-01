<script lang="ts">
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { t } from 'svelte-i18n';

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => { opacity.set(1); });

    const testers = [
        {
            id: 'kess',
            username: 'Кесс Мирун',
            color: '#a855f7',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1766635490/protomap_avatars/Jjsi5AbW5iaRWN8b2JvejR73GHq2.webp'
        },
        {
            id: 'kuraga',
            username: 'kuraga',
            color: '#ff003c',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1765912349/protomap_avatars/t3KN8N2O6HWmHh2eK2DV9gNkIjO2.webp'
        },
        {
            id: 'artho',
            username: 'ARTHO',
            color: '#39ff14',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1764673819/protomap_avatars/KRyygW2X1NQnMdzGp7aUzBt1kYt1.webp'
        },
        {
            id: 'sarevus',
            username: 'sarevus',
            color: '#ffffff',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1764612207/protomap_avatars/42VXz0odbXObACimwupWb179HO42.webp'
        },
        {
            id: 'jokl',
            username: 'джокл',
            color: '#ffd700',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1750097263/protomap_avatars/Wg5wynJ63tYHXi9sHbk0g5qODI43.webp'
        },
        {
            id: 'mikhail',
            username: 'Anchor_play',
            color: '#00f3ff',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1763604687/protomap_avatars/UJQAvOKcO9Zwo4e7Nsy2kGdj0kv1.webp'
        },
        {
            id: 'bogdan',
            username: 'Nexus',
            color: '#ff5500',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1750888278/protomap_avatars/D6e7GrJFSZWYfcAyYV9TFXpXnUi1.webp'
        },
        {
            id: 'moro',
            username: 'Moro (morovec)',
            color: '#ff0055',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1769692656/protomap_avatars/XXRqoTdjFZZYeouRKTFisxjEcZv1.webp'
        },
        {
            id: 'eridan',
            username: 'Eridan_Pallas',
            color: '#00e5ff',
            avatar: 'https://res.cloudinary.com/dzkypodvd/image/upload/v1769693430/protomap_avatars/I8DIGaxnO8MCveHTq8xloFNmJst1.webp'
        }
    ];

    function getProfileLink(username: string) {
        return `/profile/${encodeURIComponent(username)}`;
    }
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

        <div class="team-section">
            <h3 class="section-title">{$t('about_page.team_title')}</h3>

            <div class="team-grid">
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

        <div class="testers-section">
            <h3 class="section-title">{$t('about_page.testers_title')}</h3>
            <div class="testers-grid">
                {#each testers as tester}
                    <a href={getProfileLink(tester.username)} class="tester-card" target="_blank">
                        <img
                            src={tester.avatar.includes('http') ? tester.avatar : `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(tester.username)}`}
                            alt={tester.username}
                            class="tester-avatar"
                            style="border-color: {tester.color}; box-shadow: 0 0 10px {tester.color};"
                        >
                        <div class="tester-info">
                            <span class="tester-name" style="color: {tester.color}">{tester.username}</span>
                            <span class="tester-role">{$t(`about_page.testers.${tester.id}.role`)}</span>
                            <p class="tester-desc">{$t(`about_page.testers.${tester.id}.desc`)}</p>
                        </div>
                    </a>
                {/each}
            </div>
        </div>

        <hr class="separator" />

        <div class="species-text-section text-center mb-8">
            <h3 class="section-title">{$t('about_page.species_title')}</h3>
            <p class="text-gray-300">{@html $t('about_page.species_text')}</p>
        </div>

        <div class="origins-section">
            <h4 class="section-subtitle">{$t('about_page.origin_title')}</h4>

            <div class="team-grid origins-grid">
                <div class="team-card mini">
                    <div class="card-visual mini">
                        <div class="avatar-glow zor"></div>
                        <img
                            src="https://pbs.twimg.com/profile_images/1963918921490468864/b2zWH8ob_400x400.jpg"
                            alt="CoolKoinu"
                            class="team-avatar"
                        />
                    </div>
                    <div class="card-content">
                        <a href="https://x.com/CoolKoinu" target="_blank" class="name mini">CoolKoinu</a>
                        <p class="desc text-xs text-gray-500">{$t('about_page.credits_zor')}</p>
                    </div>
                </div>

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
                        <a href="https://x.com/VaderSan" target="_blank" class="name mini">Vader-San</a>
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
                <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid"> <g fill-rule="evenodd"> <path d="M128,0 C57.307,0 0,57.307 0,128 C0,198.693 57.307,256 128,256 C198.693,256 256,198.693 256,128 C256,57.307 198.693,0 128,0 Z" fill="#40B3E0"></path> <path d="M190.2826,73.6308 L167.4206,188.8978 C167.4206,188.8978 164.2236,196.8918 155.4306,193.0548 L102.6726,152.6068 L83.4886,143.3348 L51.1946,132.4628 C51.1946,132.4628 46.2386,130.7048 45.7586,126.8678 C45.2796,123.0308 51.3546,120.9528 51.3546,120.9528 L179.7306,70.5928 C179.7306,70.5928 190.2826,65.9568 190.2826,73.6308" fill="#FFFFFF"></path> <path d="M98.6178,187.6035 C98.6178,187.6035 97.0778,187.4595 95.1588,181.3835 C93.2408,175.3085 83.4888,143.3345 83.4888,143.3345 L161.0258,94.0945 C161.0258,94.0945 165.5028,91.3765 165.3428,94.0945 C165.3428,94.0945 166.1418,94.5735 163.7438,96.8115 C161.3458,99.0505 102.8328,151.6475 102.8328,151.6475" fill="#D2E5F1"></path> <path d="M122.9015,168.1154 L102.0335,187.1414 C102.0335,187.1414 100.4025,188.3794 98.6175,187.6034 L102.6135,152.2624" fill="#B5CFE4"></path> </g> </svg>
                <span>{$t('about_page.join_btn')}</span>
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

    .glitch { position: relative; }
    .glitch::before, .glitch::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(10,10,15,0.8); overflow: hidden; }
    .glitch::before { left: 2px; text-shadow: -1px 0 #ff00c1; animation: glitch-anim-1 2s infinite linear alternate-reverse; }
    .glitch::after { left: -2px; text-shadow: 1px 0 #00fff9; animation: glitch-anim-2 3s infinite linear alternate-reverse; }
    @keyframes glitch-anim-1 { 0% { clip-path: inset(20% 0 80% 0); } 100% { clip-path: inset(80% 0 20% 0); } }
    @keyframes glitch-anim-2 { 0% { clip-path: inset(10% 0 60% 0); } 100% { clip-path: inset(30% 0 10% 0); } }

    .content-text { font-size: 1.1rem; line-height: 1.8; color: #e2e8f0; }
    .intro-text { text-align: center; max-width: 90%; margin: 0 auto 3rem auto; font-weight: 300; }

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

    .team-card.mini { padding: 1.5rem; background: rgba(0,0,0,0.2); }
    .card-visual.mini { width: 80px; height: 80px; margin-bottom: 1rem; }
    .name.mini { font-size: 1.2rem; }

    .testers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 1.5rem;
    }
    .tester-card {
        background: rgba(20, 20, 25, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 1rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 1rem;
        transition: transform 0.2s, background 0.2s;
        text-decoration: none;
    }
    .tester-card:hover { transform: translateY(-3px); background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }

    .tester-avatar {
        width: 50px; height: 50px; border-radius: 50%; border: 2px solid #555; object-fit: cover; flex-shrink: 0;
    }
    .tester-info { display: flex; flex-direction: column; overflow: hidden; }
    .tester-name { font-weight: bold; font-size: 0.9rem; font-family: 'Chakra Petch', monospace; }
    .tester-role { font-size: 0.6rem; color: #666; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 2px; }
    .tester-desc { font-size: 0.75rem; color: #9ca3af; line-height: 1.2; }

    .card-visual { position: relative; width: 120px; height: 120px; margin-bottom: 1.5rem; }
    .team-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; position: relative; z-index: 1; border: 2px solid rgba(255,255,255,0.2); }

    .avatar-glow {
        position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px;
        border-radius: 50%; opacity: 0.5; filter: blur(20px); z-index: 0;
        animation: pulse-glow 3s infinite alternate;
    }
    .avatar-glow.orion { background: var(--cyber-yellow, #fcee0a); }
    .avatar-glow.ipos { background: #a855f7; }
    .avatar-glow.zor { background: #00f0ff; }
    .avatar-glow.synth { background: #ff5500; }

    @keyframes pulse-glow { 0% { opacity: 0.3; transform: scale(0.9); } 100% { opacity: 0.7; transform: scale(1.1); } }

    .role { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.15em; margin-bottom: 0.5rem; font-family: 'Chakra Petch', monospace; }
    .text-purple-400 { color: #c084fc; }

    .name { display: block; font-size: 1.8rem; font-weight: 800; color: #fff; text-decoration: none; margin-bottom: 0.5rem; transition: color 0.2s; }
    .name:hover { color: var(--cyber-yellow, #fcee0a); }

    .desc { font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; }

    .separator { border-top: 1px dashed rgba(255,255,255,0.1); margin: 3rem 0; }

    .join-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 0.75rem;
        padding: 1rem 2.5rem; background: transparent;
        border: 2px solid var(--cyber-cyan, #00f0ff); color: var(--cyber-cyan, #00f0ff);
        font-family: 'Chakra Petch', monospace; font-weight: bold; letter-spacing: 0.1em;
        transition: all 0.2s; text-decoration: none;
    }
    .join-btn:hover { background: var(--cyber-cyan, #00f0ff); color: #000; box-shadow: 0 0 20px var(--cyber-cyan, #00f0ff); transform: scale(1.05); }

    .tg-icon { width: 24px; height: 24px; }

    @media (max-width: 768px) {
        .about-container { margin: 1rem; padding: 1.5rem; }
        .title { font-size: 2rem; }
        .team-grid { grid-template-columns: 1fr; }
        .intro-text { max-width: 100%; }
        .origins-grid { grid-template-columns: 1fr 1fr; gap: 1rem; }
        .join-btn { padding: 0.8rem 1.5rem; font-size: 0.9rem; }
    }
</style>