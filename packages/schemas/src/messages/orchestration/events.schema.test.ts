import { describe, expect, expectTypeOf, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import * as Orchestration from './index.ts'

describe('Orchestration Events Schema', () => {
	// Common test data
	const serviceCallId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b' as const
	const tenantId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a' as const
	const submittedAt = '2025-10-28T12:00:00.000Z' as const
	const dueAt = '2025-10-28T12:05:00.000Z' as const
	const startedAt = '2025-10-28T12:05:00.000Z' as const
	const finishedAt = '2025-10-28T12:06:00.000Z' as const

	describe('ServiceCallSubmitted', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSubmitted.Tag,
					name: 'Test Service Call',
					requestSpec: {
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					serviceCallId,
					submittedAt,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSubmitted.Dto

				const event = yield* Orchestration.Events.ServiceCallSubmitted.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallSubmitted.Type>()
				expect(event._tag).toBe(Orchestration.Events.ServiceCallSubmitted.Tag)
				expect(event.name).toBe('Test Service Call')
				expect(event.requestSpec.method).toBe('POST')

				expect(DateTime.isDateTime(event.submittedAt)).toBe(true)
				expect(DateTime.isUtc(event.submittedAt)).toBe(true)
			}),
		)

		it.effect('decodes event with optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSubmitted.Tag,
					name: 'Test Service Call',
					requestSpec: {
						bodySnippet: 'Request body preview...',
						headers: { 'Content-Type': 'application/json' },
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					serviceCallId,
					submittedAt,
					tags: ['urgent', 'production'],
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSubmitted.Dto

				const event = yield* Orchestration.Events.ServiceCallSubmitted.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallSubmitted.Type>()
				expect(event.tags).toEqual(['urgent', 'production'])
				expect(event.requestSpec.bodySnippet).toBe('Request body preview...')
			}),
		)

		it.effect('rejects invalid submittedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSubmitted.Tag,
					name: 'Test',
					requestSpec: { method: 'POST', url: 'https://example.com' },
					serviceCallId,
					submittedAt: 'not-a-date',
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSubmitted.Dto

				const exit = yield* Effect.exit(Orchestration.Events.ServiceCallSubmitted.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})

	describe('ServiceCallScheduled', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallScheduled.Tag,
					dueAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallScheduled.Dto

				const event = yield* Orchestration.Events.ServiceCallScheduled.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallScheduled.Type>()
				expect(event._tag).toBe(Orchestration.Events.ServiceCallScheduled.Tag)

				expect(DateTime.isDateTime(event.dueAt)).toBe(true)
				expect(DateTime.isUtc(event.dueAt)).toBe(true)
				expect(DateTime.Equivalence(event.dueAt, DateTime.unsafeMake(dto.dueAt))).toBe(true)
			}),
		)

		it.effect('rejects invalid dueAt format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallScheduled.Tag,
					dueAt: 'not-a-date',
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallScheduled.Dto

				const exit = yield* Effect.exit(Orchestration.Events.ServiceCallScheduled.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Orchestration.Events.ServiceCallScheduled.Type =
					yield* Orchestration.Events.ServiceCallScheduled.decode({
						_tag: Orchestration.Events.ServiceCallScheduled.Tag,
						dueAt,
						serviceCallId,
						tenantId,
					})

				const dto: Orchestration.Events.ServiceCallScheduled.Dto =
					yield* Orchestration.Events.ServiceCallScheduled.encode(domainEvent)

				expectTypeOf(dto).toEqualTypeOf<Orchestration.Events.ServiceCallScheduled.Dto>()
				expect(dto._tag).toBe(Orchestration.Events.ServiceCallScheduled.Tag)
				expect(dto.dueAt).toBe(dueAt)
			}),
		)
	})

	describe('ServiceCallRunning', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallRunning.Tag,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallRunning.Dto

				const event = yield* Orchestration.Events.ServiceCallRunning.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallRunning.Type>()
				expect(event._tag).toBe(Orchestration.Events.ServiceCallRunning.Tag)

				expect(DateTime.isDateTime(event.startedAt)).toBe(true)
				expect(DateTime.isUtc(event.startedAt)).toBe(true)
				expect(DateTime.Equivalence(event.startedAt, DateTime.unsafeMake(dto.startedAt))).toBe(true)
			}),
		)

		it.effect('rejects invalid startedAt timestamp', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallRunning.Tag,
					serviceCallId,
					startedAt: 'not-a-date',
					tenantId,
				} satisfies Orchestration.Events.ServiceCallRunning.Dto

				const exit = yield* Effect.exit(Orchestration.Events.ServiceCallRunning.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})

	describe('ServiceCallSucceeded', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSucceeded.Tag,
					finishedAt,
					responseMeta: {
						status: 200,
					},
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSucceeded.Dto

				const event = yield* Orchestration.Events.ServiceCallSucceeded.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallSucceeded.Type>()
				expect(event._tag).toBe(Orchestration.Events.ServiceCallSucceeded.Tag)
				expect(event.responseMeta.status).toBe(200)

				expect(DateTime.isDateTime(event.finishedAt)).toBe(true)
				expect(DateTime.isUtc(event.finishedAt)).toBe(true)
			}),
		)

		it.effect('decodes event with optional responseMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSucceeded.Tag,
					finishedAt,
					responseMeta: {
						bodySnippet: 'Success response...',
						headers: { 'Content-Type': 'application/json' },
						latencyMs: 1500,
						status: 200,
					},
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSucceeded.Dto

				const event = yield* Orchestration.Events.ServiceCallSucceeded.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallSucceeded.Type>()
				expect(event.responseMeta.latencyMs).toBe(1500)
				expect(event.responseMeta.bodySnippet).toBe('Success response...')
			}),
		)

		it.effect('rejects invalid status code type', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSucceeded.Tag,
					finishedAt,
					responseMeta: {
						status: 'not-a-number' as unknown as number,
					},
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSucceeded.Dto

				const exit = yield* Effect.exit(Orchestration.Events.ServiceCallSucceeded.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Orchestration.Events.ServiceCallSucceeded.Type =
					yield* Orchestration.Events.ServiceCallSucceeded.decode({
						_tag: Orchestration.Events.ServiceCallSucceeded.Tag,
						finishedAt,
						responseMeta: { status: 200 },
						serviceCallId,
						tenantId,
					})

				const dto: Orchestration.Events.ServiceCallSucceeded.Dto =
					yield* Orchestration.Events.ServiceCallSucceeded.encode(domainEvent)

				expectTypeOf(dto).toEqualTypeOf<Orchestration.Events.ServiceCallSucceeded.Dto>()
				expect(dto._tag).toBe(Orchestration.Events.ServiceCallSucceeded.Tag)
				expect(dto.responseMeta.status).toBe(200)
			}),
		)
	})

	describe('ServiceCallFailed', () => {
		it.effect('decodes valid event with all required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallFailed.Tag,
					errorMeta: {
						kind: 'NetworkError',
						message: 'Connection refused',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallFailed.Dto

				const event = yield* Orchestration.Events.ServiceCallFailed.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallFailed.Type>()
				expect(event._tag).toBe(Orchestration.Events.ServiceCallFailed.Tag)
				expect(event.errorMeta.kind).toBe('NetworkError')
				expect(event.errorMeta.message).toBe('Connection refused')

				expect(DateTime.isDateTime(event.finishedAt)).toBe(true)
				expect(DateTime.isUtc(event.finishedAt)).toBe(true)
			}),
		)

		it.effect('decodes event with optional errorMeta fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallFailed.Tag,
					errorMeta: {
						details: { retryable: false, statusCode: 500 },
						kind: 'HttpError',
						latencyMs: 5000,
						message: 'Internal Server Error',
					},
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallFailed.Dto

				const event = yield* Orchestration.Events.ServiceCallFailed.decode(dto)

				expectTypeOf(event).toEqualTypeOf<Orchestration.Events.ServiceCallFailed.Type>()
				expect(event.errorMeta.latencyMs).toBe(5000)
				expect(event.errorMeta.details).toEqual({ retryable: false, statusCode: 500 })
			}),
		)

		it.effect('rejects missing required errorMeta.kind', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallFailed.Tag,
					errorMeta: {
						message: 'Some error',
					} as { kind: string; message?: string },
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallFailed.Dto

				const exit = yield* Effect.exit(Orchestration.Events.ServiceCallFailed.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				const domainEvent: Orchestration.Events.ServiceCallFailed.Type =
					yield* Orchestration.Events.ServiceCallFailed.decode({
						_tag: Orchestration.Events.ServiceCallFailed.Tag,
						errorMeta: {
							kind: 'Timeout',
							message: 'Request timeout',
						},
						finishedAt,
						serviceCallId,
						tenantId,
					})

				const dto: Orchestration.Events.ServiceCallFailed.Dto =
					yield* Orchestration.Events.ServiceCallFailed.encode(domainEvent)

				expectTypeOf(dto).toEqualTypeOf<Orchestration.Events.ServiceCallFailed.Dto>()
				expect(dto._tag).toBe(Orchestration.Events.ServiceCallFailed.Tag)
				expect(dto.errorMeta.kind).toBe('Timeout')
			}),
		)
	})

	describe('Events Union', () => {
		it.effect('accepts ServiceCallSubmitted', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSubmitted.Tag,
					name: 'Test',
					requestSpec: { method: 'POST', url: 'https://example.com' },
					serviceCallId,
					submittedAt,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSubmitted.Dto

				const event = yield* Schema.decode(Orchestration.Events.Events)(dto)
				expect(event._tag).toBe(Orchestration.Events.ServiceCallSubmitted.Tag)
			}),
		)

		it.effect('accepts ServiceCallScheduled', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallScheduled.Tag,
					dueAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallScheduled.Dto

				const event = yield* Schema.decode(Orchestration.Events.Events)(dto)
				expect(event._tag).toBe(Orchestration.Events.ServiceCallScheduled.Tag)
			}),
		)

		it.effect('accepts ServiceCallRunning', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallRunning.Tag,
					serviceCallId,
					startedAt,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallRunning.Dto

				const event = yield* Schema.decode(Orchestration.Events.Events)(dto)
				expect(event._tag).toBe(Orchestration.Events.ServiceCallRunning.Tag)
			}),
		)

		it.effect('accepts ServiceCallSucceeded', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallSucceeded.Tag,
					finishedAt,
					responseMeta: { status: 200 },
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallSucceeded.Dto

				const event = yield* Schema.decode(Orchestration.Events.Events)(dto)
				expect(event._tag).toBe(Orchestration.Events.ServiceCallSucceeded.Tag)
			}),
		)

		it.effect('accepts ServiceCallFailed', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Events.ServiceCallFailed.Tag,
					errorMeta: { kind: 'NetworkError', message: 'Timeout' },
					finishedAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Events.ServiceCallFailed.Dto

				const event = yield* Schema.decode(Orchestration.Events.Events)(dto)
				expect(event._tag).toBe(Orchestration.Events.ServiceCallFailed.Tag)
			}),
		)

		it.effect('rejects invalid _tag', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'InvalidEvent' as const,
					serviceCallId,
					tenantId,
				}

				// @ts-expect-error Testing invalid _tag
				const exit = yield* Effect.exit(Schema.decode(Orchestration.Events.Events)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})
})
