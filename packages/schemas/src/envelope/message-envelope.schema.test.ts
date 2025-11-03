import { assert, describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import * as Messages from '../messages/index.ts'
import { Tag } from '../messages/tag.ts'
import { EnvelopeId, ServiceCallId, TenantId } from '../shared/index.ts'
import { MessageEnvelopeSchema } from './message-envelope.schema.ts'

describe('MessageEnvelopeSchema', () => {
	// Extract common test data
	const tenantId = '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'
	const serviceCallId = '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'
	const envelopeId = '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2'
	const reachedAt = '2025-10-27T12:00:00.000Z'
	const timestampMs = 1730030400000

	describe('decodeJson', () => {
		it.effect('decodes valid envelope with DueTimeReached payload', () =>
			Effect.gen(function* () {
				// Arrange: Valid JSON envelope with Timer event
				const json = JSON.stringify({
					_tag: 'MessageEnvelope',
					aggregateId: serviceCallId,
					id: envelopeId,
					payload: {
						_tag: Tag.Timer.Events.DueTimeReached,
						reachedAt,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs,
					type: Tag.Timer.Events.DueTimeReached,
				})

				// Act: Decode from JSON
				const envelope = yield* MessageEnvelopeSchema.decodeJson(json)

				// Assert: Envelope structure validated
				expect(envelope.type).toBe(Tag.Timer.Events.DueTimeReached)
				expect(envelope.tenantId).toBe(tenantId)
				expect(envelope.timestampMs).toBe(timestampMs)

				// Assert: Payload is DueTimeReached with correct structure
				expect(envelope.payload._tag).toBe(Tag.Timer.Events.DueTimeReached)
				if (envelope.payload._tag === Tag.Timer.Events.DueTimeReached) {
					expect(envelope.payload.tenantId).toBe(tenantId)
					expect(envelope.payload.serviceCallId).toBe(serviceCallId)

					// ✅ CORRECT: Test domain type (DateTime.Utc), not encoded format
					const { reachedAt: reachedAtField } = envelope.payload
					assert(reachedAtField)

					expect(DateTime.isDateTime(reachedAtField)).toBe(true)
					expect(DateTime.isUtc(reachedAtField)).toBe(true)
				}
			}),
		)

		it.effect('decodes envelope without optional fields', () =>
			Effect.gen(function* () {
				// Arrange: Minimal valid envelope
				const json = JSON.stringify({
					_tag: 'MessageEnvelope',
					id: envelopeId,
					payload: {
						_tag: Tag.Timer.Events.DueTimeReached,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs,
					type: Tag.Timer.Events.DueTimeReached,
				})

				// Act: Decode from JSON
				const envelope = yield* MessageEnvelopeSchema.decodeJson(json)

				// Assert: Optional fields are undefined
				expect(envelope.aggregateId).toBeUndefined()
				expect(envelope.causationId).toBeUndefined()
				expect(envelope.correlationId).toBeUndefined()
				expect(envelope.payload._tag).toBe(Tag.Timer.Events.DueTimeReached)
			}),
		)

		it.effect('fails with invalid JSON syntax', () =>
			Effect.gen(function* () {
				// Arrange: Invalid JSON
				const invalidJson = '{ invalid json }'

				// Act: Attempt decode
				const result = yield* Effect.exit(MessageEnvelopeSchema.decodeJson(invalidJson))

				// Assert: Fails with parse error
				expect(Exit.isFailure(result)).toBe(true)
			}),
		)

		it.effect('fails with invalid envelope structure', () =>
			Effect.gen(function* () {
				// Arrange: Missing required fields
				const json = JSON.stringify({
					type: Tag.Timer.Events.DueTimeReached,
					// Missing id, tenantId, payload, timestampMs
				})

				// Act: Attempt decode
				const result = yield* Effect.exit(MessageEnvelopeSchema.decodeJson(json))

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
				const result = yield* Effect.exit(MessageEnvelopeSchema.decodeJson(json))

				// Assert: Fails with validation error (payload not in union)
				expect(Exit.isFailure(result)).toBe(true)
			}),
		)
	})

	describe('encodeJson', () => {
		it.effect('encodes envelope to JSON string', () =>
			Effect.gen(function* () {
				// Arrange: Create envelope with properly typed DueTimeReached (DateTime.Utc)
				const reachedAtField = DateTime.unsafeMake(reachedAt)
				const dueTimeReached = new Messages.Timer.Events.DueTimeReached({
					reachedAt: reachedAtField,
					serviceCallId: ServiceCallId.make(serviceCallId),
					tenantId: TenantId.make(tenantId),
				})

				const envelope = new MessageEnvelopeSchema({
					id: EnvelopeId.make(envelopeId),
					payload: dueTimeReached,
					tenantId: TenantId.make(tenantId),
					timestampMs,
					type: Tag.Timer.Events.DueTimeReached,
				})

				// Act: Encode to JSON (DateTime → ISO8601 string)
				const json: string = yield* MessageEnvelopeSchema.encodeJson(envelope)

				// Assert: Valid JSON string
				expect(json).toBeTypeOf('string')
				const parsed = JSON.parse(json) as {
					type: string
					tenantId: string
					payload: { _tag: string }
				}
				expect(parsed.type).toBe(Tag.Timer.Events.DueTimeReached)
				expect(parsed.tenantId).toBe(tenantId)
				expect(parsed.payload._tag).toBe(Tag.Timer.Events.DueTimeReached)
			}),
		)

		it.effect('round-trips correctly', () =>
			Effect.gen(function* () {
				// Arrange: Create envelope with properly typed DueTimeReached (DateTime.Utc)
				const reachedAtField = DateTime.unsafeMake(reachedAt)
				const dueTimeReached: Messages.Timer.Events.DueTimeReached.Type = new Messages.Timer.Events.DueTimeReached({
					reachedAt: reachedAtField,
					serviceCallId: ServiceCallId.make(serviceCallId),
					tenantId: TenantId.make(tenantId),
				})

				const original = new MessageEnvelopeSchema({
					aggregateId: serviceCallId,
					id: EnvelopeId.make(envelopeId),
					payload: dueTimeReached,
					tenantId: TenantId.make(tenantId),
					timestampMs,
					type: Tag.Timer.Events.DueTimeReached,
				})

				// Act: Encode then decode
				const json: string = yield* MessageEnvelopeSchema.encodeJson(original)
				const decoded: MessageEnvelopeSchema.Type = yield* MessageEnvelopeSchema.decodeJson(json)

				// Assert: Round-trip preserves data
				expect(decoded.type).toBe(original.type)
				expect(decoded.tenantId).toBe(original.tenantId)
				expect(decoded.timestampMs).toBe(original.timestampMs)
				expect(decoded.aggregateId).toBe(original.aggregateId)
				expect(decoded.payload._tag).toBe(original.payload._tag)
			}),
		)
	})
})
