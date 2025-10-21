import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		projects: ['packages/timer', 'packages/contracts'],
	},
})
