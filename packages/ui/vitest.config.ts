// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		name: 'ui',
		passWithNoTests: true,
	},
})
