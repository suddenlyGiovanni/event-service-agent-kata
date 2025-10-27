/**
 * Tests for Iso8601DateTime branded type
 *
 * Validates Schema.brand implementation for ISO8601 datetime strings.
 */

import * as Schema from 'effect/Schema'
import { describe, expect, test } from 'vitest'

import { Iso8601DateTime } from './iso8601-datetime.schema.ts'

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
