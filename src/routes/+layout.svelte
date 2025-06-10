<script lang="ts">
    import "../app.css";
    import Navbar from "$lib/components/Navbar.svelte";
    import 'leaflet/dist/leaflet.css';
    import 'leaflet.markercluster/dist/MarkerCluster.css';
    import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
    import { page } from '$app/stores';
    $: isMapPage = $page.route.id === '/';
</script>

<div class="min-h-screen flex flex-col font-sans antialiased relative">

    <div class="side-panel left">
        <div class="v-text">СТАТУС СИСТЕМЫ: ОНЛАЙН</div>
    </div>
    <div class="side-panel right">
        <div class="v-text">МОЩНОСТЬ СЕТИ: 99%</div>
    </div>

    <div class="relative z-10 flex flex-col min-h-screen">
        <Navbar />
        <main class="flex-grow">
            <slot />
        </main>
    </div>
</div>