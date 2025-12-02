// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			// Package-based projects (unit tests)
			'packages/*',
			'!packages/typescript',

			// Integration tests (separate project for filtering)
			{
				extends: true,
				test: {
					hookTimeout: 10_000,
					include: ['packages/**/*.integration.test.ts'],
					name: { color: 'magenta', label: 'integration' },
					testTimeout: 30_000,
				},
			},
		],
	},
})
