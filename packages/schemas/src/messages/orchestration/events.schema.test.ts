import { describe, expect, expectTypeOf, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import * as Events from './events.schema.ts'

describe('Orchestration Events Schema', () => {
	describe('ServiceCallSubmitted', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSubmitted' as const,
					name: 'Test Service Call',
					requestSpec: {
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					submittedAt: '2025-10-28T12:00:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallSubmitted.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallSubmitted.Type>()
				expect(event._tag).toBe('ServiceCallSubmitted')
				expect(event.name).toBe('Test Service Call')
				expect(event.requestSpec.method).toBe('POST')
			}),
		)

		it.effect('decodes event with optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSubmitted' as const,
					name: 'Test Service Call',
					requestSpec: {
						bodySnippet: 'Request body preview...',
						headers: { 'Content-Type': 'application/json' },
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					submittedAt: '2025-10-28T12:00:00.000Z',
					tags: ['urgent', 'production'],
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallSubmitted.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallSubmitted.Type>()
				expect(event.tags).toEqual(['urgent', 'production'])
				expect(event.requestSpec.bodySnippet).toBe('Request body preview...')
			}),
		)

		it.effect('rejects invalid submittedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSubmitted' as const,
					name: 'Test',
					requestSpec: { method: 'POST', url: 'https://example.com' },
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					submittedAt: 'not-a-date',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ServiceCallSubmitted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})

	describe('ServiceCallScheduled', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallScheduled' as const,
					dueAt: '2025-10-28T12:05:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallScheduled.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallScheduled.Type>()
				expect(event._tag).toBe('ServiceCallScheduled')
				expect(DateTime.formatIso(event.dueAt)).toBe('2025-10-28T12:05:00.000Z')
			}),
		)

		it.effect('rejects invalid dueAt format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallScheduled' as const,
					dueAt: 'not-a-date',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ServiceCallScheduled.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent = yield* Events.ServiceCallScheduled.decode({
					_tag: 'ServiceCallScheduled' as const,
					dueAt: '2025-10-28T12:05:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				const dto = yield* Events.ServiceCallScheduled.encode(domainEvent)

				expectTypeOf(dto).toEqualTypeOf<Events.ServiceCallScheduled.Dto>()
				expect(dto._tag).toBe('ServiceCallScheduled')
				expect(dto.dueAt).toBe('2025-10-28T12:05:00.000Z')
			}),
		)
	})

	describe('ServiceCallRunning', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallRunning' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:05:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallRunning.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallRunning.Type>()
				expect(event._tag).toBe('ServiceCallRunning')
				expect(DateTime.formatIso(event.startedAt)).toBe('2025-10-28T12:05:00.000Z')
			}),
		)

		it.effect('rejects invalid startedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallRunning' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: 'not-a-date',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ServiceCallRunning.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})

	describe('ServiceCallSucceeded', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSucceeded' as const,
					finishedAt: '2025-10-28T12:06:00.000Z',
					responseMeta: {
						status: 200,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallSucceeded.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallSucceeded.Type>()
				expect(event._tag).toBe('ServiceCallSucceeded')
				expect(event.responseMeta.status).toBe(200)
			}),
		)

		it.effect('decodes event with optional responseMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSucceeded' as const,
					finishedAt: '2025-10-28T12:06:00.000Z',
					responseMeta: {
						bodySnippet: 'Success response...',
						headers: { 'Content-Type': 'application/json' },
						latencyMs: 1500,
						status: 200,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallSucceeded.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallSucceeded.Type>()
				expect(event.responseMeta.latencyMs).toBe(1500)
				expect(event.responseMeta.bodySnippet).toBe('Success response...')
			}),
		)

		it.effect('rejects invalid status code type', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSucceeded' as const,
					finishedAt: '2025-10-28T12:06:00.000Z',
					responseMeta: {
						status: 'not-a-number' as unknown as number,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ServiceCallSucceeded.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent = yield* Events.ServiceCallSucceeded.decode({
					_tag: 'ServiceCallSucceeded' as const,
					finishedAt: '2025-10-28T12:06:00.000Z',
					responseMeta: { status: 200 },
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				const dto = yield* Events.ServiceCallSucceeded.encode(domainEvent)

				expectTypeOf(dto).toEqualTypeOf<Events.ServiceCallSucceeded.Dto>()
				expect(dto._tag).toBe('ServiceCallSucceeded')
				expect(dto.responseMeta.status).toBe(200)
			}),
		)
	})

	describe('ServiceCallFailed', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallFailed' as const,
					errorMeta: {
						kind: 'NetworkError',
						message: 'Connection refused',
					},
					finishedAt: '2025-10-28T12:06:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallFailed.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallFailed.Type>()
				expect(event._tag).toBe('ServiceCallFailed')
				expect(event.errorMeta.kind).toBe('NetworkError')
				expect(event.errorMeta.message).toBe('Connection refused')
			}),
		)

		it.effect('decodes event with optional errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallFailed' as const,
					errorMeta: {
						details: { retryable: false, statusCode: 500 },
						kind: 'HttpError',
						latencyMs: 5000,
						message: 'Internal Server Error',
					},
					finishedAt: '2025-10-28T12:06:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ServiceCallFailed.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Events.ServiceCallFailed.Type>()
				expect(event.errorMeta.latencyMs).toBe(5000)
				expect(event.errorMeta.details).toEqual({ retryable: false, statusCode: 500 })
			}),
		)

		it.effect('rejects missing required errorMeta.kind', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallFailed' as const,
					errorMeta: {
						message: 'Some error',
					} as { kind: string; message?: string },
					finishedAt: '2025-10-28T12:06:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ServiceCallFailed.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent = yield* Events.ServiceCallFailed.decode({
					_tag: 'ServiceCallFailed' as const,
					errorMeta: {
						kind: 'Timeout',
						message: 'Request timeout',
					},
					finishedAt: '2025-10-28T12:06:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				const dto = yield* Events.ServiceCallFailed.encode(domainEvent)

				expectTypeOf(dto).toEqualTypeOf<Events.ServiceCallFailed.Dto>()
				expect(dto._tag).toBe('ServiceCallFailed')
				expect(dto.errorMeta.kind).toBe('Timeout')
			}),
		)
	})

	describe('Events Union', () => {
		it.effect('accepts ServiceCallSubmitted', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSubmitted' as const,
					name: 'Test',
					requestSpec: { method: 'POST', url: 'https://example.com' },
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					submittedAt: '2025-10-28T12:00:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ServiceCallSubmitted')
			}),
		)

		it.effect('accepts ServiceCallScheduled', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallScheduled' as const,
					dueAt: '2025-10-28T12:05:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ServiceCallScheduled')
			}),
		)

		it.effect('accepts ServiceCallRunning', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallRunning' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:05:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ServiceCallRunning')
			}),
		)

		it.effect('accepts ServiceCallSucceeded', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallSucceeded' as const,
					finishedAt: '2025-10-28T12:06:00.000Z',
					responseMeta: { status: 200 },
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ServiceCallSucceeded')
			}),
		)

		it.effect('accepts ServiceCallFailed', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ServiceCallFailed' as const,
					errorMeta: { kind: 'NetworkError', message: 'Timeout' },
					finishedAt: '2025-10-28T12:06:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ServiceCallFailed')
			}),
		)

		it.effect('rejects invalid _tag', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'InvalidEvent' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				// @ts-expect-error Testing invalid _tag
				const exit = yield* Effect.exit(Schema.decode(Events.Events)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})
})
