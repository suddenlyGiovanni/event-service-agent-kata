// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineProject } from 'vitest/config'

export default defineProject({
	test: {
		environment: 'node',
		// Exclude integration tests from unit test runs (handled by root config)
		exclude: ['src/**/*.integration.test.ts'],
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		name: { color: 'yellow', label: 'timer:unit' },
	},
})
