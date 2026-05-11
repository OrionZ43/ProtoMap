<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { locale, t } from 'svelte-i18n';
    import { spring } from 'svelte/motion';
    import { fade, fly } from 'svelte/transition';

    // ── Параллакс-состояние ──────────────────────────────────────────
    let mouseX = 0;
    let mouseY = 0;
    let ready  = false;

    // Spring для плавного слежения за курсором
    const cursor = spring({ x: 0, y: 0 }, { stiffness: 0.06, damping: 0.7 });

    function onMouseMove(e: MouseEvent) {
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;
        // нормализуем от -1 до +1
        cursor.set({
            x: (e.clientX - cx) / cx,
            y: (e.clientY - cy) / cy,
        });
    }

    // Для тач-устройств — гироскоп-имитация через DeviceOrientation
    function onDeviceOrientation(e: DeviceOrientationEvent) {
        const x = Math.max(-1, Math.min(1, (e.gamma || 0) / 30));
        const y = Math.max(-1, Math.min(1, (e.beta  || 0) / 30));
        cursor.set({ x, y });
    }

    onMount(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('deviceorientation', onDeviceOrientation);
        // небольшая задержка для анимации появления
        setTimeout(() => ready = true, 100);
    });
    onDestroy(() => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('deviceorientation', onDeviceOrientation);
    });

    // ── Конфигурация плавающих логотипов ────────────────────────────
    // depth: коэффициент сдвига (больше = дальше от центра, больше двигается)
    const LOGOS = [
        { id: 0,  x: -42, y: -38, size: 110, depth: 0.9, rot: -15, opacity: 0.85 },
        { id: 1,  x:  38, y: -45, size: 90,  depth: 1.3, rot:  20, opacity: 0.70 },
        { id: 2,  x: -52, y:  10, size: 75,  depth: 1.6, rot:  -8, opacity: 0.55 },
        { id: 3,  x:  52, y:  20, size: 105, depth: 1.1, rot:  12, opacity: 0.80 },
        { id: 4,  x: -28, y:  48, size: 80,  depth: 1.8, rot: -22, opacity: 0.50 },
        { id: 5,  x:  30, y:  50, size: 65,  depth: 2.0, rot:  18, opacity: 0.40 },
        { id: 6,  x:  55, y: -20, size: 58,  depth: 2.2, rot:  -5, opacity: 0.35 },
        { id: 7,  x: -55, y: -15, size: 62,  depth: 1.9, rot:  25, opacity: 0.45 },
    ];

    // Вычисляем transform для каждого логотипа
    function logoTransform(logo: typeof LOGOS[0], cx: number, cy: number) {
        const dx = cx * logo.depth * 28; // px сдвига
        const dy = cy * logo.depth * 20;
        const rz = cy * logo.depth * 4;  // лёгкий поворот
        return `translate(${dx}px, ${dy}px) rotate(${logo.rot + rz}deg)`;
    }

    // ── Локаль ───────────────────────────────────────────────────────
    $: isEn = $locale?.startsWith('en');
    $: phoneImg = isEn ? '/mobile/en1.png' : '/mobile/ru1.png';
</script>

<svelte:head>
    <title>{$t('beta.title')} | ProtoMap</title>
</svelte:head>

<div class="scene">

    <!-- ── Фон: градиентная сетка ─────────────────────────────────── -->
    <div class="bg-mesh"></div>
    <div class="bg-vignette"></div>

    <!-- ── Плавающие логотипы (параллакс-слой) ───────────────────── -->
    <div class="logos-layer" aria-hidden="true">
        {#each LOGOS as logo (logo.id)}
            {#if ready}
                <div
                    class="logo-float"
                    style="
                        left:    {50 + logo.x}%;
                        top:     {50 + logo.y}%;
                        width:   {logo.size}px;
                        height:  {logo.size}px;
                        opacity: {logo.opacity};
                        transform: {logoTransform(logo, $cursor.x, $cursor.y)};
                        animation-delay: {logo.id * 0.7}s;
                        animation-duration: {4.5 + logo.id * 0.4}s;
                    "
                    in:fade={{ delay: 300 + logo.id * 80, duration: 600 }}
                >
                    <!-- protogen_pin.svg инвертируем в белый через CSS filter -->
                    <img
                        src="/mobile/protogen_pin.svg"
                        alt=""
                        class="logo-img"
                        draggable="false"
                    />
                </div>
            {/if}
        {/each}
    </div>

    <!-- ── Центральный контент ────────────────────────────────────── -->
    <div class="content-layer">

        <!-- Левый текстовый блок -->
        {#if ready}
            <div class="text-left" in:fly={{ x: -40, duration: 700, delay: 200 }}>
                <div class="tag">{$t('beta.subtitle')}</div>
                <h1 class="headline">{$t('beta.title')}</h1>
                <p class="desc">{$t('beta.desc')}</p>

                <!-- Шаги -->
                <div class="steps">
                    <div class="step">
                        <span class="step-num">01</span>
                        <div>
                            <div class="step-title">{$t('beta.step1_title')}</div>
                            <div class="step-desc">{$t('beta.step1_desc')}</div>
                            <a
                                href="https://groups.google.com/g/protomap-android-beta/"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn btn-cyan"
                            >
                                {$t('beta.btn_group')}
                            </a>
                        </div>
                    </div>

                    <div class="step-divider"></div>

                    <div class="step">
                        <span class="step-num accent">02</span>
                        <div>
                            <div class="step-title">{$t('beta.step2_title')}</div>
                            <div class="step-desc">{$t('beta.step2_desc')}</div>
                            <a
                                href="https://play.google.com/store/apps/details?id=by.iposdev.protomap"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn btn-green"
                            >
                                <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor">
                                    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
                                </svg>
                                {$t('beta.btn_download')}
                            </a>
                        </div>
                    </div>
                </div>

                <p class="footer-note">{$t('beta.footer')}</p>
            </div>
        {/if}

        <!-- Телефон (параллакс, но меньше логотипов) -->
        {#if ready}
            <div
                class="phone-wrap"
                style="transform: translate(
                    {$cursor.x * -14}px,
                    {$cursor.y * -10}px
                ) rotateY({$cursor.x * -4}deg) rotateX({$cursor.y * 3}deg);"
                in:fly={{ y: 30, duration: 800, delay: 100 }}
            >
                <!-- Свечение под телефоном -->
                <div class="phone-glow"></div>
                <img
                    src={phoneImg}
                    alt="ProtoMap Android App"
                    class="phone-img"
                    draggable="false"
                />

                <!-- QR-код в углу -->
                <div class="qr-wrap">
                    <img src="/mobile/qr.svg" alt="QR Code" class="qr-img" />
                    <span class="qr-hint">SCAN ME</span>
                </div>
            </div>
        {/if}

    </div>

    <!-- ── Нижняя надпись ──────────────────────────────────────────── -->
    {#if ready}
        <div class="bottom-tagline" in:fade={{ delay: 900, duration: 600 }}>
            на твоём экране
        </div>
    {/if}

</div>

<style>
    /* ── Сцена ────────────────────────────────────────────────────── */
    .scene {
        position: relative;
        min-height: calc(100vh - 64px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #06100e;
        /* Запрещаем выделение текста при движении мыши */
        user-select: none;
        -webkit-user-select: none;
    }

    /* ── Фон ─────────────────────────────────────────────────────── */
    .bg-mesh {
        position: absolute;
        inset: 0;
        background:
            /* Основной цветовой туман */
            radial-gradient(ellipse at 30% 60%, rgba(0,180,160,0.18) 0%, transparent 55%),
            radial-gradient(ellipse at 75% 35%, rgba(0,240,200,0.10) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(0,100,80,0.15) 0%, transparent 45%),
            /* Тонкая сетка */
            linear-gradient(rgba(0,240,200,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,240,200,0.03) 1px, transparent 1px);
        background-size: 100% 100%, 100% 100%, 100% 100%, 50px 50px, 50px 50px;
        z-index: 0;
    }

    .bg-vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.75) 100%);
        z-index: 1;
        pointer-events: none;
    }

    /* ── Плавающие логотипы ──────────────────────────────────────── */
    .logos-layer {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
    }

    .logo-float {
        position: absolute;
        /* Центрируем сам элемент */
        margin-left: -50%;
        margin-top: -50%;
        will-change: transform;
        transition: transform 0.08s linear;
        /* Боб-анимация (медленное плавание) */
        animation: logo-bob ease-in-out infinite alternate;
    }

    .logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        /* Чёрный SVG → белый */
        filter: invert(1) drop-shadow(0 4px 16px rgba(0,0,0,0.5));
        pointer-events: none;
        -webkit-user-drag: none;
    }

    @keyframes logo-bob {
        from { translate: 0 0px; }
        to   { translate: 0 12px; }
    }

    /* ── Основной контент ─────────────────────────────────────────── */
    .content-layer {
        position: relative;
        z-index: 10;
        display: grid;
        grid-template-columns: 1fr 420px;
        gap: 4rem;
        align-items: center;
        max-width: 1100px;
        width: 100%;
        padding: 3rem 2rem;
    }

    /* ── Текст слева ──────────────────────────────────────────────── */
    .text-left {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .tag {
        font-family: 'Chakra Petch', monospace;
        font-size: 0.65rem;
        letter-spacing: 0.3em;
        color: rgba(0,240,200,0.65);
        text-transform: uppercase;
        margin-bottom: 0.75rem;
    }

    .headline {
        font-family: 'Chakra Petch', monospace;
        font-size: clamp(2rem, 4vw, 3.2rem);
        font-weight: 900;
        color: #fff;
        line-height: 1.05;
        letter-spacing: 0.04em;
        margin-bottom: 1.1rem;
        text-shadow: 0 0 40px rgba(0,240,200,0.2);
    }

    .desc {
        font-size: 0.9rem;
        color: rgba(255,255,255,0.55);
        line-height: 1.65;
        margin-bottom: 2rem;
        max-width: 380px;
    }

    /* ── Шаги ─────────────────────────────────────────────────────── */
    .steps {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-bottom: 1.5rem;
    }

    .step {
        display: flex;
        gap: 1.1rem;
        align-items: flex-start;
        padding: 1.25rem 0;
    }

    .step-divider {
        height: 1px;
        background: rgba(255,255,255,0.07);
        margin: 0;
    }

    .step-num {
        font-family: 'Chakra Petch', monospace;
        font-size: 2rem;
        font-weight: 900;
        color: rgba(255,255,255,0.1);
        line-height: 1;
        flex-shrink: 0;
        width: 2.4rem;
        text-align: right;
    }
    .step-num.accent { color: rgba(0,240,200,0.35); }

    .step-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 0.8rem;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.08em;
        margin-bottom: 0.3rem;
    }

    .step-desc {
        font-size: 0.78rem;
        color: rgba(255,255,255,0.45);
        line-height: 1.5;
        margin-bottom: 0.9rem;
    }

    /* ── Кнопки ───────────────────────────────────────────────────── */
    .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1.25rem;
        font-family: 'Chakra Petch', monospace;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-decoration: none;
        text-transform: uppercase;
        border-radius: 4px;
        transition: all 0.22s ease;
        clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);
    }

    .btn-cyan {
        background: transparent;
        border: 1px solid rgba(0,240,200,0.5);
        color: #00f0c8;
    }
    .btn-cyan:hover {
        background: rgba(0,240,200,0.12);
        border-color: #00f0c8;
        box-shadow: 0 0 18px rgba(0,240,200,0.25);
    }

    .btn-green {
        background: #39ff14;
        color: #000;
        border: none;
    }
    .btn-green:hover {
        background: #fff;
        box-shadow: 0 0 24px rgba(57,255,20,0.5);
    }

    .footer-note {
        font-size: 0.7rem;
        color: rgba(255,255,255,0.3);
        letter-spacing: 0.06em;
    }

    /* ── Телефон ──────────────────────────────────────────────────── */
    .phone-wrap {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        will-change: transform;
        transition: transform 0.12s linear;
        /* Перспектива для 3D-эффекта */
        transform-style: preserve-3d;
        perspective: 800px;
    }

    .phone-glow {
        position: absolute;
        bottom: -60px;
        left: 50%;
        transform: translateX(-50%);
        width: 220px;
        height: 60px;
        background: radial-gradient(ellipse, rgba(0,240,200,0.35) 0%, transparent 70%);
        filter: blur(20px);
        pointer-events: none;
    }

    .phone-img {
        width: 100%;
        max-width: 380px;
        height: auto;
        object-fit: contain;
        /* Тень телефона */
        filter: drop-shadow(0 30px 60px rgba(0,0,0,0.7)) drop-shadow(0 0 40px rgba(0,200,180,0.15));
        -webkit-user-drag: none;
    }

    /* ── QR-код ───────────────────────────────────────────────────── */
    .qr-wrap {
        position: absolute;
        bottom: 2rem;
        right: -1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 0.5rem;
        backdrop-filter: blur(8px);
    }

    .qr-img {
        width: 70px;
        height: 70px;
        filter: invert(1);
        opacity: 0.85;
    }

    .qr-hint {
        font-family: 'Chakra Petch', monospace;
        font-size: 0.45rem;
        color: rgba(255,255,255,0.4);
        letter-spacing: 0.2em;
    }

    /* ── Нижний tagline ───────────────────────────────────────────── */
    .bottom-tagline {
        position: absolute;
        bottom: 2rem;
        right: 3rem;
        font-family: 'Chakra Petch', monospace;
        font-size: clamp(1rem, 2.5vw, 1.6rem);
        font-weight: 900;
        color: #fff;
        opacity: 0.85;
        letter-spacing: 0.06em;
        pointer-events: none;
        z-index: 10;
    }

    /* ── Адаптив ──────────────────────────────────────────────────── */
    @media (max-width: 900px) {
        .content-layer {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto;
            gap: 2rem;
            padding: 2rem 1.25rem 5rem;
            text-align: center;
        }

        .text-left { align-items: center; }
        .desc { max-width: 100%; text-align: center; }

        .step { flex-direction: column; align-items: center; text-align: center; }
        .step-num { width: auto; text-align: center; }

        .phone-wrap {
            order: -1;
        }
        .phone-img { max-width: 260px; }

        .qr-wrap {
            bottom: -1rem;
            right: 0;
        }

        /* Логотипы на мобиле чуть прижимаем */
        .logo-float { opacity: 0.4 !important; }

        .bottom-tagline {
            bottom: 1rem;
            right: 1rem;
            font-size: 0.9rem;
        }
    }

    @media (max-width: 480px) {
        .phone-img { max-width: 200px; }
        .headline { font-size: 1.7rem; }
        .qr-wrap { display: none; }
    }
</style>