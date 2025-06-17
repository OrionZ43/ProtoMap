<script lang="ts">
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => {
        opacity.set(1);
    });
</script>

<svelte:head>
    <title>О проекте | ProtoMap</title>
</svelte:head>

<div class="about-container cyber-panel pb-12" style="opacity: {$opacity}">

    <h2 class="title font-display">// ABOUT_PROTOMAP</h2>

    <div class="content-text">
        <p class="mb-4">
            <span class="highlight">[SYSTEM_INITIATED]</span> Добро пожаловать на ProtoMap — неофициальную точку сбора протогенов в цифровом пространстве.
        </p>
        <p class="mb-4">
            Эта карта была создана из простого желания: увидеть, как много нас разбросано по разным городам и странам, и дать возможность найти друг друга. Здесь каждый может анонимно (или не очень) отметить свое присутствие, создав маленькую светящуюся точку в нашей общей сети.
        </p>
        <hr class="separator" />
        <p class="mb-4">
            <span class="highlight">[AUTHOR_ID]</span> Я — <a href="https://t.me/Orion_Z43" target="_blank" class="author-link">Orion_Z43</a>, создатель и единственный разработчик этого проекта. Увлекшись кодингом и киберпанк-эстетикой, я решил объединить эти два мира и сделать что-то полезное для нашего сообщества.
        </p>
        <p>
            Если у вас есть идеи, предложения или вы нашли баг (что вполне вероятно!), не стесняйтесь писать мне или в наш чатик. Обратная связь — это важно для развития ProtoMap.
        </p>
        <hr class="separator" />
        <p class="mb-4">
            <span class="highlight">[COMM_LINK_ESTABLISHED]</span> Присоединяйтесь к нашему <a href="https://t.me/proto_map" target="_blank" class="author-link">Telegram-чату</a>, чтобы общаться с другими участниками, делиться идеями и быть в курсе новостей проекта!
        </p>
        <hr class="separator" />
        <p class="text-sm text-gray-400">
            <span class="highlight">[SYSTEM_NOTE]</span> Ваша приватность важна. Метки на карте не указывают точное местоположение, а привязываются к центру района или города для обеспечения анонимности.
        </p>
    </div>
</div>

<style>
    .about-container {
        @apply max-w-3xl mx-auto my-10 p-8 sm:p-10 rounded-none shadow-2xl relative;
        background: rgba(10, 10, 10, 0.7);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
        transition: opacity 0.4s ease-in-out;
    }
     @media (max-width: 640px) { .about-container { @apply my-4 mx-4 p-6; } }

    .corner { @apply absolute w-6 h-6; border-color: var(--cyber-yellow, #fcee0a); opacity: 0.7; }
    .top-left { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; }
    .top-right { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; }
    .bottom-left { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; }
    .bottom-right { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; }

    .title {
        @apply text-3xl lg:text-4xl font-bold text-center text-white mb-8;
    }

    .content-text {
        @apply text-gray-200 text-lg leading-relaxed;
        text-align: justify;
    }

    .highlight {
        @apply font-bold text-cyber-yellow mr-2;
        font-family: 'Chakra Petch', sans-serif;
    }

    .separator {
        @apply border-t-2 border-dashed border-gray-700/50 my-6;
    }

    .author-link {
        @apply text-cyan-400 hover:text-white underline;
        text-decoration-style: dotted;
        transition: color 0.2s;
    }
</style>