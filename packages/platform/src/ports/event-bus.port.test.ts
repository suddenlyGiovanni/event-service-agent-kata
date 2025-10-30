import { describe, expect, it } from 'vitest'

import { PublishError, SubscribeError } from './event-bus.port.ts'

describe('EventBusPort Error Classes', () => {
	describe('PublishError', () => {
		it('should create error with cause', () => {
			const cause = 'Connection to broker failed'
			const error = new PublishError({ cause })

			expect(error).toBeInstanceOf(PublishError)
			expect(error.cause).toBe(cause)
			expect(error._tag).toBe('PublishError')
		})

		it('should have _tag property for discrimination', () => {
			const error = new PublishError({ cause: 'test' })

			expect(error._tag).toBe('PublishError')
		})

		it('should be instanceof Error', () => {
			const error = new PublishError({ cause: 'test' })

			expect(error).toBeInstanceOf(Error)
		})

		it('should have message property', () => {
			const error = new PublishError({ cause: 'test cause' })

			expect(error.message).toBeDefined()
			expect(typeof error.message).toBe('string')
		})

		it('should support different cause types', () => {
			const errors = [
				new PublishError({ cause: 'Stream not found' }),
				new PublishError({ cause: 'Subject not allowed' }),
				new PublishError({ cause: 'Network timeout' }),
				new PublishError({ cause: 'Broker disconnected' }),
			]

			for (const error of errors) {
				expect(error).toBeInstanceOf(PublishError)
				expect(error.cause).toBeDefined()
			}
		})

		it('should preserve cause in error details', () => {
			const detailedCause = 'NATS: Stream "events" not found in account'
			const error = new PublishError({ cause: detailedCause })

			expect(error.cause).toBe(detailedCause)
		})

		it('should handle empty cause', () => {
			const error = new PublishError({ cause: '' })

			expect(error.cause).toBe('')
			expect(error._tag).toBe('PublishError')
		})

		it('should handle long cause messages', () => {
			const longCause = 'A'.repeat(1000)
			const error = new PublishError({ cause: longCause })

			expect(error.cause).toBe(longCause)
			expect(error.cause.length).toBe(1000)
		})

		it('should be serializable to JSON', () => {
			const error = new PublishError({ cause: 'test cause' })

			// Effect Data types are typically serializable
			const serialized = JSON.stringify(error)
			expect(serialized).toContain('PublishError')
		})

		it('should support error matching by tag', () => {
			const error = new PublishError({ cause: 'test' })

			// Pattern matching by _tag
			const matchResult = error._tag === 'PublishError' ? 'matched' : 'not matched'
			expect(matchResult).toBe('matched')
		})
	})

	describe('SubscribeError', () => {
		it('should create error with cause', () => {
			const cause = 'Consumer creation failed'
			const error = new SubscribeError({ cause })

			expect(error).toBeInstanceOf(SubscribeError)
			expect(error.cause).toBe(cause)
			expect(error._tag).toBe('SubscribeError')
		})

		it('should have _tag property for discrimination', () => {
			const error = new SubscribeError({ cause: 'test' })

			expect(error._tag).toBe('SubscribeError')
		})

		it('should be instanceof Error', () => {
			const error = new SubscribeError({ cause: 'test' })

			expect(error).toBeInstanceOf(Error)
		})

		it('should have message property', () => {
			const error = new SubscribeError({ cause: 'test cause' })

			expect(error.message).toBeDefined()
			expect(typeof error.message).toBe('string')
		})

		it('should support different cause types', () => {
			const errors = [
				new SubscribeError({ cause: 'Consumer already exists' }),
				new SubscribeError({ cause: 'Stream not found' }),
				new SubscribeError({ cause: 'Permission denied' }),
				new SubscribeError({ cause: 'Connection lost' }),
			]

			for (const error of errors) {
				expect(error).toBeInstanceOf(SubscribeError)
				expect(error.cause).toBeDefined()
			}
		})

		it('should preserve cause in error details', () => {
			const detailedCause = 'NATS: Consumer "timer-consumer" already exists in stream "commands"'
			const error = new SubscribeError({ cause: detailedCause })

			expect(error.cause).toBe(detailedCause)
		})

		it('should handle empty cause', () => {
			const error = new SubscribeError({ cause: '' })

			expect(error.cause).toBe('')
			expect(error._tag).toBe('SubscribeError')
		})

		it('should handle long cause messages', () => {
			const longCause = 'B'.repeat(1000)
			const error = new SubscribeError({ cause: longCause })

			expect(error.cause).toBe(longCause)
			expect(error.cause.length).toBe(1000)
		})

		it('should be serializable to JSON', () => {
			const error = new SubscribeError({ cause: 'test cause' })

			// Effect Data types are typically serializable
			const serialized = JSON.stringify(error)
			expect(serialized).toContain('SubscribeError')
		})

		it('should support error matching by tag', () => {
			const error = new SubscribeError({ cause: 'test' })

			// Pattern matching by _tag
			const matchResult = error._tag === 'SubscribeError' ? 'matched' : 'not matched'
			expect(matchResult).toBe('matched')
		})
	})

	describe('Error Discrimination', () => {
		it('should distinguish PublishError from SubscribeError by tag', () => {
			const publishError = new PublishError({ cause: 'publish failed' })
			const subscribeError = new SubscribeError({ cause: 'subscribe failed' })

			expect(publishError._tag).not.toBe(subscribeError._tag)
			expect(publishError._tag).toBe('PublishError')
			expect(subscribeError._tag).toBe('SubscribeError')
		})

		it('should allow type-safe error handling', () => {
			const errors: Array<PublishError | SubscribeError> = [
				new PublishError({ cause: 'test1' }),
				new SubscribeError({ cause: 'test2' }),
			]

			const results = errors.map(error => {
				switch (error._tag) {
					case 'PublishError':
						return 'publish'
					case 'SubscribeError':
						return 'subscribe'
				}
			})

			expect(results).toEqual(['publish', 'subscribe'])
		})

		it('should support instanceof checks', () => {
			const publishError = new PublishError({ cause: 'test' })
			const subscribeError = new SubscribeError({ cause: 'test' })

			expect(publishError instanceof PublishError).toBe(true)
			expect(publishError instanceof SubscribeError).toBe(false)

			expect(subscribeError instanceof SubscribeError).toBe(true)
			expect(subscribeError instanceof PublishError).toBe(false)
		})
	})

	describe('Error Usage Patterns', () => {
		it('should support wrapping adapter-specific errors', () => {
			// Simulate adapter mapping broker error to generic error
			const brokerSpecificError = new Error('NATS: timeout')
			const wrappedError = new PublishError({
				cause: `Broker error: ${brokerSpecificError.message}`,
			})

			expect(wrappedError.cause).toContain('NATS: timeout')
		})

		it('should support error context information', () => {
			const error = new PublishError({
				cause: 'Failed to publish to stream "events" on subject "timer.commands"',
			})

			expect(error.cause).toContain('events')
			expect(error.cause).toContain('timer.commands')
		})

		it('should support error chaining information', () => {
			const originalError = 'Connection timeout after 5000ms'
			const contextualError = new SubscribeError({
				cause: `Subscribe failed: ${originalError}`,
			})

			expect(contextualError.cause).toContain(originalError)
		})
	})

	describe('Edge Cases', () => {
		it('should handle cause with special characters', () => {
			const specialCause = 'Error: "Connection failed" @ host:port\n\tRetry failed'
			const error = new PublishError({ cause: specialCause })

			expect(error.cause).toBe(specialCause)
		})

		it('should handle cause with unicode', () => {
			const unicodeCause = 'Error: 连接失败 🔥'
			const error = new SubscribeError({ cause: unicodeCause })

			expect(error.cause).toBe(unicodeCause)
		})

		it('should handle multiple error instances', () => {
			const errors = Array.from({ length: 100 }, (_, i) => new PublishError({ cause: `error ${i}` }))

			expect(errors).toHaveLength(100)
			expect(errors[0].cause).toBe('error 0')
			expect(errors[99].cause).toBe('error 99')
		})
	})
})