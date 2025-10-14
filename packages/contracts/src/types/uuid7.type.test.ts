/** biome-ignore-all lint/style/useNamingConvention: UUID7 follows Effect's convention for acronyms (UUID, ULID) */

import * as Schema from 'effect/Schema'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { UUID7 } from './uuid7.type.ts'

describe('UUID7 Schema', () => {
	describe('decodeUnknown', () => {
		it('should decode valid UUID v7', () => {
			const validUUID7 = '01234567-89ab-7cde-89ab-0123456789ab'

			const result = Schema.decodeSync(UUID7)(validUUID7)

			expect(result).toBe(validUUID7 as UUID7.Type)
			// Check brand is applied (TypeScript level, runtime is string)
			expect(typeof result).toBe('string')
		})

		it('should decode valid UUID v7 with lowercase hex', () => {
			const validUUID7 = '01234567-89ab-7cde-8fab-0123456789ab'

			const result = Schema.decodeSync(UUID7)(validUUID7)

			expect(result).toBe(validUUID7 as UUID7.Type)
		})

		it('should decode valid UUID v7 with uppercase hex', () => {
			const validUUID7 = '01234567-89AB-7CDE-89AB-0123456789AB'

			const result = Schema.decodeSync(UUID7)(validUUID7)

			expect(result).toBe(validUUID7 as UUID7.Type)
		})

		it('should decode valid UUID v7 with mixed case hex', () => {
			const validUUID7 = '01234567-89aB-7CdE-8FaB-0123456789Ab'

			const result = Schema.decodeSync(UUID7)(validUUID7)

			expect(result).toBe(validUUID7 as UUID7.Type)
		})

		it('should accept variant field [89ab]', () => {
			const uuidWithVariant8 = '01234567-89ab-7cde-8abc-0123456789ab'
			const uuidWithVariant9 = '01234567-89ab-7cde-9abc-0123456789ab'
			const uuidWithVariantA = '01234567-89ab-7cde-aabc-0123456789ab'
			const uuidWithVariantB = '01234567-89ab-7cde-babc-0123456789ab'

			expect(Schema.decodeSync(UUID7)(uuidWithVariant8)).toBe(uuidWithVariant8 as UUID7.Type)
			expect(Schema.decodeSync(UUID7)(uuidWithVariant9)).toBe(uuidWithVariant9 as UUID7.Type)
			expect(Schema.decodeSync(UUID7)(uuidWithVariantA)).toBe(uuidWithVariantA as UUID7.Type)
			expect(Schema.decodeSync(UUID7)(uuidWithVariantB)).toBe(uuidWithVariantB as UUID7.Type)
		})
	})

	describe('decodeUnknown - rejections', () => {
		it('should reject UUID v4 (wrong version)', () => {
			const uuidV4 = '01234567-89ab-4cde-89ab-0123456789ab' // version = 4

			expect(() => Schema.decodeSync(UUID7)(uuidV4)).toThrow()
		})

		it('should reject UUID with wrong version (1)', () => {
			const uuidV1 = '01234567-89ab-1cde-89ab-0123456789ab' // version = 1

			expect(() => Schema.decodeSync(UUID7)(uuidV1)).toThrow()
		})

		it('should reject UUID with invalid variant field', () => {
			const invalidVariant = '01234567-89ab-7cde-0abc-0123456789ab' // variant = 0 (invalid)

			expect(() => Schema.decodeSync(UUID7)(invalidVariant)).toThrow()
		})

		it('should reject malformed UUID (missing hyphens)', () => {
			const noHyphens = '0123456789ab7cde89ab0123456789ab'

			expect(() => Schema.decodeSync(UUID7)(noHyphens)).toThrow()
		})

		it('should reject malformed UUID (wrong format)', () => {
			const wrongFormat = '01234567-89ab-7cde-89ab-0123456789' // too short

			expect(() => Schema.decodeSync(UUID7)(wrongFormat)).toThrow()
		})

		it('should reject non-string input', () => {
			expect(() => Schema.decodeUnknownSync(UUID7)(12345)).toThrow()
			expect(() => Schema.decodeUnknownSync(UUID7)(null)).toThrow()
			expect(() => Schema.decodeUnknownSync(UUID7)(undefined)).toThrow()
			expect(() => Schema.decodeUnknownSync(UUID7)({})).toThrow()
		})

		it('should reject empty string', () => {
			expect(() => Schema.decodeSync(UUID7)('')).toThrow()
		})

		it('should reject UUID with invalid hex characters', () => {
			const invalidHex = '01234567-89ab-7cde-89ab-0123456789gg' // 'gg' not hex

			expect(() => Schema.decodeSync(UUID7)(invalidHex)).toThrow()
		})
	})

	describe('encode', () => {
		it('should encode UUID7 back to string (no-op)', () => {
			const validUUID7 = '01234567-89ab-7cde-89ab-0123456789ab'
			const decoded = Schema.decodeSync(UUID7)(validUUID7)

			const encoded = Schema.encodeSync(UUID7)(decoded)

			expect(encoded).toBe(validUUID7)
		})
	})
})

describe('UUID7 Edge Cases', () => {
	describe('brand accumulation', () => {
		it('should support brand accumulation (type level)', () => {
			// This test is primarily for TypeScript type checking
			// At runtime, brands don't exist (just strings)
			const validUUID7 = '01234567-89ab-7cde-89ab-0123456789ab'
			const decoded = Schema.decodeSync(UUID7)(validUUID7)

			// At runtime, it's just a string (brands are type-level only)
			expect(typeof decoded).toBe('string')
			expect<string>(decoded).toBe(validUUID7)
			expectTypeOf(decoded).toEqualTypeOf<UUID7.Type>()
		})
	})

	describe('schema composition', () => {
		it('should work with Schema.Array', () => {
			const UUID7Array = Schema.Array(UUID7)
			const validUuids = ['01234567-89ab-7cde-89ab-0123456789ab', 'fedcba98-7654-7321-8fed-cba987654321']

			const result = Schema.decodeSync(UUID7Array)(validUuids)

			expect(result).toEqual(validUuids as UUID7.Type[])
		})

		it('should work in Schema.Struct', () => {
			const EntityWithId = Schema.Struct({
				id: UUID7,
				name: Schema.String,
			})

			const validEntity = {
				id: '01234567-89ab-7cde-89ab-0123456789ab',
				name: 'Test Entity',
			}

			const result = Schema.decodeSync(EntityWithId)(validEntity)

			expect(result).toEqual({
				id: validEntity.id as UUID7.Type,
				name: validEntity.name,
			})
		})
	})

	describe('error messages', () => {
		it('should provide clear error message for invalid UUID v7', () => {
			const invalidUuid = '01234567-89ab-4cde-89ab-0123456789ab' // v4

			expect(() => Schema.decodeSync(UUID7)(invalidUuid)).toThrow(
				'Must be a valid UUID version 7 (format: xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx)',
			)
		})
	})
})
