<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';
    import { Howl } from 'howler';
    import { browser } from '$app/environment';

    // ИМПОРТ ЛОКАЛИЗАЦИИ
    import { t, getLocaleFromNavigator, locale } from 'svelte-i18n';
    // Нам нужно получить переводы как обычный объект, чтобы использовать их в таймерах
    import { get } from 'svelte/store';

    export let username: string = 'UNKNOWN_NODE';
    const dispatch = createEventDispatcher();

    // Логика Зимы
    let isWinter = false;
    if (browser) {
        const d = new Date();
        const m = d.getMonth();
        const day = d.getDate();
        if ((m === 10 && day >= 15) || m === 11 || (m === 0 && day <= 15)) {
            isWinter = true;
        }
    }

    type AnimationPhase = 'idle' | 'phase1_init' | 'phase2_breach' | 'phase3_analyze' | 'phase4_granted' | 'finished';
    let phase: AnimationPhase = 'idle';
    let mainLines: { text: string; glitch?: boolean; currentText: string }[] = [];
    let logLines: string[] = [];
    let progress = 0;
    let screenGlitch = false;

    let sound: Howl | null = null;
    let timeouts: NodeJS.Timeout[] = [];
    let intervals: NodeJS.Timeout[] = [];

    // Функция-хелпер для получения перевода внутри JS-логики
    // (так как $t реактивен, но внутри setTimeout нам нужно значение "здесь и сейчас")
    const translate = (key: string) => get(t)(key);
    const getArray = (key: string) => {
        // svelte-i18n возвращает массив как объект, если это JSON массив.
        // Но лучше просто запросить конкретные ключи или сделать хак.
        // ПРОЩЕ: Мы получим весь объект переводов и достанем массив.
        const messages = get(t)(key, { returnObjects: true });
        return Array.isArray(messages) ? messages : [];
    };

    function addLineAndType(text: string, glitch: boolean = false) {
        const lineIndex = mainLines.length;
        mainLines = [...mainLines, { text, glitch, currentText: '' }];

        let i = 0;
        const typingInterval = setInterval(() => {
            if (i < text.length) {
                mainLines[lineIndex].currentText += text.charAt(i);
                mainLines = mainLines;
                i++;
            } else {
                clearInterval(typingInterval);
            }
        }, 40);
        intervals.push(typingInterval);
    }

    function addLog(text: string) {
        logLines = [text, ...logLines].slice(0, 7);
    }

    function triggerScreenGlitch() {
        screenGlitch = true;
        setTimeout(() => screenGlitch = false, 150);
    }

    function skipAnimation() {
        if (phase === 'finished') return;
        phase = 'finished';
        timeouts.forEach(clearTimeout);
        intervals.forEach(clearInterval);
        sound?.fade(sound.volume(), 0, 300);
        setTimeout(() => sound?.stop(), 300);
        setTimeout(() => dispatch('finished'), 800);
    }

    onMount(() => {
        sound = new Howl({
            src: ['/sounds/long_maybe_for_loading_profile_anim.mp3'],
            volume: 0.8,
            onend: skipAnimation
        });
        sound.play();

        phase = 'phase1_init';

        // 1. ИНИЦИАЛИЗАЦИЯ
        const initText = isWinter ? translate('loader.winter_init') : translate('loader.init');
        const targetText = isWinter ? translate('loader.winter_target') : translate('loader.target');

        timeouts.push(setTimeout(() => addLineAndType(initText), 1000));
        timeouts.push(setTimeout(() => addLineAndType(targetText), 2000));
        timeouts.push(setTimeout(() => {
            addLineAndType(`> //: [${username}]`, true);
            triggerScreenGlitch();
        }, 3000));

        // 2. ВЗЛОМ (Логи)
        timeouts.push(setTimeout(() => {
            phase = 'phase2_breach';
            const progressInterval = setInterval(() => {
                progress += 2 + Math.random() * 5;
                if (Math.random() > 0.7) triggerScreenGlitch();
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(progressInterval);
                }
            }, 100);
            intervals.push(progressInterval);

            const logPool = isWinter ? getArray('loader.winter_logs') : getArray('loader.logs');

            if (logPool.length > 0) {
                const logInterval = setInterval(() => {
                    addLog(logPool[Math.floor(Math.random() * logPool.length)]);
                }, 150);
                intervals.push(logInterval);
            }
        }, 4500));

        // 3. АНАЛИЗ
        timeouts.push(setTimeout(() => {
            phase = 'phase3_analyze';
            intervals.forEach(clearInterval);
            intervals = [];
            logLines = [];
            triggerScreenGlitch();

            const analyzeTexts = isWinter
                ? getArray('loader.winter_analyze')
                : getArray('loader.analyze');

            if (analyzeTexts.length >= 3) {
                timeouts.push(setTimeout(() => addLog(analyzeTexts[0]), 200));
                timeouts.push(setTimeout(() => addLog(analyzeTexts[1]), 1000));
                timeouts.push(setTimeout(() => addLog(analyzeTexts[2]), 2000));
            }
        }, 6100));

        // 4. ДОСТУП
        timeouts.push(setTimeout(() => {
            phase = 'phase4_granted';
            mainLines = [];
            logLines = [];
            triggerScreenGlitch();
        }, 9000));

        timeouts.push(setTimeout(skipAnimation, 11000));

        return () => {
            timeouts.forEach(clearTimeout);
            intervals.forEach(clearInterval);
            sound?.stop();
        };
    });

    onDestroy(() => {
        timeouts.forEach(clearTimeout);
        intervals.forEach(clearInterval);
        sound?.stop();
    });
</script>

<div
    class="loader-container"
    class:crt-off={phase === 'finished'}
    class:screen-glitch={screenGlitch}
    class:winter-theme={isWinter}
    role="status"
    aria-live="polite"
>

    <div class="background-effects">
        {#if isWinter}
            <div class="snow-storm"></div> <!-- Если у тебя есть стили для этого, иначе оставь matrix -->
            <div class="frost-overlay"></div>
        {:else}
            <div class="matrix-rain"></div>
        {/if}
        <div class="grid-overlay"></div>
        <div class="scanline"></div>
        <div class="vignette"></div>
    </div>

    <div class="terminal-perspective">
        <div class="terminal">
            <!-- ЛОГИ -->
            {#if phase === 'phase2_breach' || phase === 'phase3_analyze'}
                <div class="log-panel">
                    <h3 class="panel-title">//: {isWinter ? $t('loader.winter_log_title') : $t('loader.log_title')}</h3>
                    {#each logLines as log, i}
                        <p class="log-line" style="opacity: {1 - i * 0.15}; transform: translateX({i * 5}px);">{log}</p>
                    {/each}
                </div>
            {/if}

            <!-- ГЛАВНЫЙ ТЕРМИНАЛ -->
            {#if phase === 'phase1_init'}
                <div class="main-terminal">
                    {#each mainLines as line}
                        <p class="line" class:glitch={line.glitch} data-text={line.text}>{line.currentText}<span class="caret"></span></p>
                    {/each}
                </div>
            {/if}

            <!-- ПРОГРЕСС БАР -->
            {#if phase === 'phase2_breach'}
                 <div class="main-terminal breach-mode">
                    <div class="progress-bar-container">
                        <span class="progress-label glitch"
                              data-text={isWinter ? $t('loader.winter_breach') : $t('loader.breach')}>
                            {isWinter ? $t('loader.winter_breach') : $t('loader.breach')}
                        </span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: {progress}%"></div>
                        </div>
                        <span class="progress-percent">{Math.floor(progress)}%</span>
                    </div>
                </div>
            {/if}

            <!-- ФИНАЛ -->
            {#if phase === 'phase4_granted'}
                <div class="granted-overlay">
                    <h1 class="granted-text glitch"
                        data-text={isWinter ? $t('loader.winter_granted') : $t('loader.granted')}>
                        {isWinter ? $t('loader.winter_granted') : $t('loader.granted')}
                    </h1>
                </div>
            {/if}
        </div>
    </div>

    <button class="skip-btn" on:click={skipAnimation}>{$t('loader.skip')}</button>
</div>

<style>
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes scanline-anim { 0% { transform: translateY(-100vh); } 100% { transform: translateY(100vh); } }
    @keyframes granted-flash { 0% { opacity: 0; transform: scale(0.8); filter: blur(10px); } 10% { opacity: 1; transform: scale(1); filter: blur(0px); } 80% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes crt-off-anim {
        0% { transform: scale(1, 1); filter: brightness(1); }
        40% { transform: scale(1, 0.005); filter: brightness(3); }
        100% { transform: scale(0, 0); filter: brightness(0); }
    }
    @keyframes screen-shake {
        0% { transform: translate(0, 0); } 20% { transform: translate(-5px, 5px); } 40% { transform: translate(5px, -5px); } 60% { transform: translate(-5px, -5px); } 80% { transform: translate(5px, 5px); } 100% { transform: translate(0, 0); }
    }
    @keyframes matrix-scroll { from { background-position: 0 0; } to { background-position: 0 1000px; } }
    @keyframes glitch-anim { 0% { clip-path: inset(45% 0 50% 0); transform: translateX(-2px); } 100% { clip-path: inset(5% 0 90% 0); transform: translateX(2px); } }

    @keyframes snow-fall-anim { from { background-position: 0 0; } to { background-position: 50px 500px; } }
    @keyframes frost-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }

    .loader-container {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: #050a05;
        color: #00ff41;
        --primary-color: #00ff41;
        --secondary-color: #00ff41;

        font-family: 'Chakra Petch', monospace;
        display: flex; align-items: center; justify-content: center; z-index: 9999;
        overflow: hidden; perspective: 1000px;
    }

    .loader-container.winter-theme {
        background-color: #02050a;
        color: #00f3ff; /* Cyan */
        --primary-color: #00f3ff;
        --secondary-color: #ffffff;
    }

    .loader-container.crt-off { animation: crt-off-anim 0.8s cubic-bezier(0.755, 0.05, 0.855, 0.06) forwards; }
    .loader-container.screen-glitch { animation: screen-shake 0.15s linear infinite; filter: hue-rotate(90deg) contrast(1.5); }
    .background-effects { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }

    .matrix-rain {
        position: absolute; width: 100%; height: 100%; opacity: 0.15;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><text x="10" y="30" fill="%2300ff41" font-family="monospace" font-size="20">1</text><text x="50" y="70" fill="%2300ff41" font-family="monospace" font-size="20">0</text></svg>');
        animation: matrix-scroll 5s linear infinite;
    }

    .snow-storm {
        position: absolute; width: 100%; height: 100%; opacity: 0.3;
        background-image:
            radial-gradient(2px 2px at 20px 30px, #fff, transparent),
            radial-gradient(1px 1px at 100px 150px, #00f3ff, transparent);
        background-size: 300px 300px;
        animation: snow-fall-anim 10s linear infinite;
    }

    .frost-overlay {
        position: absolute; width: 100%; height: 100%;
        box-shadow: inset 0 0 150px rgba(0, 243, 255, 0.3);
        background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E");
        opacity: 0.5;
        animation: frost-pulse 5s infinite ease-in-out;
    }

    .grid-overlay {
        position: absolute; width: 100%; height: 100%; opacity: 0.3;
        background-image: linear-gradient(rgba(0, 255, 65, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 65, 0.1) 1px, transparent 1px);
        background-size: 30px 30px;
    }
    .winter-theme .grid-overlay {
        background-image: linear-gradient(rgba(0, 243, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 243, 255, 0.1) 1px, transparent 1px);
    }

    .scanline {
        position: absolute; width: 100%; height: 100px;
        background: linear-gradient(to bottom, transparent, var(--primary-color), transparent);
        opacity: 0.1;
        animation: scanline-anim 4s linear infinite;
    }
    .vignette {
        position: absolute; width: 100%; height: 100%;
        background: radial-gradient(circle, transparent 50%, black 150%);
    }

    .terminal-perspective { transform: rotateX(5deg); transform-style: preserve-3d; }
    .terminal {
        width: 90vw; max-width: 1200px; padding: 2rem;
        display: flex; justify-content: space-between; align-items: center;
        text-shadow: 0 0 5px var(--primary-color);
    }

    .log-panel { width: 35%; font-size: 0.9rem; color: var(--primary-color); opacity: 0.8; }
    .panel-title { color: var(--secondary-color); margin-bottom: 1rem; border-bottom: 2px solid var(--secondary-color); display: inline-block; }
    .log-line { white-space: nowrap; overflow: hidden; margin-bottom: 0.3rem; font-family: 'Share Tech Mono', monospace; }

    .main-terminal { width: 60%; }
    .line { font-size: 1.8rem; margin-bottom: 1rem; white-space: pre; color: var(--primary-color); }
    .caret { display: inline-block; width: 12px; height: 1.8rem; background-color: var(--primary-color); animation: blink 0.8s step-end infinite; vertical-align: sub; }
    .breach-mode .progress-bar-container {
        border: 4px solid var(--primary-color); padding: 1rem; background: rgba(0,20,0,0.8);
        box-shadow: 0 0 30px rgba(0, 255, 65, 0.2);
    }
    .winter-theme .breach-mode .progress-bar-container {
        background: rgba(0,10,20,0.8);
        box-shadow: 0 0 30px rgba(0, 243, 255, 0.2);
    }

    .progress-label { font-size: 1.5rem; display: block; text-align: center; margin-bottom: 1rem; color: var(--primary-color); }
    .progress-bar { height: 40px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--primary-color); padding: 4px; }
    .progress-fill { height: 100%; background: var(--primary-color); box-shadow: 0 0 20px var(--primary-color); transition: width 0.1s linear; }
    .progress-percent { display: block; text-align: right; font-size: 2rem; margin-top: 0.5rem; color: var(--secondary-color); }

    .granted-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
    }
    .granted-text {
        font-size: 8vw; color: var(--secondary-color);
        text-shadow: 0 0 50px var(--secondary-color), 0 0 20px var(--primary-color);
        animation: granted-flash 2s ease-out forwards;
    }

    .glitch { position: relative; color: var(--secondary-color); }
    .glitch::before, .glitch::after {
        content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #050a05; overflow: hidden; clip-path: inset(0 0 0 0);
    }
    .winter-theme .glitch::before, .winter-theme .glitch::after { background: #02050a; }

    .glitch::before { text-shadow: -3px 0 #ff00c1; animation: glitch-anim 0.2s infinite linear alternate-reverse; left: 3px; }
    .glitch::after { text-shadow: 3px 0 #00f0ff; animation: glitch-anim 0.2s infinite linear alternate-reverse; left: -3px; animation-delay: 0.1s; }

    .skip-btn {
        position: fixed; bottom: 5rem; left: 2rem;
        background: rgba(0,0,0,0.5); border: 2px solid rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.5); padding: 0.8rem 1.5rem; font-weight: bold;
        font-family: 'Chakra Petch', monospace; cursor: pointer; transition: all 0.2s; z-index: 10000;
    }
    .skip-btn:hover { border-color: var(--primary-color); color: var(--primary-color); box-shadow: 0 0 15px var(--primary-color); }

    @media (max-width: 768px) {
        .terminal { flex-direction: column; justify-content: center; width: 95vw; padding: 1rem; }
        .main-terminal { width: 100%; order: 1; margin-bottom: 2rem; }
        .log-panel { width: 100%; order: 2; font-size: 0.8rem; max-height: 25vh; overflow: hidden; }
        .line { font-size: 1.2rem; white-space: normal; word-break: break-all; }
        .progress-label { font-size: 1rem; }
        .progress-percent { font-size: 1.5rem; }
        .granted-text { font-size: 12vw; }
    }
</style>