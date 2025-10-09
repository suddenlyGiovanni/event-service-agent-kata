/**
 * Tests for shared branded types
 *
 * Validates Schema.brand implementation for entity IDs and shared datetime types.
 */

import { describe, expect, test } from 'bun:test'

import * as Schema from 'effect/Schema'

import { CorrelationId, EnvelopeId, Iso8601DateTime, ServiceCallId, TenantId } from './shared.type.ts'

describe('TenantId', () => {
	describe('schema validation', () => {
		test('accepts valid UUID v7 format', () => {
			const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
			const result = Schema.decodeUnknownSync(TenantId)(validUuid7)

			// Result is branded - compare with expected value
			expect(result).toBe(validUuid7 as TenantId.Type)
		})

		test('rejects invalid UUID format', () => {
			const invalidUuid = 'not-a-uuid'

			expect(() => Schema.decodeSync(TenantId)(invalidUuid)).toThrow()
		})

		test('rejects UUID v4 (wrong version)', () => {
			const uuidV4 = '550e8400-e29b-41d4-a716-446655440000'

			expect(() => Schema.decodeUnknownSync(TenantId)(uuidV4)).toThrow()
		})

		test('rejects non-string values', () => {
			expect(() => Schema.decodeUnknownSync(TenantId)(123)).toThrow()
			expect(() => Schema.decodeUnknownSync(TenantId)(null)).toThrow()
			expect(() => Schema.decodeUnknownSync(TenantId)(undefined)).toThrow()
		})
	})

	describe('.make() constructor', () => {
		test('creates branded value from valid UUID v7', () => {
			const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
			const tenantId = TenantId.make(validUuid7)

			expect(tenantId).toBe(validUuid7 as TenantId.Type)
		})

		test('throws on invalid UUID format', () => {
			expect(() => TenantId.make('invalid')).toThrow()
		})
	})

	describe('type safety', () => {
		test('TenantId.Type is distinct from plain string', () => {
			const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
			const tenantId: TenantId.Type = TenantId.make(validUuid7)

			// TypeScript should prevent this assignment
			// @ts-expect-error - TenantId.Type should not be assignable to plain string context
			const _wrongUsage: string = tenantId
		})
	})
})

describe('CorrelationId', () => {
	describe('schema validation', () => {
		test('accepts valid UUID v7 format', () => {
			const validUuid7 = '01932b9e-5678-7abc-9def-0123456789ab'
			const result = Schema.decodeUnknownSync(CorrelationId)(validUuid7)

			expect(result).toBe(validUuid7 as CorrelationId.Type)
		})

		test('rejects invalid UUID format', () => {
			const invalidUuid = 'not-a-uuid'

			expect(() => Schema.decodeUnknownSync(CorrelationId)(invalidUuid)).toThrow()
		})
	})

	describe('.make() constructor', () => {
		test('creates branded value from valid UUID v7', () => {
			const validUuid7 = '01932b9e-5678-7abc-9def-0123456789ab'
			const correlationId = CorrelationId.make(validUuid7)

			expect(correlationId).toBe(validUuid7 as CorrelationId.Type)
		})
	})
})

describe('EnvelopeId', () => {
	describe('schema validation', () => {
		test('accepts valid UUID v7 format', () => {
			const validUuid7 = '01932b9e-9012-7abc-9def-0123456789ab'
			const result = Schema.decodeUnknownSync(EnvelopeId)(validUuid7)

			expect(result).toBe(validUuid7 as EnvelopeId.Type)
		})

		test('rejects invalid UUID format', () => {
			const invalidUuid = 'not-a-uuid'

			expect(() => Schema.decodeUnknownSync(EnvelopeId)(invalidUuid)).toThrow()
		})
	})

	describe('.make() constructor', () => {
		test('creates branded value from valid UUID v7', () => {
			const validUuid7 = '01932b9e-9012-7abc-9def-0123456789ab'
			const envelopeId = EnvelopeId.make(validUuid7)

			expect(envelopeId).toBe(validUuid7 as EnvelopeId.Type)
		})
	})
})

describe('ServiceCallId', () => {
	describe('schema validation', () => {
		test('accepts valid UUID v7 format', () => {
			const validUuid7 = '01932b9e-3456-7abc-9def-0123456789ab'
			const result = Schema.decodeUnknownSync(ServiceCallId)(validUuid7)

			expect(result).toBe(validUuid7 as ServiceCallId.Type)
		})

		test('rejects invalid UUID format', () => {
			const invalidUuid = 'not-a-uuid'

			expect(() => Schema.decodeUnknownSync(ServiceCallId)(invalidUuid)).toThrow()
		})
	})

	describe('.make() constructor', () => {
		test('creates branded value from valid UUID v7', () => {
			const validUuid7 = '01932b9e-3456-7abc-9def-0123456789ab'
			const serviceCallId = ServiceCallId.make(validUuid7)

			expect(serviceCallId).toBe(validUuid7 as ServiceCallId.Type)
		})
	})
})

describe('Iso8601DateTime', () => {
	describe('schema validation', () => {
		test('accepts valid ISO8601 datetime with Z timezone', () => {
			const validDateTime = '2025-10-05T12:00:00Z'
			const result = Schema.decodeUnknownSync(Iso8601DateTime)(validDateTime)

			expect(result).toBe(validDateTime as Iso8601DateTime.Type)
		})

		test('accepts valid ISO8601 datetime with milliseconds', () => {
			const validDateTime = '2025-10-05T12:00:00.123Z'
			const result = Schema.decodeUnknownSync(Iso8601DateTime)(validDateTime)

			expect(result).toBe(validDateTime as Iso8601DateTime.Type)
		})

		test('accepts valid ISO8601 datetime with positive timezone offset', () => {
			const validDateTime = '2025-10-05T12:00:00+05:30'
			const result = Schema.decodeUnknownSync(Iso8601DateTime)(validDateTime)

			expect(result).toBe(validDateTime as Iso8601DateTime.Type)
		})

		test('accepts valid ISO8601 datetime with negative timezone offset', () => {
			const validDateTime = '2025-10-05T12:00:00-08:00'
			const result = Schema.decodeUnknownSync(Iso8601DateTime)(validDateTime)

			expect(result).toBe(validDateTime as Iso8601DateTime.Type)
		})

		test('accepts valid ISO8601 datetime with milliseconds and offset', () => {
			const validDateTime = '2025-10-05T12:00:00.999+02:00'
			const result = Schema.decodeUnknownSync(Iso8601DateTime)(validDateTime)

			expect(result).toBe(validDateTime as Iso8601DateTime.Type)
		})

		test('rejects datetime without timezone', () => {
			const invalidDateTime = '2025-10-05T12:00:00'

			expect(() => Schema.decodeUnknownSync(Iso8601DateTime)(invalidDateTime)).toThrow()
		})

		test('rejects datetime with invalid format', () => {
			const invalidDateTime = '2025/10/05 12:00:00'

			expect(() => Schema.decodeUnknownSync(Iso8601DateTime)(invalidDateTime)).toThrow()
		})

		test('rejects datetime with missing time separator', () => {
			const invalidDateTime = '2025-10-05 12:00:00Z'

			expect(() => Schema.decodeUnknownSync(Iso8601DateTime)(invalidDateTime)).toThrow()
		})

		test('rejects non-string values', () => {
			expect(() => Schema.decodeUnknownSync(Iso8601DateTime)(123)).toThrow()
			expect(() => Schema.decodeUnknownSync(Iso8601DateTime)(null)).toThrow()
			expect(() => Schema.decodeUnknownSync(Iso8601DateTime)(new Date())).toThrow()
		})
	})

	describe('.make() constructor', () => {
		test('creates branded value from valid ISO8601 string', () => {
			const validDateTime = '2025-10-05T12:00:00Z'
			const dateTime = Iso8601DateTime.make(validDateTime)

			expect(dateTime).toBe(validDateTime as Iso8601DateTime.Type)
		})

		test('throws on invalid datetime format', () => {
			expect(() => Iso8601DateTime.make('invalid')).toThrow()
		})
	})
})

describe('Brand accumulation', () => {
	test('TenantId has both UUID7 and TenantId brands', () => {
		const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
		const tenantId = TenantId.make(validUuid7)

		// The value should be branded with both UUID7 and TenantId
		// This is structural - we can't directly test the brand at runtime,
		// but TypeScript enforces it at compile time
		expect(typeof tenantId).toBe('string')
		expect(tenantId).toBe(validUuid7 as TenantId.Type)
	})

	test('Different entity ID types are not interchangeable', () => {
		const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
		const tenantId = TenantId.make(validUuid7)
		const serviceCallId = ServiceCallId.make(validUuid7)

		// Even though they have the same value, TypeScript should prevent mixing them
		// @ts-expect-error - TenantId.Type should not be assignable to ServiceCallId.Type
		const _wrongAssignment: ServiceCallId.Type = tenantId

		// Runtime values are the same (both are strings)
		expect(tenantId as string).toBe(serviceCallId as string)
	})
})

describe('RequestContext', () => {
	test('accepts valid TenantId and CorrelationId types', () => {
		const tenantId: TenantId.Type = TenantId.make('01932b9e-1234-7abc-9def-0123456789ab')
		const correlationId: CorrelationId.Type = CorrelationId.make('01932b9e-5678-7abc-9def-0123456789ab')

		const context = {
			correlationId,
			tenantId,
		}

		expect(context.tenantId).toBe('01932b9e-1234-7abc-9def-0123456789ab' as TenantId.Type)
		expect(context.correlationId).toBe('01932b9e-5678-7abc-9def-0123456789ab' as CorrelationId.Type)
	})

	test('rejects plain strings in place of branded types', () => {
		// TypeScript should prevent this
		const plainString = '01932b9e-1234-7abc-9def-0123456789ab'

		// @ts-expect-error - plain string should not be assignable to TenantId.Type
		const _wrongContext1 = {
			correlationId: CorrelationId.make('01932b9e-5678-7abc-9def-0123456789ab'),
			tenantId: plainString,
		}

		// @ts-expect-error - plain string should not be assignable to CorrelationId.Type
		const _wrongContext2 = {
			correlationId: plainString,
			tenantId: TenantId.make('01932b9e-1234-7abc-9def-0123456789ab'),
		}
	})
})
