import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import * as Events from './events.schema.ts'

describe('Execution Events Schema', () => {
	describe('ExecutionStarted', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionStarted' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:00:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ExecutionStarted.decode(dto)

				expect(event._tag).toBe('ExecutionStarted')
				expect(event.tenantId).toBe(dto.tenantId)
				expect(event.serviceCallId).toBe(dto.serviceCallId)
				expect(DateTime.formatIso(event.startedAt)).toBe(dto.startedAt)
			}),
		)

		it.effect('rejects invalid tenantId', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionStarted' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:00:00.000Z',
					tenantId: 'not-a-uuid',
				}

				const exit = yield* Effect.exit(Events.ExecutionStarted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid startedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionStarted' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: 'not-a-date',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ExecutionStarted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent = yield* Events.ExecutionStarted.decode({
					_tag: 'ExecutionStarted' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:00:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				const dto = yield* Events.ExecutionStarted.encode(domainEvent)

				expect(dto._tag).toBe('ExecutionStarted')
				expect(dto.tenantId).toBe('01931b66-7d50-7c8a-b762-9d2d3e4e5f6a')
			}),
		)
	})

	describe('ExecutionSucceeded', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionSucceeded' as const,
					finishedAt: '2025-10-28T12:01:00.000Z',
					responseMeta: {
						latencyMs: 1500,
						status: 200,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ExecutionSucceeded.decode(dto)

				expect(event._tag).toBe('ExecutionSucceeded')
				expect(event.responseMeta.status).toBe(200)
				expect(event.responseMeta.latencyMs).toBe(1500)
			}),
		)

		it.effect('decodes event with optional responseMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionSucceeded' as const,
					finishedAt: '2025-10-28T12:01:00.000Z',
					responseMeta: {
						bodySnippet: 'Success response body...',
						headers: { 'Content-Type': 'application/json' },
						latencyMs: 1500,
						status: 200,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ExecutionSucceeded.decode(dto)

				expect(event.responseMeta.bodySnippet).toBe('Success response body...')
				expect(event.responseMeta.headers).toEqual({ 'Content-Type': 'application/json' })
			}),
		)

		it.effect('rejects invalid status code', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionSucceeded' as const,
					finishedAt: '2025-10-28T12:01:00.000Z',
					responseMeta: {
						status: 'not-a-number' as unknown as number,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ExecutionSucceeded.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent = yield* Events.ExecutionSucceeded.decode({
					_tag: 'ExecutionSucceeded' as const,
					finishedAt: '2025-10-28T12:01:00.000Z',
					responseMeta: {
						status: 200,
					},
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				const dto = yield* Events.ExecutionSucceeded.encode(domainEvent)

				expect(dto._tag).toBe('ExecutionSucceeded')
				expect(dto.responseMeta.status).toBe(200)
			}),
		)
	})

	describe('ExecutionFailed', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionFailed' as const,
					errorMeta: {
						kind: 'NetworkError',
						message: 'Connection timeout',
					},
					finishedAt: '2025-10-28T12:01:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ExecutionFailed.decode(dto)

				expect(event._tag).toBe('ExecutionFailed')
				expect(event.errorMeta.kind).toBe('NetworkError')
				expect(event.errorMeta.message).toBe('Connection timeout')
			}),
		)

		it.effect('decodes event with optional errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionFailed' as const,
					errorMeta: {
						details: { retry: false, statusCode: 500 },
						kind: 'HttpError',
						latencyMs: 5000,
						message: 'Internal Server Error',
					},
					finishedAt: '2025-10-28T12:01:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Events.ExecutionFailed.decode(dto)

				expect(event.errorMeta.details).toEqual({ retry: false, statusCode: 500 })
				expect(event.errorMeta.latencyMs).toBe(5000)
			}),
		)

		it.effect('rejects missing required errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionFailed' as const,
					errorMeta: {} as { kind: string; message?: string },
					finishedAt: '2025-10-28T12:01:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Events.ExecutionFailed.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent = yield* Events.ExecutionFailed.decode({
					_tag: 'ExecutionFailed' as const,
					errorMeta: {
						kind: 'NetworkError',
						message: 'Connection refused',
					},
					finishedAt: '2025-10-28T12:01:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				const dto = yield* Events.ExecutionFailed.encode(domainEvent)

				expect(dto._tag).toBe('ExecutionFailed')
				expect(dto.errorMeta.kind).toBe('NetworkError')
			}),
		)
	})

	describe('Events Union', () => {
		it.effect('accepts ExecutionStarted', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionStarted' as const,
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:00:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ExecutionStarted')
			}),
		)

		it.effect('accepts ExecutionSucceeded', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionSucceeded' as const,
					finishedAt: '2025-10-28T12:01:00.000Z',
					responseMeta: { status: 200 },
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ExecutionSucceeded')
			}),
		)

		it.effect('accepts ExecutionFailed', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ExecutionFailed' as const,
					errorMeta: { kind: 'NetworkError', message: 'Timeout' },
					finishedAt: '2025-10-28T12:01:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe('ExecutionFailed')
			}),
		)

		it.effect('rejects invalid _tag', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'InvalidEvent' as const,
					errorMeta: { kind: 'test', message: 'test' },
					finishedAt: '2025-10-28T12:01:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					startedAt: '2025-10-28T12:00:00.000Z',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				// @ts-expect-error Testing invalid _tag
				const exit = yield* Effect.exit(Schema.decode(Events.Events)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})
})
