/**
 * Tests for TenantId branded type
 *
 * Validates Schema.brand implementation for tenant identifiers.
 */

import * as Schema from 'effect/Schema'
import { describe, expect, test } from 'vitest'

import { TenantId } from './tenant-id.schema.ts'

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
