import { defineConfig } from 'vitest/config'

// Root vitest config is not used when running tests via `bun --workspaces run test`.
// Each package has its own vitest.config.ts that is used independently.
// This file is kept for IDE/tooling compatibility.
export default defineConfig({
	test: {
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
	},
})
