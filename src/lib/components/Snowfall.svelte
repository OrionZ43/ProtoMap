<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let animationFrameId: number;

    // === НАСТРОЙКИ ===
    const COUNT_PC = 70;      // Чуть больше снега для ПК, раз он легкий
    const COUNT_MOBILE = 25;  // Бережем мобилки
    const WIND = 0.5;         // Сила ветра (0 = ровно вниз, 1 = сильно вправо, -1 = влево)
    const SPEED_MODIFIER = 1; // Множитель скорости

    let particles: { x: number; y: number; r: number; speed: number }[] = [];

    function initSnow() {
        if (!canvas) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        // Учитываем pixel ratio для четкости на Retina/OLED экранах
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        // Масштабируем контекст, чтобы стили CSS (width: 100%) совпадали с пикселями
        ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        const count = width < 768 ? COUNT_MOBILE : COUNT_PC;

        particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() * 2 + 0.5, // Радиус от 0.5 до 2.5
                // Чем больше снежинка, тем быстрее она падает (эффект глубины)
                speed: (Math.random() * 1.5 + 0.5) * SPEED_MODIFIER
            });
        }
    }

    function draw() {
        if (!ctx || !canvas) return;

        // Размеры в CSS пикселях (логические)
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Очищаем (для Canvas это быстрее, чем fillRect с прозрачностью)
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Рисуем
            ctx.moveTo(p.x, p.y);
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, true);

            // === ОБНОВЛЯЕМ КООРДИНАТЫ (ПРОСТАЯ ФИЗИКА) ===
            p.y += p.speed;     // Падаем вниз
            p.x += WIND;        // Снос ветром

            // Если улетела за низ экрана -> телепорт наверх
            if (p.y > height) {
                p.y = -5;
                p.x = Math.random() * width; // Рандомная позиция по X
            }

            // Если улетела за правый край -> телепорт влево
            if (p.x > width + 5) {
                p.x = -5;
                p.y = Math.random() * height;
            }
            // Если улетела за левый край (если ветер отрицательный) -> телепорт вправо
            else if (p.x < -5) {
                p.x = width + 5;
                p.y = Math.random() * height;
            }
        }

        ctx.fill();
        animationFrameId = requestAnimationFrame(draw);
    }

    onMount(() => {
        if (browser) {
            initSnow();
            draw();
            window.addEventListener('resize', initSnow);
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener('resize', initSnow);
            cancelAnimationFrame(animationFrameId);
        }
    });
</script>

<canvas bind:this={canvas} class="snow-canvas"></canvas>

<style>
    .snow-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0; /* Под интерфейсом */
    }
</style>