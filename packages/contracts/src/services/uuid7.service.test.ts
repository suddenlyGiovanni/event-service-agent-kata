/** biome-ignore-all lint/style/useNamingConvention: UUID7 follows Effect's convention for acronyms (UUID, ULID) */
/** biome-ignore-all lint/style/noNonNullAssertion: UUID7Regex validates the match before accessing named capture groups */

import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'vitest'

import { UUID7Regex, type UUID7 as UUID7Schema } from '#/types/uuid7.type.ts'

import { UUID7 } from './uuid7.service.ts'

describe('UUID7', () => {
	describe('UUID7.Default', () => {
		it('should generate valid UUID v7', async () =>
			await UUID7.pipe(
				Effect.andThen(uuid => uuid.randomUUIDv7()),
				Effect.andThen(_uuidResult => expect(_uuidResult).toMatch(UUID7Regex)),
				Effect.provide(UUID7.Default),
				Effect.runPromise,
			))

		it('should generate unique UUIDs on multiple calls', async () => {
			const program = Effect.gen(function* () {
				const uuid7 = yield* UUID7
				const uuid1 = yield* uuid7.randomUUIDv7()
				const uuid2 = yield* uuid7.randomUUIDv7()
				const uuid3 = yield* uuid7.randomUUIDv7()
				return [uuid1, uuid2, uuid3] as const
			}).pipe(Effect.provide(UUID7.Default))

			const [uuid1, uuid2, uuid3] = await Effect.runPromise(program)

			// All should be different
			expect(uuid1).not.toBe(uuid2)
			expect(uuid2).not.toBe(uuid3)
			expect(uuid1).not.toBe(uuid3)

			// All should be valid UUID v7
			expect(uuid1).toMatch(UUID7Regex)
			expect(uuid2).toMatch(UUID7Regex)
			expect(uuid3).toMatch(UUID7Regex)
		})

		it('should generate UUIDs with increasing timestamps (time-ordered)', async () => {
			const program = Effect.gen(function* () {
				const { randomUUIDv7 } = yield* UUID7
				const uuid1 = yield* randomUUIDv7()
				// Small delay to ensure different timestamps
				yield* Effect.sleep('10 millis')
				const uuid2 = yield* randomUUIDv7()
				return [uuid1, uuid2] as const
			}).pipe(Effect.provide(UUID7.Default))

			const [uuid1, uuid2] = await Effect.runPromise(program)

			// Extract timestamp prefixes (first 8 hex digits)
			const timestamp1 = Number.parseInt(uuid1.match(UUID7Regex)!.groups!['timestampHigh']!, 16)
			const timestamp2 = Number.parseInt(uuid2.match(UUID7Regex)!.groups!['timestampHigh']!, 16)

			// UUID v7 is time-ordered, so timestamp2 should be >= timestamp1
			expect(timestamp2).toBeGreaterThanOrEqual(timestamp1)
		})

		it('should return branded UUID7 type', async () => {
			const result = await UUID7.pipe(
				Effect.andThen(uuid7 => uuid7.randomUUIDv7()),
				Effect.provide(UUID7.Default),
				Effect.runPromise,
			)

			// At runtime, it's just a string (brands are type-level only)
			expect(typeof result === 'string').toBe(true)
		})

		it('should support timestamp override for deterministic generation', async () => {
			const program = Effect.gen(function* () {
				const { randomUUIDv7 } = yield* UUID7
				// Use a specific timestamp (2024-01-01T00:00:00.000Z)
				const fixedTime = DateTime.unsafeMake({
					day: 1,
					hour: 0,
					millisecond: 0,
					minute: 0,
					month: 1,
					second: 0,
					year: 2024,
				})
				const uuid1 = yield* randomUUIDv7(fixedTime)
				const uuid2 = yield* randomUUIDv7(fixedTime)
				return [uuid1, uuid2] as const
			}).pipe(Effect.provide(UUID7.Default))

			const [uuid1, uuid2] = await Effect.runPromise(program)

			// Both UUIDs should have the same timestamp prefix (first 12 hex chars: 8 + 4)
			const timestampPart1 = uuid1.slice(0, 13) // "xxxxxxxx-xxxx"
			const timestampPart2 = uuid2.slice(0, 13)
			expect(timestampPart1).toBe(timestampPart2)

			// But the random parts should differ (monotonic counter + random)
			expect(uuid1).not.toBe(uuid2)

			// Both should be valid UUID v7
			expect(uuid1).toMatch(UUID7Regex)
			expect(uuid2).toMatch(UUID7Regex)
		})

		it('should generate different UUIDs with different timestamp overrides', async () => {
			const program = Effect.gen(function* () {
				const { randomUUIDv7 } = yield* UUID7
				// Two different timestamps
				const time1 = DateTime.unsafeMake({
					day: 1,
					hour: 0,
					millisecond: 0,
					minute: 0,
					month: 1,
					second: 0,
					year: 2024,
				})
				const time2 = DateTime.unsafeMake({
					day: 2,
					hour: 0,
					millisecond: 0,
					minute: 0,
					month: 1,
					second: 0,
					year: 2024,
				})
				const uuid1 = yield* randomUUIDv7(time1)
				const uuid2 = yield* randomUUIDv7(time2)
				return [uuid1, uuid2] as const
			}).pipe(Effect.provide(UUID7.Default))

			const [uuid1, uuid2] = await Effect.runPromise(program)

			// Extract timestamp prefixes - they should be different
			const timestamp1 = Number.parseInt(uuid1.match(UUID7Regex)!.groups!['timestampHigh']!, 16)
			const timestamp2 = Number.parseInt(uuid2.match(UUID7Regex)!.groups!['timestampHigh']!, 16)

			expect(timestamp2).toBeGreaterThan(timestamp1)

			// Both should be valid UUID v7
			expect(uuid1).toMatch(UUID7Regex)
			expect(uuid2).toMatch(UUID7Regex)
		})
	})

	describe('UUID7.Test', () => {
		it('should return fixed UUID', async () => {
			const fixedUuid = '01234567-89ab-7cde-89ab-0123456789ab'

			const result = await UUID7.pipe(
				Effect.andThen(uuid7 => uuid7.randomUUIDv7()),
				Effect.provide(UUID7.Test(fixedUuid)), // Inject test adapter with fixed UUID
				Effect.runPromise,
			)

			expect(result).toBe(fixedUuid as UUID7Schema.Type)
		})

		it('should return same UUID on multiple calls', async () => {
			const fixedUuid = 'deadbeef-cafe-7bab-89ab-0123456789ab'

			const [uuid1, uuid2, uuid3] = await Effect.all([
				UUID7.randomUUIDv7(),
				UUID7.randomUUIDv7(),
				UUID7.randomUUIDv7(),
			]).pipe(Effect.provide(UUID7.Test(fixedUuid)), Effect.runPromise)

			expect(uuid1).toBe(fixedUuid as UUID7Schema.Type)
			expect(uuid2).toBe(fixedUuid as UUID7Schema.Type)
			expect(uuid3).toBe(fixedUuid as UUID7Schema.Type)
		})

		it('should fail if fixed UUID is invalid', async () => {
			const invalidUuid = '01234567-89ab-4cde-89ab-0123456789ab' // v4, not v7

			const program = UUID7.pipe(
				Effect.andThen(uuid7 => uuid7.randomUUIDv7()),
				Effect.provide(UUID7.Test(invalidUuid)), // Inject test adapter with fixed UUID
			)

			await expect(Effect.runPromise(program)).rejects.toThrow(
				'Must be a valid UUID version 7 (format: xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx)',
			)
		})
	})

	describe('UUID7.Sequence', () => {
		it('should generate sequential UUIDs with incrementing counter', async () => {
			const [uuid1, uuid2, uuid3] = await Effect.all([
				UUID7.randomUUIDv7(),
				UUID7.randomUUIDv7(),
				UUID7.randomUUIDv7(),
			]).pipe(Effect.provide(UUID7.Sequence('12345678')), Effect.runPromise)

			expect(uuid1).toBe('12345678-0000-7000-8000-000000000000' as UUID7Schema.Type)
			expect(uuid2).toBe('12345678-0000-7000-8000-000000000001' as UUID7Schema.Type)
			expect(uuid3).toBe('12345678-0000-7000-8000-000000000002' as UUID7Schema.Type)
		})

		it('should use default prefix "00000000" when not provided', async () => {
			const [uuid1, uuid2] = await Effect.all([UUID7.randomUUIDv7(), UUID7.randomUUIDv7(), UUID7.randomUUIDv7()]).pipe(
				Effect.provide(UUID7.Sequence()),
				Effect.runPromise,
			)

			expect(uuid1).toBe('00000000-0000-7000-8000-000000000000' as UUID7Schema.Type)
			expect(uuid2).toBe('00000000-0000-7000-8000-000000000001' as UUID7Schema.Type)
		})

		it('should generate valid UUID v7 format with sequence', async () => {
			const result = await UUID7.pipe(
				Effect.andThen(uuid7 => uuid7.randomUUIDv7()),
				Effect.provide(UUID7.Sequence('aaaabbbb')), // Inject test adapter with fixed UUID
				Effect.runPromise,
			)

			expect(result).toMatch(UUID7Regex)
			expect(result).toBe('aaaabbbb-0000-7000-8000-000000000000' as UUID7Schema.Type)
		})

		it('should generate multiple sequential UUIDs in a single program', async () => {
			const program = Effect.gen(function* () {
				const uuids: UUID7Schema.Type[] = []
				for (let i = 0; i < 5; i++) {
					const uuid = yield* UUID7.randomUUIDv7()
					uuids.push(uuid)
				}
				return uuids
			}).pipe(Effect.provide(UUID7.Sequence('abcdef12')))

			const result = await Effect.runPromise(program)

			expect(result[0]).toBe('abcdef12-0000-7000-8000-000000000000' as UUID7Schema.Type)
			expect(result[1]).toBe('abcdef12-0000-7000-8000-000000000001' as UUID7Schema.Type)
			expect(result[2]).toBe('abcdef12-0000-7000-8000-000000000002' as UUID7Schema.Type)
			expect(result[3]).toBe('abcdef12-0000-7000-8000-000000000003' as UUID7Schema.Type)
			expect(result[4]).toBe('abcdef12-0000-7000-8000-000000000004' as UUID7Schema.Type)
		})
	})
})
