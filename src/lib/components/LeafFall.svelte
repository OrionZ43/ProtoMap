<script lang="ts">
    import { onMount } from 'svelte';

    // Листопад в хэллоуинской теме: несколько листьев медленно падают по краям экрана.
    // Движутся только transform-ом — это работа композитора, главный поток не занят.
    // С «меньше движения» в системе листьев нет.

    // Простые силуэты клёна и дуба, 24×24
    const SHAPES = [
        'M12 1.5L13.6 5.6L16.8 4.2L16.2 8.4L21.5 7.6L19 11L21 13.4L16.4 14.2L17.4 17.6L13 16L12.6 22.5L11.4 22.5L11 16L6.6 17.6L7.6 14.2L3 13.4L5 11L2.5 7.6L7.8 8.4L7.2 4.2L10.4 5.6Z',
        'M12 2C14 4 15 4 15.5 6C17 6.5 17 8 16 9.5C18 10.5 18 12.5 16.5 13.5C17.5 15 17 17 15 17.5C14.5 19 13 20 12.6 20.6L12.6 23L11.4 23L11.4 20.6C11 20 9.5 19 9 17.5C7 17 6.5 15 7.5 13.5C6 12.5 6 10.5 8 9.5C7 8 7 6.5 8.5 6C9 4 10 4 12 2Z'
    ];
    const COLORS = ['#d9480f', '#e8590c', '#b45309', '#9a3412', '#f59f00'];

    type Leaf = {
        left: number; // % ширины экрана
        size: number;
        fall: number; // секунд на падение
        delay: number;
        sway: number; // секунд на покачивание
        spin: number; // градусов поворота в каждую сторону
        color: string;
        shape: string;
        flip: boolean;
    };

    let leaves: Leaf[] = [];

    onMount(() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const count = innerWidth < 768 ? 4 : 8;
        leaves = Array.from({ length: count }, (_, i) => {
            // Поровну у левого и правого края: середину занимает контент
            const edge = 1 + Math.random() * 10;
            return {
                left: i % 2 === 0 ? edge : 96 - edge,
                size: 18 + Math.random() * 14,
                fall: 16 + Math.random() * 10,
                // Отрицательная задержка: часть листьев уже в полёте, когда страница открылась
                delay: -Math.random() * 26,
                sway: 3 + Math.random() * 2.5,
                spin: (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 25),
                color: COLORS[i % COLORS.length],
                shape: SHAPES[i % SHAPES.length],
                flip: Math.random() < 0.5
            };
        });
    });
</script>

<div class="leaf-fall" aria-hidden="true">
    {#each leaves as leaf}
        <span class="fall" style="left: {leaf.left}%; animation-duration: {leaf.fall}s; animation-delay: {leaf.delay}s;">
            <span class="sway" style="--spin: {leaf.spin}deg; animation-duration: {leaf.sway}s;">
                <svg viewBox="0 0 24 24" width={leaf.size} height={leaf.size} class:flip={leaf.flip}>
                    <path d={leaf.shape} fill={leaf.color} />
                </svg>
            </span>
        </span>
    {/each}
</div>

<style>
    .leaf-fall {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0; /* Под интерфейсом, как снег зимой */
        overflow: hidden;
    }
    .fall {
        position: absolute;
        top: 0;
        animation-name: leaf-fall;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
    }
    .sway {
        display: block;
        animation-name: leaf-sway;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
        animation-direction: alternate;
    }
    svg {
        display: block;
        opacity: 0.85;
    }
    svg.flip {
        transform: scaleX(-1);
    }
    @keyframes leaf-fall {
        from { transform: translateY(-8vh); }
        to { transform: translateY(108vh); }
    }
    @keyframes leaf-sway {
        from { transform: translateX(-18px) rotate(calc(var(--spin) * -1)); }
        to { transform: translateX(18px) rotate(var(--spin)); }
    }
</style>
