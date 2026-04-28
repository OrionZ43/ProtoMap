import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
    preprocess: vitePreprocess(),

    kit: {
        adapter: adapter(),
        csp: {
            directives: {
                'script-src': ["'self'", 'https://apis.google.com', 'https://www.gstatic.com', "'unsafe-inline'", "'unsafe-eval'"],
                'frame-src': ["'self'", 'https://*.firebaseapp.com', 'https://apis.google.com']
            }
        }
    },

    vite: {
        optimizeDeps: {
            exclude: ['leaflet', 'leaflet.markercluster']
        }
    }
};

export default config;