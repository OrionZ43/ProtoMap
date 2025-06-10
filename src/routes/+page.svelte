<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { userStore } from '$lib/stores';

    let updateUserInteraction: (user: any) => void;

    onMount(async () => {
        if (browser) {
            const mapModule = await import('$lib/client/mapLogic');
            const mapInstance = mapModule.initMap('map-container');
            // Сохраняем ссылку на функцию
            updateUserInteraction = mapInstance.updateUserInteraction;
        }
    });

    $: if (browser && $userStore && updateUserInteraction) {
        updateUserInteraction($userStore.user);
    }
</script>

<div class="flex-grow w-full h-[calc(100vh-64px)] relative overflow-hidden">
    <div id="map-container" class="w-full h-full"></div>
</div>