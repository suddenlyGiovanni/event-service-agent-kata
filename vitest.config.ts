// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			// Unit tests: {package}:unit (e.g., timer:unit, api:unit)
			'packages/*/vitest.unit.config.ts',

			// Integration tests: {package}:integration (e.g., timer:integration)
			'packages/*/vitest.integration.config.ts',

			// Exclude typescript package (no tests)
			'!packages/typescript',
		],
	},
})
