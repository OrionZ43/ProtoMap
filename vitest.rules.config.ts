import { defineConfig } from 'vitest/config';

// Отдельный конфиг для тестов правил Firestore.
// - окружение node (не jsdom): тест бьёт по эмулятору через firebase SDK;
// - тесты лежат ВНЕ src/, поэтому обычный `npm test` их не подхватывает;
// - запускать через `npm run test:rules` (поднимает эмулятор и требует JDK 11+).
export default defineConfig({
	test: {
		include: ['tests/rules/**/*.test.ts'],
		environment: 'node',
		globals: true,
		testTimeout: 20000,
		hookTimeout: 30000
	}
});
