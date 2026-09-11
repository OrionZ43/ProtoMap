<script lang="ts">
    /** Индикатор шага мастера регистрации. */

    export let total: number;
    export let current: number;

    /**
     * Клик по пройденному шагу возвращает назад. Вперёд через индикатор
     * прыгнуть нельзя: следующий шаг может быть недоступен, пока не заполнен
     * текущий, и молча ничего не делающая кнопка раздражает сильнее, чем её
     * отсутствие.
     */
    export let onGoTo: ((step: number) => void) | null = null;

    $: steps = Array.from({ length: total }, (_, i) => i + 1);
</script>

<div class="dots" role="group" aria-label="Шаг {current} из {total}">
    {#each steps as s}
        {#if onGoTo && s < current}
            <button
                type="button"
                class="dot dot--done"
                aria-label="Вернуться к шагу {s}"
                on:click={() => onGoTo?.(s)}
            ></button>
        {:else}
            <span
                class="dot"
                class:dot--current={s === current}
                class:dot--done={s < current}
                aria-current={s === current ? 'step' : undefined}
            ></span>
        {/if}
    {/each}

    <span class="label font-display">шаг {current} из {total}</span>
</div>

<style>
    .dots {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1.75rem;
    }

    .dot {
        width: 9px;
        height: 9px;
        padding: 0;
        border: 1px solid rgba(0, 243, 255, 0.45);
        background: transparent;
        border-radius: 0;
        transform: rotate(45deg);
        transition: background 0.2s, border-color 0.2s;
    }

    .dot--done {
        background: rgba(0, 243, 255, 0.45);
    }

    button.dot--done {
        cursor: pointer;
    }
    button.dot--done:hover {
        background: rgba(0, 243, 255, 0.8);
    }

    .dot--current {
        background: var(--cyber-yellow, #ffd500);
        border-color: var(--cyber-yellow, #ffd500);
        box-shadow: 0 0 10px rgba(255, 213, 0, 0.6);
    }

    .label {
        margin-left: 0.5rem;
        font-size: 0.7rem;
        letter-spacing: 0.16em;
        color: #64798c;
        text-transform: uppercase;
    }
</style>
