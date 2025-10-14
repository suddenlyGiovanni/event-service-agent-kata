import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: ['packages/*/vitest.config.ts'],
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true
			}
		}
	},
})
