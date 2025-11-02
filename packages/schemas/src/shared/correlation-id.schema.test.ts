/**
 * Tests for CorrelationId branded type
 *
 * Validates Schema.brand implementation for correlation identifiers.
 */

import * as Schema from 'effect/Schema'
import { describe, expect, test } from 'vitest'

import { CorrelationId } from './correlation-id.schema.ts'

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
