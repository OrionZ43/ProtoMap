<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { locale, t } from 'svelte-i18n';
    import { spring } from 'svelte/motion';
    import { fade, fly } from 'svelte/transition';

    // ── Параллакс-состояние ──────────────────────────────────────────
    let ready = false;

    // Размеры кадра нужны, чтобы посчитать, откуда голова «вылетает»
    // при взрыве (стартовая точка = центр кадра).
    let frameW = 0;
    let frameH = 0;

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

    // Для тач-устройств — гироскоп через DeviceOrientation
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

    // ── Летящие головы ──────────────────────────────────────────────
    // x/y — проценты ОТ КАДРА (.frame, до 1850px). |x| > 50 намеренно
    // вылезает за кадр и подрезается сценой — как в промо.
    //
    // ВАЖНО: три зоны кадра держим ЧИСТЫМИ, иначе текст не читается:
    //   • верх-лево  (x: -45..-4,  y: -55..-18) — слоган «Глобальная...»
    //   • низ-право  (x:   8..47,  y:  20..55)  — слоган «на твоём экране»
    //   • центр      (x: -12..12,  y: -40..45)  — телефон и кнопка
    const LOGOS = [
        // ── Верх-право ──
        { id: 0,  x:  24, y: -50, size: 290, depth: 0.7,  tilt:  18, opacity: 1.00 },
        { id: 1,  x:  47, y: -34, size: 260, depth: 0.85, tilt: -16, opacity: 0.98 },
        { id: 2,  x:  19, y: -26, size: 150, depth: 1.3,  tilt:  26, opacity: 0.78 },
        { id: 3,  x:  41, y: -10, size: 185, depth: 1.05, tilt:  -8, opacity: 0.90 },

        // ── Низ-лево ──
        { id: 4,  x: -28, y:  48, size: 285, depth: 0.75, tilt:  22, opacity: 1.00 },
        { id: 5,  x: -47, y:  30, size: 250, depth: 0.9,  tilt: -18, opacity: 0.96 },
        { id: 6,  x: -18, y:  26, size: 145, depth: 1.35, tilt: -26, opacity: 0.76 },
        { id: 7,  x: -39, y:   8, size: 180, depth: 1.1,  tilt:  10, opacity: 0.88 },

        // ── Края по вертикали ──
        { id: 8,  x: -49, y: -14, size: 130, depth: 1.5,  tilt:  14, opacity: 0.68 },
        { id: 9,  x:  49, y:  22, size: 140, depth: 1.45, tilt: -22, opacity: 0.72 },

        // ── Верх-центр (выше телефона) ──
        { id: 10, x:  -3, y: -54, size: 120, depth: 1.7,  tilt: -12, opacity: 0.62 },
        { id: 11, x:  10, y: -58, size: 100, depth: 1.9,  tilt:  20, opacity: 0.52 },

        // ── Низ-центр (ниже кнопки) ──
        { id: 12, x:   5, y:  58, size: 115, depth: 1.75, tilt:  16, opacity: 0.60 },
        { id: 13, x: -10, y:  60, size: 95,  depth: 2.0,  tilt: -20, opacity: 0.50 },
    ];

    // Центрирование делаем в transform: проценты тут считаются от размера
    // самого элемента. (В margin проценты считались бы от ШИРИНЫ родителя —
    // из-за этого раньше всё уезжало влево-вверх.)
    function logoTransform(logo: typeof LOGOS[0], cx: number, cy: number) {
        const dx = cx * logo.depth * 34; // px сдвига
        const dy = cy * logo.depth * 26;
        const rz = cy * logo.depth * 5;  // лёгкий доворот
        return `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${logo.tilt + rz}deg)`;
    }

    // Стартовая точка взрыва: голова стоит на left/top = 50+x %, значит
    // чтобы оказаться в центре кадра, её надо сместить на -x% ширины.
    function burstOffset(logo: typeof LOGOS[0]) {
        return {
            sx: -(logo.x / 100) * frameW,
            sy: -(logo.y / 100) * frameH,
        };
    }

    // ── Локаль ───────────────────────────────────────────────────────
    $: isEn = $locale?.startsWith('en');
    $: phoneImg = isEn ? '/mobile/en1.png' : '/mobile/ru1.png';
</script>

<svelte:head>
    <title>{$t('beta.title')} | ProtoMap</title>
    <!-- Фон — самый заметный элемент, тянем его в первую очередь -->
    <link rel="preload" as="image" href="/mobile/bg.jpg" />
</svelte:head>

<div class="scene">

    <!-- ── Фон ────────────────────────────────────────────────────── -->
    <!-- bg-mesh лежит ПОД фото: если картинка не загрузится, останется
         прежний градиент, а не чёрная дыра. -->
    <div class="bg-mesh"></div>

    <!-- Фото: самый дальний план, поэтому от курсора едет слабее всех
         (10px против 24-68px у голов) — так и рождается ощущение глубины.
         Плюс медленный дрейф с зумом (Ken Burns), чтобы фон «дышал». -->
    <div
        class="bg-photo"
        style="transform: translate({$cursor.x * 10}px, {$cursor.y * 7}px);"
    ></div>

    <!-- Тонировка: сажает фото в палитру сайта и глушит его, чтобы белые
         головы и текст читались. Крутить альфу здесь. -->
    <div class="bg-tint"></div>
    <div class="bg-grid"></div>
    <div class="bg-vignette"></div>

    <!-- ── Кадр: держит композицию плотной на любом мониторе ──────── -->
    <div class="frame" bind:clientWidth={frameW} bind:clientHeight={frameH}>

        <!-- Летящие головы (параллакс-слой) -->
        <div class="logos-layer" aria-hidden="true">
            {#each LOGOS as logo (logo.id)}
                {#if ready}
                    {@const off = burstOffset(logo)}
                    <!-- Внешний слой: позиция + параллакс + «боб».
                         Внутренний: анимация взрыва. Разделены, потому что
                         оба используют transform и иначе конфликтуют. -->
                    <div
                        class="logo-float"
                        style="
                            left:    {50 + logo.x}%;
                            top:     {50 + logo.y}%;
                            width:   calc({logo.size}px * var(--s));
                            height:  calc({logo.size}px * var(--s));
                            transform: {logoTransform(logo, $cursor.x, $cursor.y)};
                            animation-delay: {1.15 + logo.id * 0.25}s;
                            animation-duration: {5 + (logo.id % 5) * 0.9}s;
                        "
                    >
                        <!-- Взрыв одновременный: никакого animation-delay -->
                        <div
                            class="logo-burst"
                            style="
                                --sx: {off.sx}px;
                                --sy: {off.sy}px;
                                --op: {logo.opacity};
                            "
                        >
                            <img
                                src="/mobile/protogen_pin.svg"
                                alt=""
                                class="logo-img"
                                draggable="false"
                            />
                        </div>
                    </div>
                {/if}
            {/each}
        </div>

        <!-- Слоган сверху-слева -->
        {#if ready}
            <h1 class="tagline tagline-top" in:fly={{ x: -30, duration: 700, delay: 850 }}>
                {$t('beta.tagline_top')}
            </h1>
        {/if}

        <!-- Телефон + кнопка -->
        <div class="stage">
            {#if ready}
                <div
                    class="phone-wrap"
                    style="transform: translate(
                        {$cursor.x * -18}px,
                        {$cursor.y * -12}px
                    ) rotate(-14deg) rotateY({$cursor.x * -6}deg) rotateX({$cursor.y * 4}deg);"
                    in:fly={{ y: 30, duration: 800, delay: 100 }}
                >
                    <div class="phone-glow"></div>
                    <img
                        src={phoneImg}
                        alt="ProtoMap Android"
                        class="phone-img"
                        draggable="false"
                    />
                </div>

                <div class="cta" in:fly={{ y: 16, duration: 600, delay: 1000 }}>
                    <a
                        href="https://play.google.com/store/apps/details?id=by.iposdev.protomap"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn-green"
                    >
                        <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor">
                            <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
                        </svg>
                        {$t('beta.btn_download')}
                    </a>

                    <div class="qr-wrap">
                        <img src="/mobile/qr.svg" alt="QR" class="qr-img" />
                        <span class="qr-hint">SCAN ME</span>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Слоган снизу-справа -->
        {#if ready}
            <div class="tagline tagline-bottom" in:fade={{ delay: 1150, duration: 600 }}>
                {$t('beta.tagline_bottom')}
            </div>
        {/if}

    </div>
</div>

<style>
    /* ── Сцена ────────────────────────────────────────────────────── */
    .scene {
        position: relative;
        min-height: calc(100vh - 64px);
        display: flex;
        align-items: center;
        justify-content: center;
        /* Обрезает головы, вылезшие за кадр — это и даёт «стикеры под срез» */
        overflow: hidden;
        background: #06100e;
        user-select: none;
        -webkit-user-select: none;
    }

    /* ── Фон ─────────────────────────────────────────────────────── */
    /* Слои снизу вверх:                                               */
    /*   0  bg-mesh    — градиент-фолбэк (виден, если фото не грузится) */
    /*   0  bg-photo   — сама картинка: параллакс + дрейф               */
    /*   1  bg-tint    — тонировка под палитру + затемнение             */
    /*   1  bg-grid    — фирменная сетка                                */
    /*   1  bg-vignette— виньетка                                       */
    .bg-mesh {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse at 30% 60%, rgba(0,180,160,0.18) 0%, transparent 55%),
            radial-gradient(ellipse at 75% 35%, rgba(0,240,200,0.10) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(0,100,80,0.15) 0%, transparent 45%);
        background-size: 100% 100%;
        z-index: 0;
    }

    .bg-photo {
        position: absolute;
        inset: 0;
        background-image: url('/mobile/bg.jpg');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 0;
        pointer-events: none;
        will-change: transform, scale, translate;
        /* Параллакс приходит инлайном через transform.
           Дрейф едет через ОТДЕЛЬНЫЕ CSS-свойства scale/translate —
           они применяются независимо от transform, поэтому не конфликтуют.
           scale > 1 обязателен: даёт запас, чтобы при сдвиге не показались
           края картинки. */
        animation: bg-drift 34s ease-in-out infinite;
    }

    /* Медленное «дыхание» фона: зум + едва заметный увод */
    @keyframes bg-drift {
        0%   { scale: 1.14; translate: 0% 0%; }
        50%  { scale: 1.22; translate: -1.2% 0.9%; }
        100% { scale: 1.14; translate: 0% 0%; }
    }

    /* Тонировка. Здесь крутить, если фон слишком яркий/тусклый:
       первый градиент — зелёный тон, второй — общее затемнение. */
    .bg-tint {
        position: absolute;
        inset: 0;
        background:
            linear-gradient(180deg, rgba(0,70,58,0.30) 0%, rgba(0,24,20,0.45) 100%),
            radial-gradient(ellipse at 50% 45%, rgba(4,12,10,0.15) 0%, rgba(3,9,8,0.72) 100%);
        z-index: 1;
        pointer-events: none;
    }

    .bg-grid {
        position: absolute;
        inset: 0;
        background:
            linear-gradient(rgba(0,240,200,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,240,200,0.035) 1px, transparent 1px);
        background-size: 50px 50px;
        z-index: 1;
        pointer-events: none;
    }

    .bg-vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(0,0,0,0.8) 100%);
        z-index: 1;
        pointer-events: none;
    }

    /* ── Кадр ─────────────────────────────────────────────────────── */
    /* 1850px: шире, чем зона голов (они позиционируются в % и поэтому  */
    /* просто растянулись вместе с ним — координаты пересчитаны), зато   */
    /* слоганы уезжают дальше от центра, ближе к краям монитора.        */
    .frame {
        position: relative;
        z-index: 2;
        width: min(100%, 1850px);
        height: min(calc(100vh - 64px), 880px);
        --s: 1; /* глобальный масштаб голов */
    }

    /* ── Летящие головы ──────────────────────────────────────────── */
    .logos-layer {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
    }

    /* Внешний слой: позиция, параллакс (inline transform) и «боб».     */
    /* «Боб» едет через CSS-свойство translate — оно применяется         */
    /* отдельно от transform, поэтому параллакс не ломается.            */
    .logo-float {
        position: absolute;
        will-change: transform;
        transition: transform 0.08s linear;
        animation: logo-bob ease-in-out infinite alternate backwards;
    }

    /* Внутренний слой: только взрыв. Отдельный элемент нужен потому,   */
    /* что transform у внешнего уже занят параллаксом.                  */
    .logo-burst {
        width: 100%;
        height: 100%;
        opacity: var(--op);
        will-change: transform, opacity;
        /* cubic-bezier с забросом > 1 даёт лёгкий перелёт и посадку */
        animation: logo-burst 1.05s cubic-bezier(0.16, 0.9, 0.28, 1.28) backwards;
    }

    /* Стикер: белая заливка + чёрная обводка по контуру.               */
    /* invert(1) красит чёрный SVG в белый, следующие drop-shadow'ы     */
    /* с нулевым размытием рисуют контур с 4 сторон.                    */
    .logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter:
            invert(1)
            drop-shadow(2px 0 0 rgba(0,0,0,0.85))
            drop-shadow(-2px 0 0 rgba(0,0,0,0.85))
            drop-shadow(0 2px 0 rgba(0,0,0,0.85))
            drop-shadow(0 -2px 0 rgba(0,0,0,0.85));
        pointer-events: none;
        -webkit-user-drag: none;
    }

    /* Взрыв: из центра кадра (--sx/--sy), сжатые и закрученные, */
    /* разлетаются по местам. */
    @keyframes logo-burst {
        0% {
            transform: translate(var(--sx), var(--sy)) scale(0.08) rotate(-120deg);
            opacity: 0;
        }
        35% { opacity: var(--op); }
        100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            opacity: var(--op);
        }
    }

    @keyframes logo-bob {
        from { translate: 0 0px; }
        to   { translate: 0 16px; }
    }

    /* ── Слоганы ──────────────────────────────────────────────────── */
    .tagline {
        position: absolute;
        z-index: 12;
        margin: 0;
        /* Russo One, а не Chakra Petch: у Chakra Petch НЕТ кириллицы
           (subsets: latin, latin-ext, thai, vietnamese), поэтому русский
           текст падал в fallback-monospace, а латиница рисовалась самим
           Chakra Petch — отсюда разные шрифты в RU и EN.
           Russo One поддерживает и кириллицу, и латиницу. */
        font-family: 'Russo One', 'Chakra Petch', sans-serif;
        font-size: clamp(2rem, 3.6vw, 3.8rem);
        /* У Russo One единственный вес — 400. Ставить 900 нельзя:
           браузер синтезирует искусственный жир и буквы плывут. */
        font-weight: 400;
        line-height: 1.05;
        color: #fff;
        letter-spacing: 0.01em;
        /* Плотная многослойная тень: страховка, если голова заедет под текст */
        text-shadow:
            0 2px 10px rgba(0,0,0,0.95),
            0 4px 30px rgba(0,0,0,0.9),
            0 0 70px rgba(0,0,0,0.85),
            0 0 60px rgba(0,240,200,0.25);
        pointer-events: none;
    }

    /* Тёмная подложка под текстом — гарант читаемости поверх белых      */
    /* стикеров. z-index -1 держит её за буквами, но над головами.       */
    .tagline::before {
        content: '';
        position: absolute;
        inset: -2.5rem -4rem;
        background: radial-gradient(
            ellipse at center,
            rgba(2,8,6,0.92) 0%,
            rgba(2,8,6,0.65) 45%,
            transparent 75%
        );
        z-index: -1;
        pointer-events: none;
    }

    .tagline-top {
        top: 2rem;
        left: 2rem;
        max-width: 18ch;
    }

    .tagline-bottom {
        bottom: 2rem;
        right: 2rem;
        text-align: right;
        max-width: 18ch;
    }

    /* ── Телефон + кнопка ─────────────────────────────────────────── */
    .stage {
        position: absolute;
        inset: 0;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2rem;
        pointer-events: none;
    }
    .stage :global(a) { pointer-events: auto; }

    .phone-wrap {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        will-change: transform;
        transition: transform 0.12s linear;
        transform-style: preserve-3d;
        perspective: 900px;
    }

    .phone-glow {
        position: absolute;
        bottom: -50px;
        left: 50%;
        transform: translateX(-50%);
        width: 300px;
        height: 90px;
        background: radial-gradient(ellipse, rgba(0,240,200,0.4) 0%, transparent 70%);
        filter: blur(24px);
        pointer-events: none;
    }

    .phone-img {
        width: 100%;
        max-width: 400px;
        height: auto;
        object-fit: contain;
        filter: drop-shadow(0 40px 70px rgba(0,0,0,0.8)) drop-shadow(0 0 50px rgba(0,200,180,0.2));
        -webkit-user-drag: none;
    }

    /* ── CTA ──────────────────────────────────────────────────────── */
    .cta {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .btn-green {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        padding: 1rem 2.2rem;
        background: #39ff14;
        color: #000;
        border: none;
        /* Russo One: иначе «СКАЧАТЬ В» рисуется fallback-monospace,
           а «GOOGLE PLAY» — Chakra Petch, и в одной строке два шрифта. */
        font-family: 'Russo One', 'Chakra Petch', sans-serif;
        font-size: 0.85rem;
        font-weight: 400;
        letter-spacing: 0.14em;
        text-decoration: none;
        text-transform: uppercase;
        border-radius: 2px;
        clip-path: polygon(0 9px, 9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%);
        box-shadow: 0 0 34px rgba(57,255,20,0.3);
        transition: all 0.22s ease;
    }
    .btn-green:hover {
        background: #fff;
        box-shadow: 0 0 50px rgba(57,255,20,0.6);
        transform: translateY(-2px);
    }
    .btn-green:active { transform: translateY(0); }

    /* ── QR ───────────────────────────────────────────────────────── */
    .qr-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        padding: 0.7rem;
        backdrop-filter: blur(8px);
    }

    .qr-img {
        width: 104px;
        height: 104px;
        filter: invert(1);
        opacity: 0.9;
    }

    .qr-hint {
        font-family: 'Russo One', 'Chakra Petch', sans-serif;
        font-size: 0.55rem;
        color: rgba(255,255,255,0.45);
        letter-spacing: 0.2em;
    }

    /* ── Адаптив ──────────────────────────────────────────────────── */
    /* На узком экране абсолютное позиционирование не работает: слоганы */
    /* налезали на навбар, телефон и чат-виджет. Переводим всё в поток- */
    /* колонку, головы оставляем фоном.                                 */
    @media (max-width: 900px) {
        .scene {
            /* min-height обязателен: без него сцена схлопывается по    */
            /* контенту и снизу видно голый фон body.                   */
            min-height: calc(100vh - 64px);
            align-items: center;
            padding: 2rem 1.25rem 5rem;
        }

        .frame {
            --s: 0.4;
            width: 100%;
            height: auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1.75rem;
        }

        /* Головы уходят в фон и не спорят с контентом */
        .logos-layer {
            inset: -10% -12%;
            z-index: 0;
        }
        .logo-burst { opacity: 0.22 !important; }
        @keyframes logo-burst {
            0% {
                transform: translate(var(--sx), var(--sy)) scale(0.08) rotate(-120deg);
                opacity: 0;
            }
            35%, 100% {
                transform: translate(0, 0) scale(1) rotate(0deg);
                opacity: 0.22;
            }
        }

        /* Слоганы — в поток, по центру.
           order собирает разорванную фразу обратно: на десктопе она
           читается по диагонали (верх-лево → низ-право), а в колонке
           «на твоём экране» оказывалось ПОСЛЕ кнопки и фраза распадалась.
           Теперь: «Глобальная карта протогенов» + «на твоём экране»
           идут подряд как одно предложение, а CTA замыкает экран. */
        .tagline {
            position: static;
            text-align: center;
            max-width: 100%;
            font-size: clamp(1.5rem, 7vw, 2.2rem);
        }
        .tagline::before { display: none; }

        .tagline-top    { order: 1; }
        .tagline-bottom {
            order: 2;
            /* Подтягиваем вплотную — это вторая половина одной фразы,
               а не отдельный блок */
            margin-top: -1.25rem;
            color: rgba(255,255,255,0.75);
        }
        .stage { order: 3; }

        /* Телефон и кнопка — тоже в поток */
        .stage {
            position: static;
            gap: 1.5rem;
        }

        .phone-img { max-width: 220px; }
        .phone-glow { width: 190px; bottom: -30px; }

        .cta {
            flex-direction: column;
            gap: 0.9rem;
        }
    }

    @media (max-width: 480px) {
        .frame { --s: 0.3; }
        .phone-img { max-width: 190px; }
        .qr-wrap { display: none; }
        .btn-green {
            padding: 0.9rem 1.5rem;
            font-size: 0.72rem;
        }
    }

    /* Уважаем системную настройку «меньше движения».
       Дрейфующий фон — частый триггер укачивания, гасим его тоже. */
    @media (prefers-reduced-motion: reduce) {
        .logo-burst {
            animation: none;
            opacity: var(--op);
        }
        .logo-float { animation: none; }
        .bg-photo {
            animation: none;
            scale: 1.14;
        }
    }
</style>