import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import { Tag } from '../tag.ts'
import * as Events from './events.schema.ts'

describe('Execution Events Schema', () => {
	// Extract common test data
	const tenantId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a'
	const serviceCallId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b'
	const startedAt = '2025-10-28T12:00:00.000Z'
	const finishedAt = '2025-10-28T12:01:00.000Z'
	const responseMeta = {
		latencyMs: 1500,
		status: 200,
	}

	describe('ExecutionStarted', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionStarted,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Events.ExecutionStarted.Dto

				const event: Events.ExecutionStarted.Type = yield* Events.ExecutionStarted.decode(dto)

				expect(event._tag).toBe(Tag.Execution.Events.ExecutionStarted)
				expect(event.tenantId).toBe(dto.tenantId)
				expect(event.serviceCallId).toBe(dto.serviceCallId)

				// ✅ CORRECT: Test domain type (DateTime.Utc), not encoded format
				expect(DateTime.isDateTime(event.startedAt)).toBe(true)
				expect(DateTime.isUtc(event.startedAt)).toBe(true)
			}),
		)

		it.effect('rejects invalid tenantId', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionStarted,
					serviceCallId,
					startedAt,
					tenantId: 'not-a-uuid',
				} as Events.ExecutionStarted.Dto

				const exit = yield* Effect.exit(Events.ExecutionStarted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid startedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionStarted,
					serviceCallId,
					startedAt: 'not-a-date',
					tenantId,
				} as Events.ExecutionStarted.Dto

				const exit = yield* Effect.exit(Events.ExecutionStarted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Events.ExecutionStarted.Type = yield* Events.ExecutionStarted.decode({
					_tag: Tag.Execution.Events.ExecutionStarted,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Events.ExecutionStarted.Dto)

				const dto: Events.ExecutionStarted.Dto = yield* Events.ExecutionStarted.encode(domainEvent)

				expect(dto._tag).toBe(Tag.Execution.Events.ExecutionStarted)
				expect(dto.tenantId).toBe(tenantId)
			}),
		)
	})

	describe('ExecutionSucceeded', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionSucceeded,
					finishedAt,
					responseMeta,
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionSucceeded.Dto

				const event: Events.ExecutionSucceeded.Type = yield* Events.ExecutionSucceeded.decode(dto)

				expect(event._tag).toBe(Tag.Execution.Events.ExecutionSucceeded)
				expect(event.responseMeta.status).toBe(200)
				expect(event.responseMeta.latencyMs).toBe(1500)
			}),
		)

		it.effect('decodes event with optional responseMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionSucceeded,
					finishedAt,
					responseMeta: {
						bodySnippet: 'Success response body...',
						headers: { 'Content-Type': 'application/json' },
						latencyMs: 1500,
						status: 200,
					},
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionSucceeded.Dto

				const event: Events.ExecutionSucceeded.Type = yield* Events.ExecutionSucceeded.decode(dto)

				expect(event.responseMeta.bodySnippet).toBe('Success response body...')
				expect(event.responseMeta.headers).toEqual({ 'Content-Type': 'application/json' })
			}),
		)

		it.effect('rejects invalid status code', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionSucceeded,
					finishedAt,
					responseMeta: {
						status: 'not-a-number' as unknown as number,
					},
					serviceCallId,
					tenantId,
				}

				const exit = yield* Effect.exit(Events.ExecutionSucceeded.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Events.ExecutionSucceeded.Type = yield* Events.ExecutionSucceeded.decode({
					_tag: Tag.Execution.Events.ExecutionSucceeded,
					finishedAt,
					responseMeta: {
						status: 200,
					},
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionSucceeded.Dto)

				const dto: Events.ExecutionSucceeded.Dto = yield* Events.ExecutionSucceeded.encode(domainEvent)

				expect(dto._tag).toBe(Tag.Execution.Events.ExecutionSucceeded)
				expect(dto.responseMeta.status).toBe(200)
			}),
		)
	})

	describe('ExecutionFailed', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionFailed,
					errorMeta: {
						kind: 'NetworkError' as const,
						message: 'Connection timeout',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionFailed.Dto

				const event: Events.ExecutionFailed.Type = yield* Events.ExecutionFailed.decode(dto)

				expect(event._tag).toBe(Tag.Execution.Events.ExecutionFailed)
				expect(event.errorMeta.kind).toBe('NetworkError')
				expect(event.errorMeta.message).toBe('Connection timeout')
			}),
		)

		it.effect('decodes event with optional errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionFailed,
					errorMeta: {
						details: { retry: false, statusCode: 500 },
						kind: 'HttpError' as const,
						latencyMs: 5000,
						message: 'Internal Server Error',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionFailed.Dto

				const event: Events.ExecutionFailed.Type = yield* Events.ExecutionFailed.decode(dto)

				expect(event.errorMeta.details).toEqual({ retry: false, statusCode: 500 })
				expect(event.errorMeta.latencyMs).toBe(5000)
			}),
		)

		it.effect('rejects missing required errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionFailed,
					errorMeta: {} as { kind: string; message?: string },
					finishedAt,
					serviceCallId,
					tenantId,
				}

				const exit = yield* Effect.exit(Events.ExecutionFailed.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Events.ExecutionFailed.Type = yield* Events.ExecutionFailed.decode({
					_tag: Tag.Execution.Events.ExecutionFailed,
					errorMeta: {
						kind: 'NetworkError' as const,
						message: 'Connection refused',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionFailed.Dto)

				const dto: Events.ExecutionFailed.Dto = yield* Events.ExecutionFailed.encode(domainEvent)

				expect(dto._tag).toBe(Tag.Execution.Events.ExecutionFailed)
				expect(dto.errorMeta.kind).toBe('NetworkError')
			}),
		)
	})

	describe('Events Union', () => {
		it.effect('accepts ExecutionStarted', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionStarted,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Events.ExecutionStarted.Dto

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe(Tag.Execution.Events.ExecutionStarted)
			}),
		)

		it.effect('accepts ExecutionSucceeded', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionSucceeded,
					finishedAt,
					responseMeta: { status: 200 },
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionSucceeded.Dto

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe(Tag.Execution.Events.ExecutionSucceeded)
			}),
		)

		it.effect('accepts ExecutionFailed', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Tag.Execution.Events.ExecutionFailed,
					errorMeta: { kind: 'NetworkError' as const, message: 'Timeout' },
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Events.ExecutionFailed.Dto

				const event = yield* Schema.decode(Events.Events)(dto)
				expect(event._tag).toBe(Tag.Execution.Events.ExecutionFailed)
			}),
		)

		it.effect('rejects invalid _tag', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'InvalidEvent' as const,
					errorMeta: { kind: 'test', message: 'test' },
					finishedAt,
					serviceCallId,
					startedAt,
					tenantId,
				}

				// @ts-expect-error Testing invalid _tag
				const exit = yield* Effect.exit(Schema.decode(Events.Events)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})
})
