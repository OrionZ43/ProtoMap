import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
    preprocess: vitePreprocess(),

    kit: {
        adapter: adapter()
    },

    vite: {
        optimizeDeps: {
            exclude: ['leaflet', 'leaflet.markercluster']
        }
    }
};

export default config;