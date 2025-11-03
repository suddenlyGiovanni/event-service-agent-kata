import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import * as Execution from './index.ts'

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
					_tag: Execution.Events.ExecutionStarted.Tag,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Execution.Events.ExecutionStarted.Dto

				const event: Execution.Events.ExecutionStarted.Type = yield* Execution.Events.ExecutionStarted.decode(dto)

				expect(event._tag).toBe(Execution.Events.ExecutionStarted.Tag)
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
					_tag: Execution.Events.ExecutionStarted.Tag,
					serviceCallId,
					startedAt,
					tenantId: 'not-a-uuid',
				} as Execution.Events.ExecutionStarted.Dto

				const exit = yield* Effect.exit(Execution.Events.ExecutionStarted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid startedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionStarted.Tag,
					serviceCallId,
					startedAt: 'not-a-date',
					tenantId,
				} as Execution.Events.ExecutionStarted.Dto

				const exit = yield* Effect.exit(Execution.Events.ExecutionStarted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Execution.Events.ExecutionStarted.Type = yield* Execution.Events.ExecutionStarted.decode({
					_tag: Execution.Events.ExecutionStarted.Tag,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Execution.Events.ExecutionStarted.Dto)

				const dto: Execution.Events.ExecutionStarted.Dto = yield* Execution.Events.ExecutionStarted.encode(domainEvent)

				expect(dto._tag).toBe(Execution.Events.ExecutionStarted.Tag)
				expect(dto.tenantId).toBe(tenantId)
			}),
		)
	})

	describe('ExecutionSucceeded', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionSucceeded.Tag,
					finishedAt,
					responseMeta,
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionSucceeded.Dto

				const event: Execution.Events.ExecutionSucceeded.Type = yield* Execution.Events.ExecutionSucceeded.decode(dto)

				expect(event._tag).toBe(Execution.Events.ExecutionSucceeded.Tag)
				expect(event.responseMeta.status).toBe(200)
				expect(event.responseMeta.latencyMs).toBe(1500)
			}),
		)

		it.effect('decodes event with optional responseMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionSucceeded.Tag,
					finishedAt,
					responseMeta: {
						bodySnippet: 'Success response body...',
						headers: { 'Content-Type': 'application/json' },
						latencyMs: 1500,
						status: 200,
					},
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionSucceeded.Dto

				const event: Execution.Events.ExecutionSucceeded.Type = yield* Execution.Events.ExecutionSucceeded.decode(dto)

				expect(event.responseMeta.bodySnippet).toBe('Success response body...')
				expect(event.responseMeta.headers).toEqual({ 'Content-Type': 'application/json' })
			}),
		)

		it.effect('rejects invalid status code', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionSucceeded.Tag,
					finishedAt,
					responseMeta: {
						status: 'not-a-number' as unknown as number,
					},
					serviceCallId,
					tenantId,
				}

				const exit = yield* Effect.exit(Execution.Events.ExecutionSucceeded.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Execution.Events.ExecutionSucceeded.Type = yield* Execution.Events.ExecutionSucceeded.decode(
					{
						_tag: Execution.Events.ExecutionSucceeded.Tag,
						finishedAt,
						responseMeta: {
							status: 200,
						},
						serviceCallId,
						tenantId,
					} satisfies Execution.Events.ExecutionSucceeded.Dto,
				)

				const dto: Execution.Events.ExecutionSucceeded.Dto =
					yield* Execution.Events.ExecutionSucceeded.encode(domainEvent)

				expect(dto._tag).toBe(Execution.Events.ExecutionSucceeded.Tag)
				expect(dto.responseMeta.status).toBe(200)
			}),
		)
	})

	describe('ExecutionFailed', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionFailed.Tag,
					errorMeta: {
						kind: 'NetworkError' as const,
						message: 'Connection timeout',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionFailed.Dto

				const event: Execution.Events.ExecutionFailed.Type = yield* Execution.Events.ExecutionFailed.decode(dto)

				expect(event._tag).toBe(Execution.Events.ExecutionFailed.Tag)
				expect(event.errorMeta.kind).toBe('NetworkError')
				expect(event.errorMeta.message).toBe('Connection timeout')
			}),
		)

		it.effect('decodes event with optional errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionFailed.Tag,
					errorMeta: {
						details: { retry: false, statusCode: 500 },
						kind: 'HttpError' as const,
						latencyMs: 5000,
						message: 'Internal Server Error',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionFailed.Dto

				const event: Execution.Events.ExecutionFailed.Type = yield* Execution.Events.ExecutionFailed.decode(dto)

				expect(event.errorMeta.details).toEqual({ retry: false, statusCode: 500 })
				expect(event.errorMeta.latencyMs).toBe(5000)
			}),
		)

		it.effect('rejects missing required errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionFailed.Tag,
					errorMeta: {} as { kind: string; message?: string },
					finishedAt,
					serviceCallId,
					tenantId,
				}

				const exit = yield* Effect.exit(Execution.Events.ExecutionFailed.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Execution.Events.ExecutionFailed.Type = yield* Execution.Events.ExecutionFailed.decode({
					_tag: Execution.Events.ExecutionFailed.Tag,
					errorMeta: {
						kind: 'NetworkError' as const,
						message: 'Connection refused',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionFailed.Dto)

				const dto: Execution.Events.ExecutionFailed.Dto = yield* Execution.Events.ExecutionFailed.encode(domainEvent)

				expect(dto._tag).toBe(Execution.Events.ExecutionFailed.Tag)
				expect(dto.errorMeta.kind).toBe('NetworkError')
			}),
		)
	})

	describe('Events Union', () => {
		it.effect('accepts ExecutionStarted', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionStarted.Tag,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Execution.Events.ExecutionStarted.Dto

				const event = yield* Schema.decode(Execution.Events.Events)(dto)
				expect(event._tag).toBe(Execution.Events.ExecutionStarted.Tag)
			}),
		)

		it.effect('accepts ExecutionSucceeded', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionSucceeded.Tag,
					finishedAt,
					responseMeta: { status: 200 },
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionSucceeded.Dto

				const event = yield* Schema.decode(Execution.Events.Events)(dto)
				expect(event._tag).toBe(Execution.Events.ExecutionSucceeded.Tag)
			}),
		)

		it.effect('accepts ExecutionFailed', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Execution.Events.ExecutionFailed.Tag,
					errorMeta: { kind: 'NetworkError' as const, message: 'Timeout' },
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Execution.Events.ExecutionFailed.Dto

				const event = yield* Schema.decode(Execution.Events.Events)(dto)
				expect(event._tag).toBe(Execution.Events.ExecutionFailed.Tag)
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
				const exit = yield* Effect.exit(Schema.decode(Execution.Events.Events)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})
})
