/**
 * Tests for EnvelopeId branded type
 *
 * Validates Schema.brand implementation for envelope identifiers.
 */

import { describe, expect, test } from '@effect/vitest'
import * as Schema from 'effect/Schema'

import { EnvelopeId } from './envelope-id.schema.ts'

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
