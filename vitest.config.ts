import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts', 'src/**/*.property.test.ts'],
		testTimeout: 120_000
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src')
		}
	}
});
