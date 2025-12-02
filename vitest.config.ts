// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: ['packages/*', '!packages/typescript'],
	},
})
