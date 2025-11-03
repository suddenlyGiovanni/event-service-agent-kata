import { describe, expect, it } from '@effect/vitest'
import { assertEquals, assertNone } from '@effect/vitest/utils'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import * as Messages from '../messages/index.ts'
import { EnvelopeId, ServiceCallId, TenantId } from '../shared/index.ts'
import { MessageEnvelope } from './message-envelope.schema.ts'

describe('MessageEnvelope', () => {
	// Extract common test data
	const tenantId = '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0' as const
	const serviceCallId = '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1' as const
	const envelopeId = '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2' as const
	const reachedAt = '2025-10-27T12:00:00.000Z'
	const timestampMs = 1730030400000

	describe('decodeJson', () => {
		it.effect('decodes valid envelope with DueTimeReached payload', () =>
			Effect.gen(function* () {
				// Arrange: Valid JSON envelope with Timer event
				const json = JSON.stringify({
					aggregateId: serviceCallId,
					id: envelopeId,
					payload: {
						_tag: Messages.Timer.Events.DueTimeReached.Tag,
						reachedAt,
						serviceCallId,
						tenantId,
					} satisfies Messages.Timer.Events.DueTimeReached.Dto,
					tenantId,
					timestampMs,
					type: Messages.Timer.Events.DueTimeReached.Tag,
				} satisfies MessageEnvelope.Dto)

				// Act: Decode from JSON
				const envelope = yield* MessageEnvelope.decodeJson(json)

				// Assert: Envelope structure validated
				expect(envelope.type).toBe(Messages.Timer.Events.DueTimeReached.Tag)
				expect(envelope.tenantId).toBe(tenantId)
				// timestampMs decoded as DateTime.Utc (Schema.DateTimeUtcFromNumber)
				expect(DateTime.isDateTime(envelope.timestampMs)).toBe(true)
				expect(DateTime.isUtc(envelope.timestampMs)).toBe(true)
				expect(envelope.timestampMs.epochMillis).toBe(timestampMs)

				// Assert: Payload is DueTimeReached with correct structure
				MessageEnvelope.matchPayload(envelope).pipe(
					Match.tag(Messages.Timer.Events.DueTimeReached.Tag, payload => {
						expect(payload.tenantId).toBe(tenantId)
						expect(payload.serviceCallId).toBe(serviceCallId)

						// reachedAt is Option<DateTime.Utc>
						expect(Option.isSome(payload.reachedAt)).toBe(true)
						const reachedAtField = Option.getOrThrow(payload.reachedAt)
						expect(DateTime.isDateTime(reachedAtField)).toBe(true)
						expect(DateTime.isUtc(reachedAtField)).toBe(true)
					}),
					Match.orElseAbsurd,
				)
			}),
		)

		it.effect('decodes envelope without optional fields', () =>
			Effect.gen(function* () {
				// Arrange: Minimal valid envelope
				const json = JSON.stringify({
					_tag: 'MessageEnvelope',
					id: envelopeId,
					payload: {
						_tag: Messages.Timer.Events.DueTimeReached.Tag,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs,
					type: Messages.Timer.Events.DueTimeReached.Tag,
				})

				// Act: Decode from JSON
				const envelope = yield* MessageEnvelope.decodeJson(json)

				// Assert: Optional fields are undefined
				assertNone(envelope.aggregateId)
				assertNone(envelope.causationId)
				assertNone(envelope.correlationId)

				// Assert: Payload tag
				MessageEnvelope.matchPayload(envelope).pipe(
					Match.tag(Messages.Timer.Events.DueTimeReached.Tag, payload => {
						expect(payload._tag).toBe(Messages.Timer.Events.DueTimeReached.Tag)
					}),
					Match.orElseAbsurd,
				)
			}),
		)

		it.effect('fails with invalid JSON syntax', () =>
			Effect.gen(function* () {
				// Arrange: Invalid JSON
				const invalidJson = '{ invalid json }'

				// Act: Attempt decode
				const result = yield* Effect.exit(MessageEnvelope.decodeJson(invalidJson))

				// Assert: Fails with parse error
				expect(Exit.isFailure(result)).toBe(true)
			}),
		)

		it.effect('fails with invalid envelope structure', () =>
			Effect.gen(function* () {
				// Arrange: Missing required fields
				const json = JSON.stringify({
					type: Messages.Timer.Events.DueTimeReached.Tag,
					// Missing id, tenantId, payload, timestampMs
				})

				// Act: Attempt decode
				const result = yield* Effect.exit(MessageEnvelope.decodeJson(json))

				// Assert: Fails with validation error
				expect(Exit.isFailure(result)).toBe(true)
			}),
		)

		it.effect('fails with invalid payload type', () =>
			Effect.gen(function* () {
				// Arrange: Unknown payload type
				const json = JSON.stringify({
					_tag: 'MessageEnvelope',
					id: envelopeId,
					payload: {
						_tag: 'UnknownEvent',
						data: 'something',
					},
					tenantId,
					timestampMs,
					type: 'UnknownEvent',
				})

				// Act: Attempt decode
				const result = yield* Effect.exit(MessageEnvelope.decodeJson(json))

				// Assert: Fails with validation error (payload not in union)
				expect(Exit.isFailure(result)).toBe(true)
			}),
		)

		it.effect('fails when type does not match payload._tag', () =>
			Effect.gen(function* () {
				// Arrange: type and payload._tag mismatch
				const json = JSON.stringify({
					id: envelopeId,
					payload: {
						_tag: Messages.Timer.Events.DueTimeReached.Tag,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs,
					// ❌ Mismatch: type says ScheduleTimer but payload is DueTimeReached
					type: Messages.Orchestration.Commands.ScheduleTimer.Tag,
				})

				// Act: Attempt decode
				const result = yield* Effect.exit(MessageEnvelope.decodeJson(json))

				// Assert: Fails with filter validation error
				expect(Exit.isFailure(result)).toBe(true)

				// Assert: Error message explains the mismatch
				if (Exit.isFailure(result)) {
					const message = result.cause.toString()
					expect(message).toContain('type must match payload._tag')
					expect(message).toContain('DueTimeReached')
					expect(message).toContain('ScheduleTimer')
				}
			}),
		)
	})

	describe('encodeJson', () => {
		it.effect('encodes envelope to JSON string', () =>
			Effect.gen(function* () {
				// Arrange: Create envelope with properly typed DueTimeReached (DateTime.Utc)
				const reachedAtField = DateTime.unsafeMake(reachedAt)
				const timestampUtc = DateTime.unsafeMake(timestampMs) // Convert number to DateTime.Utc
				const dueTimeReached = new Messages.Timer.Events.DueTimeReached({
					reachedAt: Option.some(reachedAtField),
					serviceCallId: ServiceCallId.make(serviceCallId),
					tenantId: TenantId.make(tenantId),
				})

				const envelope = new MessageEnvelope({
					aggregateId: Option.none(),
					causationId: Option.none(),
					correlationId: Option.none(),
					id: EnvelopeId.make(envelopeId),
					payload: dueTimeReached,
					tenantId: TenantId.make(tenantId),
					timestampMs: timestampUtc, // DateTime.Utc (will encode to number)
					type: Messages.Timer.Events.DueTimeReached.Tag,
				})

				// Act: Encode to JSON (DateTime → ISO8601 string)
				const json: string = yield* MessageEnvelope.encodeJson(envelope)

				// Assert: Valid JSON string
				expect(json).toBeTypeOf('string')
				const parsed = JSON.parse(json) as Record<string, unknown>
				expect(parsed['type']).toBe(Messages.Timer.Events.DueTimeReached.Tag)
				expect(parsed['tenantId']).toBe(tenantId)

				// Validate payload structure (untyped JSON)
				const payload = parsed['payload'] as { _tag: string }
				expect(payload._tag).toBe(Messages.Timer.Events.DueTimeReached.Tag)
			}),
		)

		it.effect('round-trips correctly', () =>
			Effect.gen(function* () {
				// Arrange: Create envelope with properly typed DueTimeReached (DateTime.Utc)
				const reachedAtField = DateTime.unsafeMake(reachedAt)
				const timestampUtc = DateTime.unsafeMake(timestampMs) // Convert number to DateTime.Utc
				const dueTimeReached: Messages.Timer.Events.DueTimeReached.Type = new Messages.Timer.Events.DueTimeReached({
					reachedAt: Option.some(reachedAtField),
					serviceCallId: ServiceCallId.make(serviceCallId),
					tenantId: TenantId.make(tenantId),
				})

				const original = new MessageEnvelope({
					aggregateId: Option.some(ServiceCallId.make(serviceCallId)),
					causationId: Option.none(),
					correlationId: Option.none(),
					id: EnvelopeId.make(envelopeId),
					payload: dueTimeReached,
					tenantId: TenantId.make(tenantId),
					timestampMs: timestampUtc, // DateTime.Utc (will encode to number)
					type: Messages.Timer.Events.DueTimeReached.Tag,
				})
				// Act: Encode then decode
				const json: string = yield* MessageEnvelope.encodeJson(original)
				const decoded: MessageEnvelope.Type = yield* MessageEnvelope.decodeJson(json)

				// Assert: Round-trip preserves data
				expect(decoded.type).toBe(original.type)
				expect(decoded.tenantId).toBe(original.tenantId)
				// timestampMs: DateTime.Utc instances (compare via DateTime.Equivalence)
				expect(DateTime.Equivalence(decoded.timestampMs, original.timestampMs)).toBe(true)
				assertEquals(decoded.aggregateId, original.aggregateId)

				// Assert: Payload matches using matchPayload
				MessageEnvelope.matchPayload(decoded).pipe(
					Match.tag(Messages.Timer.Events.DueTimeReached.Tag, payload => {
						expect(payload._tag).toBe(original.payload._tag)
					}),
					Match.orElseAbsurd,
				)
			}),
		)
	})
})
