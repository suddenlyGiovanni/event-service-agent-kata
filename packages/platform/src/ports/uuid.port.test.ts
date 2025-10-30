/** biome-ignore-all lint/style/useNamingConvention: UUID follows Effect's convention for acronyms */

import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'vitest'

import { UUIDPort } from './uuid.port.ts'

describe('UUIDPort', () => {
	// Helper regex for UUID v7 format validation
	const UUID7Regex =
		/^(?<timestampHigh>[0-9a-f]{8})-(?<timestampLow>[0-9a-f]{4})-7(?<timestampAndVersion>[0-9a-f]{3})-[89ab](?<variant>[0-9a-f]{3})-(?<random>[0-9a-f]{12})$/i

	describe('UUIDPort.Default', () => {
		it('should generate valid UUID v7', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id = uuid.randomUUIDv7()
				return id
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Default)))

			expect(result).toMatch(UUID7Regex)
		})

		it('should generate unique UUIDs on multiple calls', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7()
				const id2 = uuid.randomUUIDv7()
				const id3 = uuid.randomUUIDv7()
				return [id1, id2, id3]
			})

			const [id1, id2, id3] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Default)),
			)

			// All should be unique
			expect(id1).not.toBe(id2)
			expect(id2).not.toBe(id3)
			expect(id1).not.toBe(id3)

			// All should be valid UUID v7
			expect(id1).toMatch(UUID7Regex)
			expect(id2).toMatch(UUID7Regex)
			expect(id3).toMatch(UUID7Regex)
		})

		it('should generate time-ordered UUIDs', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7()
				// Small delay to ensure different timestamps
				yield* Effect.sleep('10 millis')
				const id2 = uuid.randomUUIDv7()
				return [id1, id2]
			})

			const [id1, id2] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Default)),
			)

			// Extract timestamp prefixes (first 8 hex digits)
			const match1 = id1.match(UUID7Regex)
			const match2 = id2.match(UUID7Regex)

			expect(match1).toBeTruthy()
			expect(match2).toBeTruthy()

			const timestamp1 = Number.parseInt(match1!.groups!['timestampHigh']!, 16)
			const timestamp2 = Number.parseInt(match2!.groups!['timestampHigh']!, 16)

			// UUID v7 is time-ordered, so timestamp2 should be >= timestamp1
			expect(timestamp2).toBeGreaterThanOrEqual(timestamp1)
		})

		it('should accept timestamp parameter (number)', async () => {
			const fixedTimestamp = Date.UTC(2024, 0, 1, 0, 0, 0, 0) // 2024-01-01T00:00:00.000Z

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7(fixedTimestamp)
				const id2 = uuid.randomUUIDv7(fixedTimestamp)
				return [id1, id2]
			})

			const [id1, id2] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Default)),
			)

			// Both should have same timestamp prefix
			const timestampPart1 = id1.slice(0, 13) // "xxxxxxxx-xxxx"
			const timestampPart2 = id2.slice(0, 13)
			expect(timestampPart1).toBe(timestampPart2)

			// But should be different (due to monotonic counter + random component)
			expect(id1).not.toBe(id2)

			// Both should be valid UUID v7
			expect(id1).toMatch(UUID7Regex)
			expect(id2).toMatch(UUID7Regex)
		})

		it('should accept timestamp parameter (Date object)', async () => {
			const fixedDate = new Date('2024-01-01T00:00:00.000Z')

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id = uuid.randomUUIDv7(fixedDate)
				return id
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Default)))

			expect(result).toMatch(UUID7Regex)
		})

		it('should use current timestamp when no parameter provided', async () => {
			const beforeTimestamp = Date.now()

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Default)))

			const afterTimestamp = Date.now()

			// Extract timestamp from UUID
			const match = result.match(UUID7Regex)
			expect(match).toBeTruthy()

			// UUID v7 timestamp is in the first 48 bits (12 hex chars)
			const uuidTimestamp = Number.parseInt(match!.groups!['timestampHigh']!, 16)

			// Convert to milliseconds (UUID timestamp is in milliseconds)
			// Just check it's in reasonable range
			const beforeHex = Math.floor(beforeTimestamp / 1000)
			const afterHex = Math.ceil(afterTimestamp / 1000)
			const uuidHex = Math.floor(uuidTimestamp / 1000)

			expect(uuidHex).toBeGreaterThanOrEqual(beforeHex - 1)
			expect(uuidHex).toBeLessThanOrEqual(afterHex + 1)
		})
	})

	describe('UUIDPort.Test', () => {
		const fixedUuid = '01234567-89ab-7cde-89ab-0123456789ab'

		it('should return fixed UUID', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Test(fixedUuid))))

			expect(result).toBe(fixedUuid)
		})

		it('should return same UUID on multiple calls', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7()
				const id2 = uuid.randomUUIDv7()
				const id3 = uuid.randomUUIDv7()
				return [id1, id2, id3]
			})

			const [id1, id2, id3] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Test(fixedUuid))),
			)

			expect(id1).toBe(fixedUuid)
			expect(id2).toBe(fixedUuid)
			expect(id3).toBe(fixedUuid)
		})

		it('should ignore timestamp parameter', async () => {
			const timestamp = Date.now()

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7(timestamp)
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Test(fixedUuid))))

			expect(result).toBe(fixedUuid)
		})

		it('should work with any valid UUID format', async () => {
			const customUuid = 'aaaabbbb-cccc-7ddd-8eee-ffffffffffff'

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Test(customUuid))))

			expect(result).toBe(customUuid)
		})

		it('should allow composition with other services', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				// Simulate multiple UUID generations in a workflow
				const ids = []
				for (let i = 0; i < 3; i++) {
					ids.push(uuid.randomUUIDv7())
				}
				return ids
			})

			const result = await Effect.runPromise(program.pipe(Effect.provideService(UUIDPort, UUIDPort.Test(fixedUuid))))

			expect(result).toEqual([fixedUuid, fixedUuid, fixedUuid])
		})
	})

	describe('UUIDPort.Sequence', () => {
		it('should generate sequential UUIDs with default prefix', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7()
				const id2 = uuid.randomUUIDv7()
				const id3 = uuid.randomUUIDv7()
				return [id1, id2, id3]
			})

			const [id1, id2, id3] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence())),
			)

			expect(id1).toBe('00000000-0000-7000-8000-000000000000')
			expect(id2).toBe('00000000-0000-7000-8000-000000000001')
			expect(id3).toBe('00000000-0000-7000-8000-000000000002')
		})

		it('should generate sequential UUIDs with custom prefix', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7()
				const id2 = uuid.randomUUIDv7()
				const id3 = uuid.randomUUIDv7()
				return [id1, id2, id3]
			})

			const [id1, id2, id3] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('12345678'))),
			)

			expect(id1).toBe('12345678-0000-7000-8000-000000000000')
			expect(id2).toBe('12345678-0000-7000-8000-000000000001')
			expect(id3).toBe('12345678-0000-7000-8000-000000000002')
		})

		it('should generate valid UUID v7 format', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('aaaabbbb'))),
			)

			expect(result).toMatch(UUID7Regex)
		})

		it('should handle large sequence numbers', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const ids = []
				// Generate 100 UUIDs
				for (let i = 0; i < 100; i++) {
					ids.push(uuid.randomUUIDv7())
				}
				return ids
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('testtest'))),
			)

			expect(result).toHaveLength(100)
			// Check first and last
			expect(result[0]).toBe('testtest-0000-7000-8000-000000000000')
			expect(result[99]).toBe('testtest-0000-7000-8000-000000000063') // 99 in hex is 63
		})

		it('should ignore timestamp parameter', async () => {
			const timestamp = Date.now()

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7(timestamp)
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('abcdef12'))),
			)

			expect(result).toBe('abcdef12-0000-7000-8000-000000000000')
		})

		it('should maintain independent counter per service instance', async () => {
			// This test verifies that each Sequence() call creates a new counter
			const program1 = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return [uuid.randomUUIDv7(), uuid.randomUUIDv7()]
			}).pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('prefix01')))

			const program2 = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return [uuid.randomUUIDv7(), uuid.randomUUIDv7()]
			}).pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('prefix02')))

			const [result1, result2] = await Promise.all([Effect.runPromise(program1), Effect.runPromise(program2)])

			// Each program should have its own independent counter
			expect(result1[0]).toBe('prefix01-0000-7000-8000-000000000000')
			expect(result1[1]).toBe('prefix01-0000-7000-8000-000000000001')
			expect(result2[0]).toBe('prefix02-0000-7000-8000-000000000000')
			expect(result2[1]).toBe('prefix02-0000-7000-8000-000000000001')
		})

		it('should pad counter with leading zeros', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const ids = []
				for (let i = 0; i < 5; i++) {
					ids.push(uuid.randomUUIDv7())
				}
				return ids
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('pad00000'))),
			)

			// Verify all counters are padded to 12 hex digits
			expect(result[0]).toBe('pad00000-0000-7000-8000-000000000000')
			expect(result[1]).toBe('pad00000-0000-7000-8000-000000000001')
			expect(result[4]).toBe('pad00000-0000-7000-8000-000000000004')
		})
	})

	describe('Type Safety', () => {
		it('should allow string literal prefix types', async () => {
			// This test verifies TypeScript accepts string literal types
			const customPrefix = 'custom12' as const

			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence(customPrefix))),
			)

			expect(result).toBe('custom12-0000-7000-8000-000000000000')
		})

		it('should work with Effect context composition', async () => {
			// Verify UUIDPort integrates properly with Effect's context system
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				const id1 = uuid.randomUUIDv7()

				// Simulate nested Effect with same context
				const nested = yield* Effect.gen(function* () {
					const uuid2 = yield* UUIDPort
					return uuid2.randomUUIDv7()
				})

				return [id1, nested]
			})

			const [id1, id2] = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('nested00'))),
			)

			expect(id1).toBe('nested00-0000-7000-8000-000000000000')
			expect(id2).toBe('nested00-0000-7000-8000-000000000001')
		})
	})

	describe('Edge Cases', () => {
		it('should handle hex prefix with mixed case', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('AbCdEf12'))),
			)

			expect(result).toBe('AbCdEf12-0000-7000-8000-000000000000')
		})

		it('should handle prefix with all zeros', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('00000000'))),
			)

			expect(result).toBe('00000000-0000-7000-8000-000000000000')
		})

		it('should handle prefix with all Fs', async () => {
			const program = Effect.gen(function* () {
				const uuid = yield* UUIDPort
				return uuid.randomUUIDv7()
			})

			const result = await Effect.runPromise(
				program.pipe(Effect.provideService(UUIDPort, UUIDPort.Sequence('ffffffff'))),
			)

			expect(result).toBe('ffffffff-0000-7000-8000-000000000000')
		})
	})
})