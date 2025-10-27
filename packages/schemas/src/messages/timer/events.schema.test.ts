import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { DueTimeReached } from './events.schema.ts'

describe('Timer Domain Events', () => {
	describe('DueTimeReached', () => {
		describe('Schema Validation', () => {
			it.effect('decodes valid event with all fields', () =>
				Effect.gen(function* () {
					// Arrange: Valid wire format DTO
					const dto = {
						_tag: 'DueTimeReached' as const,
						reachedAt: '2025-10-27T12:00:00.000Z',
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					}

					// Act: Decode from wire format
					const event = yield* DueTimeReached.decode(dto)

					// Assert: All fields validated and branded
					expect(event._tag).toBe('DueTimeReached')
					expect(event.tenantId).toBe(dto.tenantId)
					expect(event.serviceCallId).toBe(dto.serviceCallId)
					expect(event.reachedAt).toBe(dto.reachedAt)
				}),
			)

			it.effect('decodes valid event without optional reachedAt', () =>
				Effect.gen(function* () {
					// Arrange: Valid wire format DTO (no reachedAt - fast-path case)
					const dto = {
						_tag: 'DueTimeReached' as const,
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					}

					// Act: Decode from wire format
					const event = yield* DueTimeReached.decode(dto)

					// Assert: Optional field is undefined
					expect(event._tag).toBe('DueTimeReached')
					expect(event.tenantId).toBe(dto.tenantId)
					expect(event.serviceCallId).toBe(dto.serviceCallId)
					expect(event.reachedAt).toBeUndefined()
				}),
			)

			it('constructs event directly with validated types', () => {
				// Arrange: Validated domain types
				const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
				const serviceCallId = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')
				const reachedAt = Iso8601DateTime.make('2025-10-27T12:00:00.000Z')

				// Act: Direct construction (no validation needed - types already validated)
				const event = new DueTimeReached({
					reachedAt,
					serviceCallId,
					tenantId,
				})

				// Assert: Instance created with correct fields
				expect(event._tag).toBe('DueTimeReached')
				expect(event.tenantId).toBe(tenantId)
				expect(event.serviceCallId).toBe(serviceCallId)
				expect(event.reachedAt).toBe(reachedAt)
			})
		})

		describe('Validation Errors', () => {
			it.effect('fails with invalid tenantId format', () =>
				Effect.gen(function* () {
					// Arrange: Invalid UUID format for tenantId
					const dto = {
						_tag: 'DueTimeReached' as const,
						reachedAt: '2025-10-27T12:00:00.000Z',
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: 'not-a-uuid',
					}

					// Act: Attempt decode
					const result = yield* Effect.exit(DueTimeReached.decode(dto))

					// Assert: Fails with validation error
					expect(Exit.isFailure(result)).toBe(true)
				}),
			)

			it.effect('fails with invalid serviceCallId format', () =>
				Effect.gen(function* () {
					// Arrange: Invalid UUID format for serviceCallId
					const dto = {
						_tag: 'DueTimeReached' as const,
						reachedAt: '2025-10-27T12:00:00.000Z',
						serviceCallId: 'invalid-uuid',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					}

					// Act: Attempt decode
					const result = yield* Effect.exit(DueTimeReached.decode(dto))

					// Assert: Fails with validation error
					expect(Exit.isFailure(result)).toBe(true)
				}),
			)

			it.effect('fails with invalid reachedAt format', () =>
				Effect.gen(function* () {
					// Arrange: Invalid ISO8601 format
					const dto = {
						_tag: 'DueTimeReached' as const,
						reachedAt: 'not-a-date',
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
					}

					// Act: Attempt decode
					const result = yield* Effect.exit(DueTimeReached.decode(dto))

					// Assert: Fails with validation error
					expect(Exit.isFailure(result)).toBe(true)
				}),
			)

			it.effect('fails with missing required fields', () =>
				Effect.gen(function* () {
					// Arrange: Missing serviceCallId (note: _tag must be correct, just missing field)
					const dto = {
						_tag: 'DueTimeReached' as const,
						reachedAt: '2025-10-27T12:00:00.000Z',
						tenantId: '018f6b8a-5c5d-7b32-8c6d8e6f9a0',
						// serviceCallId intentionally omitted
						// biome-ignore lint/suspicious/noExplicitAny: Test requires invalid DTO shape
					} as any

					// Act: Attempt decode
					const result = yield* Effect.exit(DueTimeReached.decode(dto))

					// Assert: Fails with validation error
					expect(Exit.isFailure(result)).toBe(true)
				}),
			)

			it.effect('fails with wrong type discriminator', () =>
				Effect.gen(function* () {
					// Arrange: Wrong _tag value
					const dto = {
						_tag: 'WrongType' as const,
						reachedAt: '2025-10-27T12:00:00.000Z',
						serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
						tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
						// biome-ignore lint/suspicious/noExplicitAny: Test requires invalid DTO shape
					} as any

					// Act: Attempt decode
					const result = yield* Effect.exit(DueTimeReached.decode(dto))

					// Assert: Fails with validation error
					expect(Exit.isFailure(result)).toBe(true)
				}),
			)
		})

		describe('Encode/Decode Round-Trip', () => {
			it.effect('round-trips correctly with all fields', () =>
				Effect.gen(function* () {
					// Arrange: Create domain event
					const original = new DueTimeReached({
						reachedAt: Iso8601DateTime.make('2025-10-27T12:00:00.000Z'),
						serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'),
						tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
					})

					// Act: Encode to wire format, then decode back
					const dto = yield* DueTimeReached.encode(original)
					const decoded = yield* DueTimeReached.decode(dto)

					// Assert: Round-trip preserves all data
					expect(decoded._tag).toBe(original._tag)
					expect(decoded.tenantId).toBe(original.tenantId)
					expect(decoded.serviceCallId).toBe(original.serviceCallId)
					expect(decoded.reachedAt).toBe(original.reachedAt)
				}),
			)

			it.effect('round-trips correctly without optional field', () =>
				Effect.gen(function* () {
					// Arrange: Create domain event without optional field
					const original = new DueTimeReached({
						serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'),
						tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
					})

					// Act: Encode to wire format, then decode back
					const dto = yield* DueTimeReached.encode(original)
					const decoded = yield* DueTimeReached.decode(dto)

					// Assert: Round-trip preserves all data
					expect(decoded._tag).toBe(original._tag)
					expect(decoded.tenantId).toBe(original.tenantId)
					expect(decoded.serviceCallId).toBe(original.serviceCallId)
					expect(decoded.reachedAt).toBeUndefined()
				}),
			)
		})

		describe('DTO Type Safety', () => {
			it.effect('encodes to unbranded DTO type', () =>
				Effect.gen(function* () {
					// Arrange: Domain event with branded types
					const event = new DueTimeReached({
						reachedAt: Iso8601DateTime.make('2025-10-27T12:00:00.000Z'),
						serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'),
						tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
					})

					// Act: Encode to wire format
					const dto = yield* DueTimeReached.encode(event)

					// Assert: DTO has unbranded string types (safe for JSON)
					// Type-level assertion ensures DTO type is correct
					const dtoTypeCheck: DueTimeReached.Dto = dto
					void dtoTypeCheck // Type assertion only, value unused
					expect(typeof dto.tenantId).toBe('string')
					expect(typeof dto.serviceCallId).toBe('string')
					expect(typeof dto.reachedAt).toBe('string')
					expect(dto._tag).toBe('DueTimeReached')

					// DTO should be JSON-serializable
					const json = JSON.stringify(dto)
					expect(json).toBeDefined()
				}),
			)
		})
	})
})
