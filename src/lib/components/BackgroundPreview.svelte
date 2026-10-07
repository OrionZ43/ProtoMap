<script lang="ts">
    // Миниатюра фона профиля: тот же .profile-backdrop, что на странице профиля,
    // только «экран» высотой viewport пикселей, уменьшенный до размеров родителя.
    // Узоры фонов заданы в пикселях, поэтому фон в маленькой коробке без масштаба
    // показывал бы обрезок, а не уменьшенную копию. Своих стилей превью у фонов
    // нет — новый фон получает миниатюру сам.
    // Родитель задаёт размер и должен быть position: relative + overflow: hidden.

    /** id фона — тот же класс, что у фона на странице профиля. */
    export let id: string;
    /** Высота воображаемого экрана, px: чем больше, тем мельче узор в миниатюре. */
    export let viewport = 720;

    let width = 0;
    let height = 0;

    $: scale = height > 0 ? height / viewport : 0;
</script>

<div class="bg-preview" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true">
    {#if scale > 0 && width > 0}
        <!-- --fx: в коробке уже сцены держим героя, как на телефоне (см. profile-skins.css) -->
        <div
            class="profile-backdrop {id}"
            style="width: {width / scale}px; height: {viewport}px; transform: scale({scale}); --fx: var(--fx-portrait, .5);"
        >
            <div class="backdrop-motion"></div>
        </div>
    {/if}
</div>

<style>
    .bg-preview {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
    }
    .bg-preview .profile-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 0;
        transform-origin: 0 0;
    }
</style>
