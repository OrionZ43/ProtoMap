<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';

    let mapInstance: { map: any; markers: any; destroy: () => void } | null = null;

    onMount(async () => {
        if (browser) {
            const mapModule = await import('$lib/client/mapLogic');
            const result = mapModule.initMap('map-container');
            mapInstance = result;
        }
    });

    onDestroy(() => {
        if (mapInstance) {
            mapInstance.destroy();
            mapInstance = null;
        }
    });
</script>

<svelte:head>
    <title>ProtoMap — ProtoMap - Карта протогенов</title>
    <meta name="description" content="Интерактивная карта протогенов с казино, чатом и профилями" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://proto-map.vercel.app/" />
    <meta property="og:title" content="ProtoMap — ProtoMap - Карта протогенов" />
    <meta property="og:description" content="Интерактивная карта протогенов с казино, чатом и профилями" />
    <meta property="og:image" content="https://proto-map.vercel.app/api/og?page=map" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:site_name" content="ProtoMap" />
    <meta property="og:locale" content="ru_RU" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://proto-map.vercel.app/" />
    <meta name="twitter:title" content="ProtoMap - Карта протогенов" />
    <meta name="twitter:description" content="Интерактивная карта протогенов с казино, чатом и профилями" />
    <meta name="twitter:image" content="https://proto-map.vercel.app/api/og?page=map" />

    <link rel="canonical" href="https://proto-map.vercel.app/" />
</svelte:head>

<div class="flex-grow w-full h-[calc(100vh-64px)] relative overflow-hidden">
    <div id="map-container" class="w-full h-full" style="background: #050a10;"></div>
</div>