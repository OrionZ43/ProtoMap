<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';

    let mapInstance: any = null;

    onMount(async () => {
        if (browser) {
            const mapModule = await import('$lib/client/mapLogic');
            const result = mapModule.initMap('map-container');

            if (result && result.map) {
                mapInstance = result.map;
            }
        }
    });

    onDestroy(() => {
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
    });
</script>

<div class="flex-grow w-full h-[calc(100vh-64px)] relative overflow-hidden">
    <div id="map-container" class="w-full h-full" style="background: #050a10;"></div>
</div>