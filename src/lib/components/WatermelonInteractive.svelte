<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { spring } from 'svelte/motion';
    import { fade, scale } from 'svelte/transition';
    import { elasticOut } from 'svelte/easing';

    // --- Настройки ---
    const CLICKS_TO_EXPLODE = 5;

    // --- Состояние ---
    let mounted = false;
    let clicks = 0;
    let isExploding = false;
    let screenShake = 0; // Интенсивность тряски экрана
    let flashOpacity = 0; // Белая вспышка

    // Позиция арбуза (используем spring для "прудинистости")
    const coords = spring({ x: 50, y: 50 }, {
        stiffness: 0.1,
        damping: 0.4
    });

    const rotation = spring(0, {
        stiffness: 0.1,
        damping: 0.6
    });

    const scaleSpring = spring(1, {
        stiffness: 0.2,
        damping: 0.3
    });

    // --- Система частиц ---
    type Particle = {
        id: number;
        x: number;
        y: number;
        vx: number;
        vy: number;
        rotation: number;
        vRotation: number;
        scale: number;
        emoji: string;
        life: number;
    };

    let particles: Particle[] = [];
    let shockwaves: { id: number, x: number, y: number }[] = [];
    let particleIdCounter = 0;
    let animationFrame: number;

    let moveInterval: any;

    onMount(() => {
        mounted = true;
        startFloating();
        loop(); // Запускаем цикл анимации частиц
    });

    onDestroy(() => {
        if (moveInterval) clearInterval(moveInterval);
        if (animationFrame) cancelAnimationFrame(animationFrame);
    });

    function startFloating() {
        moveInterval = setInterval(() => {
            if (clicks < CLICKS_TO_EXPLODE && !isExploding) {
                // Случайное перемещение
                coords.set({
                    x: Math.random() * 80 + 10,
                    y: Math.random() * 70 + 10
                });
                rotation.update(r => r + (Math.random() - 0.5) * 60);
            }
        }, 3000);
    }

    function loop() {
        // Обновляем физику частиц
        if (particles.length > 0) {
            particles = particles.filter(p => p.life > 0).map(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.5; // Гравитация
                p.rotation += p.vRotation;
                p.life -= 0.01;
                return p;
            });
        }

        // Затухание тряски экрана
        if (screenShake > 0) screenShake *= 0.9;
        if (screenShake < 0.5) screenShake = 0;

        // Затухание вспышки
        if (flashOpacity > 0) flashOpacity -= 0.05;

        animationFrame = requestAnimationFrame(loop);
    }

    async function handleClick(event: MouseEvent) {
        if (isExploding) return;

        clicks++;

        // Эффект нажатия
        scaleSpring.set(0.8).then(() => scaleSpring.set(1));
        rotation.update(r => r + 360);

        // Получаем точные координаты клика для эффектов
        const clientX = event.clientX;
        const clientY = event.clientY;

        if (clicks >= CLICKS_TO_EXPLODE) {
            triggerExplosion(clientX, clientY);
        } else {
            // Маленький эффект при обычном клике
            screenShake = 2 * clicks;
            spawnParticles(clientX, clientY, 3, ['💦', '✨']);
        }
    }

    function triggerExplosion(x: number, y: number) {
        isExploding = true;
        screenShake = 20; // Сильная тряска
        flashOpacity = 0.8; // Вспышка
        clicks = 0;

        // Создаем ударную волну
        shockwaves = [...shockwaves, { id: Date.now(), x, y }];
        setTimeout(() => shockwaves = [], 1000);

        // Спавним много частиц
        spawnParticles(x, y, 40, ['🍉', '🍉', '💔', '💥', '✨', '🔴', '🟩']);

        // Скрываем арбуз на время
        scaleSpring.set(0, { hard: true });

        // Возрождение арбуза
        setTimeout(() => {
            isExploding = false;
            scaleSpring.set(1);
            coords.set({ x: 50, y: 50 }); // Возврат в центр
        }, 2500);
    }

    function spawnParticles(x: number, y: number, count: number, emojis: string[]) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 15 + 5; // Разная скорость

            particles.push({
                id: particleIdCounter++,
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 5, // Чуть вверх изначально
                rotation: Math.random() * 360,
                vRotation: (Math.random() - 0.5) * 20,
                scale: Math.random() * 0.8 + 0.5,
                emoji: emojis[Math.floor(Math.random() * emojis.length)],
                life: 1.0 + Math.random() // Случайное время жизни
            });
        }
        // Очистка массива частиц, если он стал слишком большим
        if (particles.length > 200) particles = particles.slice(-100);
    }
</script>

{#if mounted}
    <!-- Контейнер с эффектом тряски (Screen Shake) -->
    <div
        class="global-container"
        style="transform: translate({(Math.random() - 0.5) * screenShake}px, {(Math.random() - 0.5) * screenShake}px)"
    >
        <!-- Белая вспышка -->
        <div class="flash-overlay" style="opacity: {flashOpacity};"></div>

        <!-- Ударные волны -->
        {#each shockwaves as wave (wave.id)}
            <div
                class="shockwave"
                style="left: {wave.x}px; top: {wave.y}px;"
            ></div>
        {/each}

        <!-- Плавающий арбуз -->
        {#if !isExploding}
            <button
                class="watermelon-float"
                class:angry={clicks > 2}
                style="
                    left: {$coords.x}%;
                    top: {$coords.y}%;
                    transform: translate(-50%, -50%) rotate({$rotation}deg) scale({$scaleSpring});
                    --pulse-speed: {1 - (clicks * 0.15)}s;
                "
                on:click={handleClick}
                transition:scale
            >
                <div class="watermelon-emoji">🍉</div>

                {#if clicks > 0}
                    <div class="click-badge" transition:scale={{ duration: 200, easing: elasticOut }}>
                        {clicks}
                    </div>
                {/if}

                <!-- Аура ярости при приближении к взрыву -->
                {#if clicks >= 3}
                    <div class="rage-aura"></div>
                {/if}
            </button>
        {/if}

        <!-- Частицы (отрисовываем прямо в DOM для простоты) -->
        {#each particles as p (p.id)}
            <div
                class="particle"
                style="
                    left: {p.x}px;
                    top: {p.y}px;
                    transform: translate(-50%, -50%) rotate({p.rotation}deg) scale({p.scale});
                    opacity: {p.life};
                "
            >
                {p.emoji}
            </div>
        {/each}
    </div>
{/if}

<style>
    .global-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none; /* Пропускает клики сквозь фон на элементы под ним */
        z-index: 50;
        overflow: hidden; /* Теперь частицы обрезаются здесь, а не на всей странице */
    }

    .flash-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        pointer-events: none;
        z-index: 100;
        mix-blend-mode: overlay;
    }

    .watermelon-float {
        position: absolute;
        width: 80px;
        height: 80px;
        background: none;
        border: none;
        cursor: pointer;
        pointer-events: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 60;
        outline: none;
        /* Убираем дефолтное выделение на мобильных */
        -webkit-tap-highlight-color: transparent;
    }

    .watermelon-emoji {
        font-size: 70px;
        filter: drop-shadow(0 10px 15px rgba(0,0,0,0.3));
        transition: filter 0.2s;
    }

    .watermelon-float:hover .watermelon-emoji {
        filter: drop-shadow(0 15px 25px rgba(255, 50, 50, 0.5));
    }

    /* Анимация "злости" перед взрывом */
    .watermelon-float.angry .watermelon-emoji {
        animation: shake var(--pulse-speed) infinite;
    }

    .rage-aura {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100%;
        height: 100%;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        box-shadow: 0 0 30px 10px rgba(255, 0, 0, 0.6);
        animation: pulse-red 0.5s infinite alternate;
        z-index: -1;
    }

    .click-badge {
        position: absolute;
        top: 0;
        right: 0;
        background: linear-gradient(135deg, #ff4757, #ff6b81);
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: 900;
        font-size: 18px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .particle {
        position: absolute;
        font-size: 40px;
        pointer-events: none;
        z-index: 70;
        will-change: transform, opacity;
    }

    .shockwave {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 5px solid rgba(255, 255, 255, 0.8);
        transform: translate(-50%, -50%);
        animation: shockwave-expand 0.6s ease-out forwards;
        z-index: 55;
        box-shadow: 0 0 20px rgba(255, 100, 100, 0.5);
    }

    @keyframes shake {
        0% { transform: rotate(0deg) scale(1); }
        25% { transform: rotate(-5deg) scale(1.05); }
        75% { transform: rotate(5deg) scale(1.05); }
        100% { transform: rotate(0deg) scale(1); }
    }

    @keyframes pulse-red {
        from { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0.8; transform: translate(-50%, -50%) scale(1.3); }
    }

    @keyframes shockwave-expand {
        0% {
            width: 0;
            height: 0;
            opacity: 1;
            border-width: 50px;
        }
        100% {
            width: 100vmax; /* На весь экран */
            height: 100vmax;
            opacity: 0;
            border-width: 0;
        }
    }

    @keyframes pop-in {
        from { transform: scale(0); }
        to { transform: scale(1); }
    }
</style>