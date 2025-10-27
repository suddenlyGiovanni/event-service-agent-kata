/**
 * Tests for ServiceCallId branded type
 *
 * Validates Schema.brand implementation for service call identifiers.
 */

import * as Schema from 'effect/Schema'
import { describe, expect, test } from 'vitest'

import { ServiceCallId } from './service-call-id.schema.ts'

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
