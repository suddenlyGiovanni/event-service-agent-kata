import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		projects: ['packages/*/vitest.config.ts'],
	},
})
