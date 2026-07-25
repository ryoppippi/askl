import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			include: ['src/**/*.ts'],
		},
		exclude: [...configDefaults.exclude, '**/.direnv/**'],
		globals: true,
		includeSource: ['src/**/*.ts'],
	},
});
