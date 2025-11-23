import { describe, expect, it } from '@effect/vitest'

import { Topics } from './topics.ts'

describe('Topics', () => {
	describe('Topic Constants', () => {
		describe('Timer Topics', () => {
			it('should define Commands topic', () => {
				expect(Topics.Timer.Commands).toBe('timer.commands')
			})

			it('should define Events topic', () => {
				expect(Topics.Timer.Events).toBe('timer.events')
			})

			it('should have consistent naming pattern', () => {
				expect(Topics.Timer.Commands).toMatch(/^timer\.(commands|events)$/)
				expect(Topics.Timer.Events).toMatch(/^timer\.(commands|events)$/)
			})
		})

		describe('Orchestration Topics', () => {
			it('should define Commands topic', () => {
				expect(Topics.Orchestration.Commands).toBe('orchestration.commands')
			})

			it('should define Events topic', () => {
				expect(Topics.Orchestration.Events).toBe('orchestration.events')
			})

			it('should have consistent naming pattern', () => {
				expect(Topics.Orchestration.Commands).toMatch(/^orchestration\.(commands|events)$/)
				expect(Topics.Orchestration.Events).toMatch(/^orchestration\.(commands|events)$/)
			})
		})

		describe('Execution Topics', () => {
			it('should define Events topic', () => {
				expect(Topics.Execution.Events).toBe('execution.events')
			})

			it('should have consistent naming pattern', () => {
				expect(Topics.Execution.Events).toMatch(/^execution\.events$/)
			})

			it('should not have Commands topic (execution only produces events)', () => {
				expect((Topics.Execution as any).Commands).toBeUndefined()
			})
		})

		describe('Api Topics', () => {
			it('should define Commands topic', () => {
				expect(Topics.Api.Commands).toBe('api.commands')
			})

			it('should have consistent naming pattern', () => {
				expect(Topics.Api.Commands).toMatch(/^api\.commands$/)
			})

			it('should not have Events topic (api only produces commands)', () => {
				expect((Topics.Api as any).Events).toBeUndefined()
			})
		})
	})

	describe('Topics.All', () => {
		it('should contain all defined topics', () => {
			expect(Topics.All).toContain(Topics.Timer.Commands)
			expect(Topics.All).toContain(Topics.Timer.Events)
			expect(Topics.All).toContain(Topics.Orchestration.Commands)
			expect(Topics.All).toContain(Topics.Orchestration.Events)
			expect(Topics.All).toContain(Topics.Execution.Events)
			expect(Topics.All).toContain(Topics.Api.Commands)
		})

		it('should have exactly 6 topics', () => {
			expect(Topics.All).toHaveLength(6)
		})

		it('should not contain duplicates', () => {
			const uniqueTopics = new Set(Topics.All)
			expect(uniqueTopics.size).toBe(Topics.All.length)
		})

		it('should be readonly array', () => {
			// This is a type-level test, but we can verify runtime behavior
			expect(Object.isFrozen(Topics.All)).toBe(false) // as const doesn't freeze, just makes readonly
			expect(Array.isArray(Topics.All)).toBe(true)
		})

		it('should contain only strings', () => {
			for (const topic of Topics.All) {
				expect(typeof topic).toBe('string')
			}
		})

		it('should follow naming convention module.type', () => {
			for (const topic of Topics.All) {
				expect(topic).toMatch(/^[a-z]+\.(commands|events)$/)
			}
		})
	})

	describe('Topics.isTopic', () => {
		describe('Valid Topics', () => {
			it('should return true for Timer.Commands', () => {
				expect(Topics.isTopic('timer.commands')).toBe(true)
			})

			it('should return true for Timer.Events', () => {
				expect(Topics.isTopic('timer.events')).toBe(true)
			})

			it('should return true for Orchestration.Commands', () => {
				expect(Topics.isTopic('orchestration.commands')).toBe(true)
			})

			it('should return true for Orchestration.Events', () => {
				expect(Topics.isTopic('orchestration.events')).toBe(true)
			})

			it('should return true for Execution.Events', () => {
				expect(Topics.isTopic('execution.events')).toBe(true)
			})

			it('should return true for Api.Commands', () => {
				expect(Topics.isTopic('api.commands')).toBe(true)
			})

			it('should return true for all topics in Topics.All', () => {
				for (const topic of Topics.All) {
					expect(Topics.isTopic(topic)).toBe(true)
				}
			})
		})

		describe('Invalid Topics', () => {
			it('should return false for invalid topic', () => {
				expect(Topics.isTopic('invalid.topic')).toBe(false)
			})

			it('should return false for empty string', () => {
				expect(Topics.isTopic('')).toBe(false)
			})

			it('should return false for wrong format', () => {
				expect(Topics.isTopic('timer')).toBe(false)
				expect(Topics.isTopic('commands')).toBe(false)
				expect(Topics.isTopic('timer.commands.extra')).toBe(false)
			})

			it('should return false for wrong module name', () => {
				expect(Topics.isTopic('unknown.commands')).toBe(false)
			})

			it('should return false for wrong message class', () => {
				expect(Topics.isTopic('timer.queries')).toBe(false)
			})

			it('should return false for case-sensitive mismatch', () => {
				expect(Topics.isTopic('Timer.Commands')).toBe(false)
				expect(Topics.isTopic('timer.Commands')).toBe(false)
				expect(Topics.isTopic('TIMER.COMMANDS')).toBe(false)
			})

			it('should return false for non-existent execution commands', () => {
				expect(Topics.isTopic('execution.commands')).toBe(false)
			})

			it('should return false for non-existent api events', () => {
				expect(Topics.isTopic('api.events')).toBe(false)
			})
		})

		describe('Edge Cases', () => {
			it('should handle whitespace', () => {
				expect(Topics.isTopic(' timer.commands')).toBe(false)
				expect(Topics.isTopic('timer.commands ')).toBe(false)
				expect(Topics.isTopic(' timer.commands ')).toBe(false)
			})

			it('should handle special characters', () => {
				expect(Topics.isTopic('timer.commands\n')).toBe(false)
				expect(Topics.isTopic('timer.commands\t')).toBe(false)
			})

			it('should handle null/undefined (type coercion)', () => {
				// @ts-expect-error - testing runtime behavior with invalid input
				expect(Topics.isTopic(null)).toBe(false)
				// @ts-expect-error - testing runtime behavior with invalid input
				expect(Topics.isTopic(undefined)).toBe(false)
			})

			it('should handle numbers', () => {
				// @ts-expect-error - testing runtime behavior with invalid input
				expect(Topics.isTopic(123)).toBe(false)
			})

			it('should handle objects', () => {
				// @ts-expect-error - testing runtime behavior with invalid input
				expect(Topics.isTopic({})).toBe(false)
				// @ts-expect-error - testing runtime behavior with invalid input
				expect(Topics.isTopic({ topic: 'timer.commands' })).toBe(false)
			})
		})
	})

	describe('Topics.Metadata', () => {
		it('should have metadata for all topics', () => {
			for (const topic of Topics.All) {
				expect(Topics.Metadata[topic as Topics.Type]).toBeDefined()
			}
		})

		describe('Timer Metadata', () => {
			it('should define Timer.Commands metadata', () => {
				const metadata = Topics.Metadata[Topics.Timer.Commands]
				expect(metadata.producer).toBe('Orchestration')
				expect(metadata.consumers).toEqual(['Timer'])
				expect(metadata.description).toContain('Timer module')
				expect(metadata.description).toContain('ScheduleTimer')
			})

			it('should define Timer.Events metadata', () => {
				const metadata = Topics.Metadata[Topics.Timer.Events]
				expect(metadata.producer).toBe('Timer')
				expect(metadata.consumers).toEqual(['Orchestration'])
				expect(metadata.description).toContain('Timer module')
				expect(metadata.description).toContain('DueTimeReached')
			})
		})

		describe('Orchestration Metadata', () => {
			it('should define Orchestration.Commands metadata', () => {
				const metadata = Topics.Metadata[Topics.Orchestration.Commands]
				expect(metadata.producer).toBeNull()
				expect(metadata.consumers).toEqual(['Orchestration'])
				expect(metadata.description).toContain('Orchestration module')
			})

			it('should define Orchestration.Events metadata', () => {
				const metadata = Topics.Metadata[Topics.Orchestration.Events]
				expect(metadata.producer).toBe('Orchestration')
				expect(metadata.consumers).toEqual(['Timer', 'Execution'])
				expect(metadata.description).toContain('Orchestration module')
				expect(metadata.description).toContain('ServiceCallScheduled')
			})
		})

		describe('Execution Metadata', () => {
			it('should define Execution.Events metadata', () => {
				const metadata = Topics.Metadata[Topics.Execution.Events]
				expect(metadata.producer).toBe('Execution')
				expect(metadata.consumers).toEqual(['Orchestration'])
				expect(metadata.description).toContain('Execution module')
			})
		})

		describe('Api Metadata', () => {
			it('should define Api.Commands metadata', () => {
				const metadata = Topics.Metadata[Topics.Api.Commands]
				expect(metadata.producer).toBe('Api')
				expect(metadata.consumers).toEqual(['Orchestration'])
				expect(metadata.description).toContain('API module')
			})
		})

		describe('Metadata Structure', () => {
			it('should have producer field for all metadata', () => {
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					expect(metadata).toHaveProperty('producer')
					expect(metadata.producer === null || typeof metadata.producer === 'string').toBe(true)
				}
			})

			it('should have consumers array for all metadata', () => {
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					expect(metadata).toHaveProperty('consumers')
					expect(Array.isArray(metadata.consumers)).toBe(true)
					expect(metadata.consumers.length).toBeGreaterThan(0)
				}
			})

			it('should have description string for all metadata', () => {
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					expect(metadata).toHaveProperty('description')
					expect(typeof metadata.description).toBe('string')
					expect(metadata.description.length).toBeGreaterThan(0)
				}
			})

			it('should have valid module names in producer field', () => {
				const validModules: Array<Topics.Module | null> = ['Api', 'Orchestration', 'Execution', 'Timer', null]
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					expect(validModules).toContain(metadata.producer)
				}
			})

			it('should have valid module names in consumers array', () => {
				const validModules: Array<Topics.Module> = ['Api', 'Orchestration', 'Execution', 'Timer']
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					for (const consumer of metadata.consumers) {
						expect(validModules).toContain(consumer)
					}
				}
			})
		})
	})

	describe('Architecture Validation', () => {
		describe('Message Flow Consistency', () => {
			it('should have Timer consuming only from Orchestration', () => {
				// Timer.Commands should be produced by Orchestration
				const timerCommandsMeta = Topics.Metadata[Topics.Timer.Commands]
				expect(timerCommandsMeta.producer).toBe('Orchestration')
				expect(timerCommandsMeta.consumers).toContain('Timer')
			})

			it('should have Orchestration consuming from Api and Timer', () => {
				// Api.Commands consumed by Orchestration
				const apiCommandsMeta = Topics.Metadata[Topics.Api.Commands]
				expect(apiCommandsMeta.consumers).toContain('Orchestration')

				// Timer.Events consumed by Orchestration
				const timerEventsMeta = Topics.Metadata[Topics.Timer.Events]
				expect(timerEventsMeta.consumers).toContain('Orchestration')
			})

			it('should have Execution consuming from Orchestration', () => {
				// Orchestration.Events consumed by Execution
				const orchestrationEventsMeta = Topics.Metadata[Topics.Orchestration.Events]
				expect(orchestrationEventsMeta.consumers).toContain('Execution')
			})

			it('should have no circular dependencies in direct flows', () => {
				// Timer produces events consumed by Orchestration
				// Orchestration produces commands consumed by Timer
				// This is event-driven, not circular

				// Timer doesn't produce commands to Orchestration.Commands
				expect(Topics.Metadata[Topics.Timer.Commands].consumers).not.toContain('Orchestration')

				// Orchestration.Commands doesn't list Timer as producer
				expect(Topics.Metadata[Topics.Orchestration.Commands].producer).not.toBe('Timer')
			})
		})

		describe('Topic Naming Consistency', () => {
			it('should use lowercase for all topic strings', () => {
				for (const topic of Topics.All) {
					expect(topic).toBe(topic.toLowerCase())
				}
			})

			it('should use dot separator', () => {
				for (const topic of Topics.All) {
					expect(topic).toMatch(/\w+\.\w+/)
				}
			})

			it('should have module name matching metadata', () => {
				// Timer topics should mention Timer in description
				expect(Topics.Metadata[Topics.Timer.Commands].description).toContain('Timer')
				expect(Topics.Metadata[Topics.Timer.Events].description).toContain('Timer')

				// Orchestration topics should mention Orchestration
				expect(Topics.Metadata[Topics.Orchestration.Commands].description).toContain('Orchestration')
				expect(Topics.Metadata[Topics.Orchestration.Events].description).toContain('Orchestration')
			})
		})

		describe('Module Coverage', () => {
			it('should have topics for all documented modules', () => {
				// Based on design docs, we expect Timer, Orchestration, Execution, Api
				const modules = ['timer', 'orchestration', 'execution', 'api']

				for (const module of modules) {
					const moduleTopics = Topics.All.filter((topic) => topic.startsWith(`${module}.`))
					expect(moduleTopics.length).toBeGreaterThan(0)
				}
			})

			it('should have at least one topic per module', () => {
				// Timer
				expect(Topics.All.filter((t) => t.startsWith('timer.'))).toHaveLength(2)
				// Orchestration
				expect(Topics.All.filter((t) => t.startsWith('orchestration.'))).toHaveLength(2)
				// Execution
				expect(Topics.All.filter((t) => t.startsWith('execution.'))).toHaveLength(1)
				// Api
				expect(Topics.All.filter((t) => t.startsWith('api.'))).toHaveLength(1)
			})
		})

		describe('Producer-Consumer Relationships', () => {
			it('should have exactly one producer per topic (or null for external)', () => {
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					// Producer is either null or a single module name
					expect(metadata.producer === null || typeof metadata.producer === 'string').toBe(true)
				}
			})

			it('should have at least one consumer per topic', () => {
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					expect(metadata.consumers.length).toBeGreaterThan(0)
				}
			})

			it('should not have a module consuming its own produced events directly', () => {
				// A module shouldn't be both producer and consumer of same topic
				for (const topic of Topics.All) {
					const metadata = Topics.Metadata[topic as Topics.Type]
					if (metadata.producer !== null) {
						expect(metadata.consumers).not.toContain(metadata.producer)
					}
				}
			})
		})
	})

	describe('Type Safety', () => {
		it('should have type-safe topic references', () => {
			// These should compile without errors (TypeScript level)
			const timerCommands: Topics.Timer.Topic = Topics.Timer.Commands
			const timerEvents: Topics.Timer.Topic = Topics.Timer.Events

			expect(timerCommands).toBe('timer.commands')
			expect(timerEvents).toBe('timer.events')
		})

		it('should have type-safe module references', () => {
			const modules: Topics.Module[] = ['Api', 'Orchestration', 'Execution', 'Timer']
			expect(modules).toHaveLength(4)
		})

		it('should have Topics.Type union covering all topics', () => {
			// Runtime verification that all topics conform to Topics.Type
			for (const topic of Topics.All) {
				expect(Topics.isTopic(topic)).toBe(true)
			}
		})
	})

	describe('Documentation Completeness', () => {
		it('should have descriptions for all topics', () => {
			for (const topic of Topics.All) {
				const metadata = Topics.Metadata[topic as Topics.Type]
				expect(metadata.description.length).toBeGreaterThan(10) // Meaningful description
			}
		})

		it('should mention message examples in descriptions', () => {
			// Timer.Commands mentions ScheduleTimer
			expect(Topics.Metadata[Topics.Timer.Commands].description).toMatch(/ScheduleTimer/i)

			// Timer.Events mentions DueTimeReached
			expect(Topics.Metadata[Topics.Timer.Events].description).toMatch(/DueTimeReached/i)

			// Orchestration.Events mentions service call events
			expect(Topics.Metadata[Topics.Orchestration.Events].description).toMatch(/ServiceCall/i)
		})
	})
})
