// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineProject } from 'vitest/config'

export default defineProject({
	test: {
		environment: 'node',
		hookTimeout: 10_000,
		include: ['src/**/*.integration.test.ts'],
		name: { color: 'yellow', label: 'timer:integration' },
		testTimeout: 30_000,
	},
})
