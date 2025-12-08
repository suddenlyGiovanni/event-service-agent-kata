// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineProject } from 'vitest/config'

export default defineProject({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
		name: { color: 'magenta', label: 'platform:unit' },
	},
})
