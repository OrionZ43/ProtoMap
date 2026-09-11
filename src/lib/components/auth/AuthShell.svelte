<script lang="ts">
    import NetworkCanvas from './NetworkCanvas.svelte';

    /**
     * Общий каркас страниц входа и регистрации.
     *
     * Раньше обе были колонкой в 512 пикселей по центру. После добавления
     * блока согласий колонка стала вдвое длиннее экрана и превратилась
     * в «тоненький столбик» — отсюда переделка.
     *
     * Витрина слева не украшение ради украшения: она забирает половину ширины
     * на большом экране, из-за чего форма перестаёт выглядеть потерянной,
     * а длинный текст согласий получает нормальную колонку вместо узкой полосы.
     * На экранах уже 1024 пикселей витрина убирается совсем — там она только
     * отняла бы место у формы.
     */

    /** Заголовок над формой. */
    export let title: string;

    /** Строка под заголовком — необязательная. */
    export let subtitle: string | null = null;

    /** Сколько протогенов уже на карте. Показывается на витрине, если известно. */
    export let protogens: number | null = null;
</script>

<div class="auth">
    <!-- Витрина -->
    <aside class="showcase" aria-hidden="true">
        <NetworkCanvas />

        <div class="showcase__content">
            <p class="showcase__kicker font-display">PROTOMAP NETWORK</p>

            {#if protogens !== null}
                <p class="showcase__count font-display">{protogens}</p>
                <p class="showcase__caption">
                    {protogens === 1 ? 'протоген уже на карте' : 'протогенов уже на карте'}
                </p>
            {:else}
                <p class="showcase__caption showcase__caption--solo">
                    Интерактивная карта сообщества
                </p>
            {/if}
        </div>

        <div class="showcase__corner showcase__corner--tl"></div>
        <div class="showcase__corner showcase__corner--br"></div>
    </aside>

    <!-- Форма -->
    <main class="panel">
        <div class="panel__inner">
            <header class="panel__head">
                <h1 class="panel__title font-display">{title}</h1>
                {#if subtitle}
                    <p class="panel__subtitle">{subtitle}</p>
                {/if}
            </header>

            <slot />
        </div>
    </main>
</div>

<style>
    .auth {
        display: grid;
        grid-template-columns: 1fr;
        min-height: calc(100vh - 4rem);
    }

    /* Две колонки только там, где для них правда есть место. */
    @media (min-width: 1024px) {
        .auth {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            align-items: stretch;
        }
    }

    /* ─── Витрина ─────────────────────────────────────────────────────────── */

    .showcase {
        display: none;
        position: relative;
        overflow: hidden;
        background: radial-gradient(circle at 30% 20%, #0a1620 0%, #05080c 70%);
        border-right: 1px solid rgba(0, 243, 255, 0.18);
    }

    @media (min-width: 1024px) {
        .showcase { display: block; }
    }

    .showcase__content {
        position: relative;
        z-index: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 3rem;
    }

    .showcase__kicker {
        font-size: 0.75rem;
        letter-spacing: 0.28em;
        color: rgba(0, 243, 255, 0.65);
        margin: 0 0 1.5rem;
    }

    .showcase__count {
        font-size: 5rem;
        line-height: 1;
        color: #fff;
        margin: 0;
        text-shadow: 0 0 24px rgba(0, 243, 255, 0.45);
    }

    .showcase__caption {
        font-size: 0.95rem;
        color: #7e93a5;
        margin: 0.5rem 0 0;
    }

    .showcase__caption--solo {
        font-size: 1.4rem;
        color: #9fb3c8;
    }

    .showcase__corner {
        position: absolute;
        width: 40px;
        height: 40px;
        border-color: rgba(0, 243, 255, 0.5);
        z-index: 1;
    }
    .showcase__corner--tl {
        top: 1.25rem; left: 1.25rem;
        border-top: 1px solid; border-left: 1px solid;
    }
    .showcase__corner--br {
        bottom: 1.25rem; right: 1.25rem;
        border-bottom: 1px solid; border-right: 1px solid;
    }

    /* ─── Панель формы ────────────────────────────────────────────────────── */

    .panel {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2.5rem 1.25rem 4rem;
    }

    .panel__inner {
        width: 100%;
        /* Шире прежних 512: длинному тексту согласий нужна нормальная колонка,
           а не узкая полоса, в которой строка ломается на каждом слове. */
        max-width: 34rem;
    }

    .panel__head {
        margin-bottom: 2rem;
    }

    .panel__title {
        font-size: 2rem;
        color: var(--cyber-yellow, #ffd500);
        margin: 0;
        letter-spacing: 0.04em;
    }

    .panel__subtitle {
        margin: 0.6rem 0 0;
        font-size: 0.9rem;
        color: #7e93a5;
    }
</style>
