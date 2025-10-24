<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';
    import { Howl } from 'howler';

    export let username: string = 'НЕИЗВЕСТНЫЙ_УЗЕЛ';
    const dispatch = createEventDispatcher();

    type AnimationPhase = 'idle' | 'phase1_init' | 'phase2_breach' | 'phase3_analyze' | 'phase4_granted' | 'finished';
    let phase: AnimationPhase = 'idle';
    let mainLines: { text: string; glitch?: boolean; currentText: string }[] = [];
    let logLines: string[] = [];
    let progress = 0;
    let screenGlitch = false;

    let sound: Howl | null = null;
    let timeouts: NodeJS.Timeout[] = [];
    let intervals: NodeJS.Timeout[] = [];

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
        }, 50);
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

        timeouts.push(setTimeout(() => addLineAndType('> ИНИЦИАЛИЗАЦИЯ СОЕДИНЕНИЯ...'), 1000));
        timeouts.push(setTimeout(() => addLineAndType('> ЦЕЛЕВОЙ УЗЕЛ ИДЕНТИФИЦИРОВАН:'), 2000));
        timeouts.push(setTimeout(() => {
            addLineAndType(`> //: [${username}]`, true);
            triggerScreenGlitch();
        }, 3000));

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

            const logInterval = setInterval(() => {
                const logs = [
                    'ОБХОД ICE...', 'ЗАПРОС К КОРНЮ...', 'ОБНАРУЖЕНА УТЕЧКА ПАМЯТИ...',
                    'ПАТЧ ЯДРА ПРИМЕНЕН...', 'ПОДМЕНА УЧЕТНЫХ ДАННЫХ...', 'ДЕШИФРОВКА ПАКЕТА 0x7F...',
                    'NULL POINTER... ИГНОРИРУЕТСЯ.', 'ПЕРЕЗАПИСЬ ПРОТОКОЛОВ БЕЗОПАСНОСТИ...',
                    'ВНЕДРЕНИЕ ПОЛЕЗНОЙ НАГРУЗКИ...', 'УСТАНОВКА BACKDOOR...'
                ];
                addLog(logs[Math.floor(Math.random() * logs.length)]);
            }, 150);
            intervals.push(logInterval);
        }, 4500));

        timeouts.push(setTimeout(() => {
            phase = 'phase3_analyze';
            intervals.forEach(clearInterval);
            intervals = [];
            logLines = [];
            triggerScreenGlitch();

            timeouts.push(setTimeout(() => addLog('ТРАССИРОВКА ЗАВЕРШЕНА. АНАЛИЗ СИГНАТУРЫ...'), 200));
            timeouts.push(setTimeout(() => addLog('РАЗБОР НЕЙРОННЫХ МЕТАДАННЫХ...'), 1000));
            timeouts.push(setTimeout(() => addLog('ИЗВЛЕЧЕНИЕ ФРАГМЕНТОВ ПАМЯТИ...'), 2000));
        }, 6100));

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

<div class="loader-container" class:crt-off={phase === 'finished'} class:screen-glitch={screenGlitch} role="status" aria-live="polite">

    <div class="background-effects">
        <div class="matrix-rain"></div>
        <div class="grid-overlay"></div>
        <div class="scanline"></div>
        <div class="vignette"></div>
    </div>

    <div class="terminal-perspective">
        <div class="terminal">
            {#if phase === 'phase2_breach' || phase === 'phase3_analyze'}
                <div class="log-panel">
                    <h3 class="panel-title">//: СИСТЕМНЫЙ ЖУРНАЛ</h3>
                    {#each logLines as log, i}
                        <p class="log-line" style="opacity: {1 - i * 0.15}; transform: translateX({i * 5}px);">{log}</p>
                    {/each}
                </div>
            {/if}

            {#if phase === 'phase1_init'}
                <div class="main-terminal">
                    {#each mainLines as line}
                        <p class="line" class:glitch={line.glitch} data-text={line.text}>{line.currentText}<span class="caret"></span></p>
                    {/each}
                </div>
            {/if}

            {#if phase === 'phase2_breach'}
                 <div class="main-terminal breach-mode">
                    <div class="progress-bar-container">
                        <span class="progress-label glitch" data-text="ВЗЛОМ БРАНДМАУЭРА...">ВЗЛОМ БРАНДМАУЭРА...</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: {progress}%"></div>
                        </div>
                        <span class="progress-percent">{Math.floor(progress)}%</span>
                    </div>
                </div>
            {/if}

            {#if phase === 'phase4_granted'}
                <div class="granted-overlay">
                    <h1 class="granted-text glitch" data-text="ДОСТУП РАЗРЕШЕН">ДОСТУП РАЗРЕШЕН</h1>
                </div>
            {/if}
        </div>
    </div>

    <button class="skip-btn" on:click={skipAnimation}>[ ПРОПУСТИТЬ СЦЕНУ ]</button>
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
        0% { transform: translate(0, 0); }
        20% { transform: translate(-5px, 5px); }
        40% { transform: translate(5px, -5px); }
        60% { transform: translate(-5px, -5px); }
        80% { transform: translate(5px, 5px); }
        100% { transform: translate(0, 0); }
    }
    @keyframes matrix-scroll { from { background-position: 0 0; } to { background-position: 0 1000px; } }
    @keyframes glitch-anim { 0% { clip-path: inset(45% 0 50% 0); transform: translateX(-2px); } 100% { clip-path: inset(5% 0 90% 0); transform: translateX(2px); } }


    .loader-container {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: #050a05; color: #00ff41; font-family: 'Chakra Petch', monospace;
        display: flex; align-items: center; justify-content: center; z-index: 9999;
        overflow: hidden; perspective: 1000px;
    }
    .loader-container.crt-off { animation: crt-off-anim 0.8s cubic-bezier(0.755, 0.05, 0.855, 0.06) forwards; }
    .loader-container.screen-glitch { animation: screen-shake 0.15s linear infinite; filter: hue-rotate(90deg) contrast(1.5); }

    .background-effects { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    .matrix-rain {
        position: absolute; width: 100%; height: 100%; opacity: 0.15;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><text x="10" y="30" fill="%2300ff41" font-family="monospace" font-size="20">1</text><text x="50" y="70" fill="%2300ff41" font-family="monospace" font-size="20">0</text></svg>');
        animation: matrix-scroll 5s linear infinite;
    }
    .grid-overlay {
        position: absolute; width: 100%; height: 100%; opacity: 0.3;
        background-image: linear-gradient(rgba(0, 255, 65, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 65, 0.1) 1px, transparent 1px);
        background-size: 30px 30px;
    }
    .scanline {
        position: absolute; width: 100%; height: 100px;
        background: linear-gradient(to bottom, transparent, rgba(0, 255, 65, 0.1), transparent);
        animation: scanline-anim 4s linear infinite; opacity: 0.5;
    }
    .vignette {
        position: absolute; width: 100%; height: 100%;
        background: radial-gradient(circle, transparent 50%, black 150%);
    }

    .terminal-perspective { transform: rotateX(5deg); transform-style: preserve-3d; }
    .terminal {
        width: 90vw; max-width: 1200px; padding: 2rem;
        display: flex; justify-content: space-between; align-items: center;
        text-shadow: 0 0 5px rgba(0, 255, 65, 0.5);
    }

    .log-panel { width: 35%; font-size: 0.9rem; color: rgba(0, 255, 65, 0.7); }
    .panel-title { color: var(--cyber-yellow); margin-bottom: 1rem; border-bottom: 2px solid var(--cyber-yellow); display: inline-block; }
    .log-line { white-space: nowrap; overflow: hidden; margin-bottom: 0.3rem; font-family: 'Share Tech Mono', monospace; }

    .main-terminal { width: 60%; }
    .line { font-size: 1.8rem; margin-bottom: 1rem; white-space: pre; }
    .caret { display: inline-block; width: 12px; height: 1.8rem; background-color: #00ff41; animation: blink 0.8s step-end infinite; vertical-align: sub; }
    .breach-mode .progress-bar-container {
        border: 4px solid #00ff41; padding: 1rem; background: rgba(0,20,0,0.8);
        box-shadow: 0 0 30px rgba(0, 255, 65, 0.2);
    }
    .progress-label { font-size: 1.5rem; display: block; text-align: center; margin-bottom: 1rem; }
    .progress-bar { height: 40px; background: rgba(0, 255, 65, 0.1); border: 1px solid #00ff41; padding: 4px; }
    .progress-fill { height: 100%; background: #00ff41; box-shadow: 0 0 20px #00ff41; transition: width 0.1s linear; }
    .progress-percent { display: block; text-align: right; font-size: 2rem; margin-top: 0.5rem; }

    .granted-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
    }
    .granted-text {
        font-size: 8vw; color: var(--cyber-yellow);
        text-shadow: 0 0 50px var(--cyber-yellow), 0 0 20px #fff;
        animation: granted-flash 2s ease-out forwards;
    }

    .glitch { position: relative; color: var(--cyber-yellow, #fcee0a); }
    .glitch::before, .glitch::after {
        content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #050a05; overflow: hidden; clip-path: inset(0 0 0 0);
    }
    .glitch::before { text-shadow: -3px 0 #ff00c1; animation: glitch-anim 0.2s infinite linear alternate-reverse; left: 3px; }
    .glitch::after { text-shadow: 3px 0 #00f0ff; animation: glitch-anim 0.2s infinite linear alternate-reverse; left: -3px; animation-delay: 0.1s; }

    .skip-btn {
        position: fixed; bottom: 2rem; left: 2rem;
        background: rgba(0,0,0,0.5); border: 2px solid rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.5); padding: 0.8rem 1.5rem; font-weight: bold;
        font-family: 'Chakra Petch', monospace; cursor: pointer; transition: all 0.2s; z-index: 10000;
    }
    .skip-btn:hover { border-color: var(--cyber-red); color: var(--cyber-red); box-shadow: 0 0 15px var(--cyber-red); }

    @media (max-width: 768px) {
        .terminal {
            flex-direction: column;
            justify-content: center;
            width: 95vw;
            padding: 1rem;
        }

        .main-terminal {
            width: 100%;
            order: 1;
            margin-bottom: 2rem;
        }

        .log-panel {
            width: 100%;
            order: 2;
            font-size: 0.8rem;
            max-height: 25vh;
            overflow: hidden;
        }

        .line {
            font-size: 1.2rem;
            white-space: normal;
            word-break: break-all;
        }

        .progress-label {
            font-size: 1rem;
        }

        .progress-percent {
            font-size: 1.5rem;
        }

        .granted-text {
            font-size: 12vw;
        }
    }
</style>