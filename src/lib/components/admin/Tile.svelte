<!-- src/lib/components/admin/Tile.svelte -->
<!--
    Плитка главной админки.

    - Наведение (мышь, не палец): через PEEK_DELAY плитка разрастается на месте
      поверх соседних и показывает превью — слот «peek». Растёт туда, где есть
      место: у правого края — влево, у нижнего — вверх; знакомая часть плитки
      при этом не двигается. Увели курсор — сворачивается.
    - Нажатие: плитка раскрывается в карточку (Sheet.svelte) с тем же id. Пока
      карточка открыта, на месте плитки — пустое место того же размера, чтобы
      сетка не прыгала.

    Размер в сетке — `class` (на ячейке), цвет — `tone` (на самой плитке).
    Вид — src/routes/admin/admin.css (.tile-cell, .tile, t-*).
-->
<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from 'svelte';
    import { send, receive } from '$lib/admin/morph';

    export let id: string;
    export let open: string | null = null;
    /** Подсказка при наведении — для плиток без превью. */
    export let hint = '';
    export let tone = '';
    let className = '';
    export { className as class };

    const PEEK_WIDTH = 380;
    const PEEK_DELAY = 320;
    const CLOSE_DELAY = 140;
    /** Сколько места снизу нужно превью, чтобы расти вниз, а не вверх. */
    const ROOM_BELOW = 280;
    const EDGE = 16;
    const RADIUS = 24;

    // Раскрытие — мягкое торможение в конце, сворачивание — ровнее и быстрее.
    const GROW = { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    const SHRINK = { duration: 300, easing: 'cubic-bezier(.4, 0, .2, 1)' };
    // Тень ячейки: от тени наведённой плитки до тени разросшейся (admin.css, .peeking-cell).
    const SHADOW_HOVER = 'drop-shadow(0 14px 17px rgba(0, 0, 0, 0.28))';
    const SHADOW_PEEK = 'drop-shadow(0 28px 34px rgba(0, 0, 0, 0.5))';
    const SHADOW_NONE = 'drop-shadow(0 0 0 rgba(0, 0, 0, 0))';

    const dispatch = createEventDispatcher<{ open: { id: string; el: HTMLElement } }>();
    let cell: HTMLDivElement;
    let el: HTMLButtonElement | null = null;
    let peek: HTMLDivElement | null = null;
    let peeking = false;
    let anchorRight = false;
    let anchorBottom = false;
    let cellW = 0;
    let cellH = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Animation[] = [];

    $: hasPeek = !!$$slots.peek;
    // Открылась карточка — превью больше не нужно.
    $: if (open !== null && peeking) reset();

    const matches = (q: string) => typeof window !== 'undefined' && window.matchMedia?.(q).matches === true;
    const canHover = () => matches('(hover: hover) and (pointer: fine)');
    const timing = (t: { duration: number; easing: string }, extra: KeyframeAnimationOptions = {}) =>
        ({ ...t, ...extra, duration: matches('(prefers-reduced-motion: reduce)') ? 0 : t.duration });

    // Срез плитки до её прежнего размера — с той стороны, куда она выросла.
    function inset(dx: number, dy: number): string {
        const top = anchorBottom ? dy : 0;
        const bottom = anchorBottom ? 0 : dy;
        const left = anchorRight ? dx : 0;
        const right = anchorRight ? 0 : dx;
        return `inset(${top}px ${right}px ${bottom}px ${left}px round ${RADIUS}px)`;
    }

    function stop() {
        for (const a of running) a.cancel();
        running = [];
    }

    function enter() {
        if (!hasPeek || open !== null || !canHover()) return;
        clearTimeout(timer);
        if (!peeking) timer = setTimeout(expand, PEEK_DELAY);
    }

    function leave() {
        clearTimeout(timer);
        if (peeking) timer = setTimeout(collapse, CLOSE_DELAY);
    }

    async function expand() {
        if (!cell || open !== null) return;
        stop();
        const r = cell.getBoundingClientRect();
        cellW = r.width;
        cellH = r.height;
        anchorRight = r.left + Math.max(r.width, PEEK_WIDTH) > window.innerWidth - EDGE;
        anchorBottom = r.bottom + ROOM_BELOW > window.innerHeight - EDGE && r.top > ROOM_BELOW;
        peeking = true;
        await tick();
        if (!el) return;
        const to = el.getBoundingClientRect();
        const from = inset(to.width - r.width, to.height - r.height);
        running = [
            el.animate([{ clipPath: from }, { clipPath: inset(0, 0) }], timing(GROW)),
            // Градиент растягивается вместе с плиткой: в первом кадре он ровно как у
            // свёрнутой, в последнем — на всю раскрытую (admin.css, .tile.peeking).
            el.animate(
                [{ backgroundSize: `${r.width}px ${r.height}px` }, { backgroundSize: `${to.width}px ${to.height}px` }],
                timing(GROW)
            ),
            cell.animate([{ filter: SHADOW_HOVER }, { filter: SHADOW_PEEK }], timing(GROW))
        ];
        // Превью проявляется чуть позже и выезжает от знакомой части плитки.
        peek?.animate(
            [{ opacity: 0, transform: `translateY(${anchorBottom ? 8 : -8}px)` }, { opacity: 1, transform: 'none' }],
            timing({ duration: 320, easing: 'ease-out' }, { delay: 90, fill: 'backwards' })
        );
    }

    function collapse() {
        if (!peeking || !el) return reset();
        stop();
        const to = el.getBoundingClientRect();
        const back = inset(to.width - cellW, to.height - cellH);
        peek?.animate([{ opacity: 1 }, { opacity: 0 }], timing({ duration: 120, easing: 'ease-in' }, { fill: 'forwards' }));
        // fill: forwards держит срез и тень, пока Svelte не вернёт плитке обычный
        // размер, — иначе на кадр мелькнула бы раскрытая плитка.
        const clip = el.animate([{ clipPath: inset(0, 0) }, { clipPath: back }], timing(SHRINK, { fill: 'forwards' }));
        const size = el.animate(
            [{ backgroundSize: `${to.width}px ${to.height}px` }, { backgroundSize: `${cellW}px ${cellH}px` }],
            timing(SHRINK, { fill: 'forwards' })
        );
        const shadow = cell.animate([{ filter: SHADOW_PEEK }, { filter: SHADOW_NONE }], timing(SHRINK, { fill: 'forwards' }));
        running = [clip, size, shadow];
        clip.onfinish = async () => {
            reset();
            await tick();
            clip.cancel();
            size.cancel();
            shadow.cancel();
            // Курсор вернулся, пока плитка сворачивалась, — снова превью.
            if (cell?.matches(':hover')) enter();
        };
    }

    function reset() {
        clearTimeout(timer);
        peeking = false;
    }

    onDestroy(() => {
        clearTimeout(timer);
        stop();
    });
</script>

<!-- Наведение — только украшение: с клавиатуры плитка открывается Enter, превью не нужно. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tile-cell {className}" class:peeking-cell={peeking} bind:this={cell} on:mouseenter={enter} on:mouseleave={leave}>
    {#if open === id}
        <div class="tile tile-slot" aria-hidden="true"></div>
    {:else}
        <button
            bind:this={el}
            type="button"
            class="tile {tone}"
            class:peeking
            class:anchor-right={anchorRight}
            class:anchor-bottom={anchorBottom}
            style={peeking
                ? `--cell-w: ${cellW}px; --cell-h: ${cellH}px; --peek-pos: ${anchorBottom ? 'bottom' : 'top'} ${anchorRight ? 'right' : 'left'}`
                : undefined}
            data-tile={id}
            title={hasPeek ? undefined : hint}
            aria-haspopup="dialog"
            in:receive={{ key: id }}
            out:send={{ key: id }}
            on:click={() => {
                clearTimeout(timer);
                stop();
                if (el) dispatch('open', { id, el });
            }}
        >
            <div class="tile-main">
                <slot />
                <span class="tile-more" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                </span>
            </div>
            {#if peeking}
                <div class="tile-peek" bind:this={peek}><slot name="peek" /></div>
            {/if}
        </button>
    {/if}
</div>
