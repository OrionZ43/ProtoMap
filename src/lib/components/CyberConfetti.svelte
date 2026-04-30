<script lang="ts">
    /**
     * CyberConfetti v2 — редкие, элегантные частицы.
     * Всего 18-25 штук на экран. Нет снегопада, нет шторма.
     * Каждая частица медленно «парит» с лёгким покачиванием.
     */
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null = null;
    let rafId: number;

    // ── Конфигурация ──────────────────────────────────────────────────
    const PALETTE = ['#ffd700', '#ff00ff', '#00f0ff', '#ff6ec7'];
    const COUNT   = 20; // на весь экран — очень мало

    type Shape = 'rect' | 'diamond' | 'line';

    interface Particle {
        x: number; y: number;
        vx: number; vy: number;
        size: number;
        color: string;
        shape: Shape;
        rotation: number;
        rotSpeed: number;
        alpha: number;
        // Синусоидальное покачивание (Bob-анимация)
        bobOffset: number;
        bobSpeed: number;
    }

    let particles: Particle[] = [];

    function init() {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = window.innerWidth  * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        const shapes: Shape[] = ['rect', 'diamond', 'line'];
        particles = Array.from({ length: COUNT }, () => ({
            x:         Math.random() * window.innerWidth,
            y:         Math.random() * window.innerHeight,
            vx:        (Math.random() - 0.5) * 0.25,  // очень медленный горизонт
            vy:        0.15 + Math.random() * 0.25,    // медленное падение
            size:      2.5 + Math.random() * 3.5,
            color:     PALETTE[Math.floor(Math.random() * PALETTE.length)],
            shape:     shapes[Math.floor(Math.random() * 3)] as Shape,
            rotation:  Math.random() * Math.PI * 2,
            rotSpeed:  (Math.random() - 0.5) * 0.02,
            alpha:     0.3 + Math.random() * 0.45,
            bobOffset: Math.random() * Math.PI * 2,    // фаза боба
            bobSpeed:  0.012 + Math.random() * 0.008,  // частота боба
        }));
    }

    function drawOne(p: Particle) {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.strokeStyle = p.color;
        ctx.shadowBlur  = 5;
        ctx.shadowColor = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        switch (p.shape) {
            case 'rect':
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(0, -p.size / 2);
                ctx.lineTo(p.size / 2, 0);
                ctx.lineTo(0,  p.size / 2);
                ctx.lineTo(-p.size / 2, 0);
                ctx.closePath();
                ctx.fill();
                break;
            case 'line':
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-p.size, 0);
                ctx.lineTo(p.size, 0);
                ctx.stroke();
                break;
        }
        ctx.restore();
    }

    let tick = 0;
    function loop() {
        if (!ctx) return;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        tick++;

        for (const p of particles) {
            drawOne(p);

            // Синусоидальное боковое покачивание
            p.x += p.vx + Math.sin(p.bobOffset + tick * p.bobSpeed) * 0.3;
            p.y += p.vy;
            p.rotation += p.rotSpeed;

            // Ребаунд за нижний край
            if (p.y > window.innerHeight + 8) {
                p.y  = -8;
                p.x  = Math.random() * window.innerWidth;
                p.alpha = 0.3 + Math.random() * 0.45;
            }
            if (p.x < -8) p.x = window.innerWidth + 8;
            if (p.x > window.innerWidth + 8) p.x = -8;
        }

        rafId = requestAnimationFrame(loop);
    }

    onMount(() => {
        if (!browser) return;
        init();
        loop();
        window.addEventListener('resize', init);
    });

    onDestroy(() => {
        if (!browser) return;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', init);
    });
</script>

<canvas bind:this={canvas} class="confetti-canvas" aria-hidden="true" />

<style>
    .confetti-canvas {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2;
    }
</style>