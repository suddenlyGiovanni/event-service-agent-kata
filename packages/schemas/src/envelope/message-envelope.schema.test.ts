import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { DueTimeReached } from '../messages/timer/events.schema.ts'
import { EnvelopeId, ServiceCallId, TenantId } from '../shared/index.ts'
import { MessageEnvelopeSchema } from './message-envelope.schema.ts'

describe('MessageEnvelopeSchema', () => {
	describe('decodeJson', () => {
		it.effect('decodes valid envelope with DueTimeReached payload', () =>
			Effect.gen(function* () {
				// Arrange: Valid JSON envelope with Timer event
				const json = JSON.stringify({
					_tag: 'MessageEnvelope',
					aggregateId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
					id: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2',
					payload: {
						_tag: 'DueTimeReached',
						reachedAt: '2025-10-27T12:00:00.000Z',
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					},
					tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					timestampMs: 1730030400000,
					type: 'DueTimeReached',
				})

				// Act: Decode from JSON
				const envelope = yield* MessageEnvelopeSchema.decodeJson(json)

				// Assert: Envelope structure validated
				expect(envelope.type).toBe('DueTimeReached')
				expect(envelope.tenantId).toBe('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
				expect(envelope.timestampMs).toBe(1730030400000)

				// Assert: Payload is DueTimeReached with correct structure
				expect(envelope.payload._tag).toBe('DueTimeReached')
				if (envelope.payload._tag === 'DueTimeReached') {
					expect(envelope.payload.tenantId).toBe('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
					expect(envelope.payload.serviceCallId).toBe('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')
					// reachedAt is now DateTime.Utc after decoding
					if (envelope.payload.reachedAt) {
						expect(DateTime.formatIso(envelope.payload.reachedAt)).toBe('2025-10-27T12:00:00.000Z')
					}
				}
			}),
		)

		it.effect('decodes envelope without optional fields', () =>
			Effect.gen(function* () {
				// Arrange: Minimal valid envelope
				const json = JSON.stringify({
					_tag: 'MessageEnvelope',
					id: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2',
					payload: {
						_tag: 'DueTimeReached',
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					},
					tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					timestampMs: 1730030400000,
					type: 'DueTimeReached',
				})

				// Act: Decode from JSON
				const envelope = yield* MessageEnvelopeSchema.decodeJson(json)

				// Assert: Optional fields are undefined
				expect(envelope.aggregateId).toBeUndefined()
				expect(envelope.causationId).toBeUndefined()
				expect(envelope.correlationId).toBeUndefined()
				expect(envelope.payload._tag).toBe('DueTimeReached')
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
					type: 'DueTimeReached',
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
					id: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2',
					payload: {
						_tag: 'UnknownEvent',
						data: 'something',
					},
					tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					timestampMs: 1730030400000,
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
				const dueTimeReached = new DueTimeReached({
					reachedAt: DateTime.unsafeMake('2025-10-27T12:00:00.000Z'),
					serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'),
					tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
				})

				const envelope = new MessageEnvelopeSchema({
					id: EnvelopeId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2'),
					payload: dueTimeReached,
					tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
					timestampMs: 1730030400000,
					type: 'DueTimeReached',
				})

				// Act: Encode to JSON (DateTime → ISO8601 string)
				const json = yield* MessageEnvelopeSchema.encodeJson(envelope)

				// Assert: Valid JSON string
				expect(typeof json).toBe('string')
				const parsed = JSON.parse(json) as {
					type: string
					tenantId: string
					payload: { _tag: string }
				}
				expect(parsed.type).toBe('DueTimeReached')
				expect(parsed.tenantId).toBe('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
				expect(parsed.payload._tag).toBe('DueTimeReached')
			}),
		)

		it.effect('round-trips correctly', () =>
			Effect.gen(function* () {
				// Arrange: Create envelope with properly typed DueTimeReached (DateTime.Utc)
				const dueTimeReached = new DueTimeReached({
					reachedAt: DateTime.unsafeMake('2025-10-27T12:00:00.000Z'),
					serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'),
					tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
				})

				const original = new MessageEnvelopeSchema({
					aggregateId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
					id: EnvelopeId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2'),
					payload: dueTimeReached,
					tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
					timestampMs: 1730030400000,
					type: 'DueTimeReached',
				})

				// Act: Encode then decode
				const json = yield* MessageEnvelopeSchema.encodeJson(original)
				const decoded = yield* MessageEnvelopeSchema.decodeJson(json)

				// Assert: Round-trip preserves data
				// biome-ignore lint/suspicious/noExplicitAny: Schema.Class properties exist at runtime but not in type
				expect((decoded as any).type).toBe((original as any).type)
				// biome-ignore lint/suspicious/noExplicitAny: Schema.Class properties exist at runtime but not in type
				expect((decoded as any).tenantId).toBe((original as any).tenantId)
				// biome-ignore lint/suspicious/noExplicitAny: Schema.Class properties exist at runtime but not in type
				expect((decoded as any).timestampMs).toBe((original as any).timestampMs)
				// biome-ignore lint/suspicious/noExplicitAny: Schema.Class properties exist at runtime but not in type
				expect((decoded as any).aggregateId).toBe((original as any).aggregateId)
				// biome-ignore lint/suspicious/noExplicitAny: Schema.Class properties exist at runtime but not in type
				expect((decoded as any).payload._tag).toBe((original as any).payload._tag)
			}),
		)
	})
})
