import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Нужно, чтобы svelte резолвился в клиентскую сборку: без этого
	// mount() из @testing-library/svelte падает с lifecycle_function_unavailable
	// и компонентные тесты невозможны.
	resolve: { conditions: ['browser'] },
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['src/test-setup.ts']
	}
});