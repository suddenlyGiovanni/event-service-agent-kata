/** biome-ignore-all lint/style/useNamingConvention: UUID7 follows Effect's convention for acronyms (UUID, ULID) */
/** biome-ignore-all lint/style/noNonNullAssertion: UUID7Regex validates the match before accessing named capture groups */

import { describe, expect, it } from '@effect/vitest'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import type * as ParseResult from 'effect/ParseResult'

import { UUID7Regex, type UUID7 as UUID7Schema } from '../types/uuid7.type.ts'
import { UUID7 } from './uuid7.service.ts'

describe('UUID7', () => {
	describe('UUID7.Default', () => {
		it.effect('should generate valid UUID v7', () =>
			Effect.gen(function* () {
				expect(yield* UUID7.randomUUIDv7()).toMatch(UUID7Regex)
			}).pipe(Effect.provide(UUID7.Default)),
		)

		it.effect('should generate unique UUIDs on multiple calls', () =>
			Effect.gen(function* () {
				const uuid7 = yield* UUID7
				const uuid1 = yield* uuid7.randomUUIDv7()
				const uuid2 = yield* uuid7.randomUUIDv7()
				const uuid3 = yield* uuid7.randomUUIDv7()

				// All should be different
				expect(uuid1).not.toBe(uuid2)
				expect(uuid2).not.toBe(uuid3)
				expect(uuid1).not.toBe(uuid3)

				// All should be valid UUID v7
				expect(uuid1).toMatch(UUID7Regex)
				expect(uuid2).toMatch(UUID7Regex)
				expect(uuid3).toMatch(UUID7Regex)
			}).pipe(Effect.provide(UUID7.Default)),
		)

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

		it.effect('should return branded UUID7 type', () =>
			Effect.gen(function* () {
				const uuid7 = yield* UUID7

				// At runtime, it's just a string (brands are type-level only)
				expect(typeof (yield* uuid7.randomUUIDv7()) === 'string').toBe(true)
			}).pipe(Effect.provide(UUID7.Default)),
		)

		it.effect('should support timestamp override for deterministic generation', () =>
			Effect.gen(function* () {
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

				// Both UUIDs should have the same timestamp prefix (first 12 hex chars: 8 + 4)
				const timestampPart1 = uuid1.slice(0, 13) // "xxxxxxxx-xxxx"
				const timestampPart2 = uuid2.slice(0, 13)
				expect(timestampPart1).toBe(timestampPart2)

				// But the random parts should differ (monotonic counter + random)
				expect(uuid1).not.toBe(uuid2)

				// Both should be valid UUID v7
				expect(uuid1).toMatch(UUID7Regex)
				expect(uuid2).toMatch(UUID7Regex)
			}).pipe(Effect.provide(UUID7.Default)),
		)

		it.effect('should generate different UUIDs with different timestamp overrides', () =>
			Effect.gen(function* () {
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

				// Extract timestamp prefixes - they should be different
				const timestamp1 = Number.parseInt(uuid1.match(UUID7Regex)!.groups!['timestampHigh']!, 16)
				const timestamp2 = Number.parseInt(uuid2.match(UUID7Regex)!.groups!['timestampHigh']!, 16)

				expect(timestamp2).toBeGreaterThan(timestamp1)

				// Both should be valid UUID v7
				expect(uuid1).toMatch(UUID7Regex)
				expect(uuid2).toMatch(UUID7Regex)
			}).pipe(Effect.provide(UUID7.Default)),
		)
	})

	describe('UUID7.Test', () => {
		const fixedUuid = '01234567-89ab-7cde-89ab-0123456789ab'

		it.effect(
			'should return fixed UUID',
			() =>
				Effect.gen(function* () {
					const uuid7 = yield* UUID7

					expect(yield* uuid7.randomUUIDv7()).toBe(fixedUuid as UUID7Schema.Type)
				}).pipe(Effect.provide(UUID7.Test(fixedUuid))), // Inject test adapter with fixed UUID)
		)

		it.effect('should return same UUID on multiple calls', () =>
			Effect.gen(function* () {
				const uuid7 = yield* UUID7

				const [uuid1, uuid2, uuid3] = yield* Effect.all([
					uuid7.randomUUIDv7(),
					uuid7.randomUUIDv7(),
					uuid7.randomUUIDv7(),
				])

				expect(uuid1).toBe(fixedUuid as UUID7Schema.Type)
				expect(uuid2).toBe(fixedUuid as UUID7Schema.Type)
				expect(uuid3).toBe(fixedUuid as UUID7Schema.Type)
			}).pipe(Effect.provide(UUID7.Test(fixedUuid))),
		)

		it.effect('should fail if fixed UUID is invalid', () => {
			const invalidUuid = '01234567-89ab-4cde-89ab-0123456789ab' // v4, not v7

			return Effect.gen(function* () {
				const uuid7 = yield* UUID7
				const result = yield* Effect.exit(uuid7.randomUUIDv7())

				expect(Exit.isFailure(result)).toBe(true)
				if (Exit.isFailure(result)) {
					const error = Cause.failureOption(result.cause)
					expect(Option.isSome(error)).toBe(true)
					if (Option.isSome(error)) {
						expect((error.value as ParseResult.ParseError).message).toBe(
							'Must be a valid UUID version 7 (format: xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx)',
						)
					}
				}
			}).pipe(Effect.provide(UUID7.Test(invalidUuid)))
		})
	})

	describe('UUID7.Sequence', () => {
		it.effect('should generate sequential UUIDs with incrementing counter', () =>
			Effect.gen(function* () {
				const [uuid1, uuid2, uuid3] = yield* Effect.all([
					UUID7.randomUUIDv7(),
					UUID7.randomUUIDv7(),
					UUID7.randomUUIDv7(),
				])

				expect(uuid1).toBe('12345678-0000-7000-8000-000000000000' as UUID7Schema.Type)
				expect(uuid2).toBe('12345678-0000-7000-8000-000000000001' as UUID7Schema.Type)
				expect(uuid3).toBe('12345678-0000-7000-8000-000000000002' as UUID7Schema.Type)
			}).pipe(Effect.provide(UUID7.Sequence('12345678'))),
		)

		it.effect('should use default prefix "00000000" when not provided', () =>
			Effect.gen(function* () {
				const [uuid1, uuid2] = yield* Effect.all([UUID7.randomUUIDv7(), UUID7.randomUUIDv7()])

				expect(uuid1).toBe('00000000-0000-7000-8000-000000000000' as UUID7Schema.Type)
				expect(uuid2).toBe('00000000-0000-7000-8000-000000000001' as UUID7Schema.Type)
			}).pipe(Effect.provide(UUID7.Sequence())),
		)

		it.effect(
			'should generate valid UUID v7 format with sequence',
			() =>
				Effect.gen(function* () {
					const uuid7 = yield* UUID7
					const result = yield* uuid7.randomUUIDv7()

					expect(result).toMatch(UUID7Regex)
					expect(result).toBe('aaaabbbb-0000-7000-8000-000000000000' as UUID7Schema.Type)
				}).pipe(Effect.provide(UUID7.Sequence('aaaabbbb'))), // Inject test adapter with fixed UUID
		)

		it.effect('should generate multiple sequential UUIDs in a single program', () =>
			Effect.gen(function* () {
				for (let i = 0; i < 5; i++) {
					const uuid = yield* UUID7.randomUUIDv7()
					expect(uuid).toBe(`abcdef12-0000-7000-8000-00000000000${i}` as UUID7Schema.Type)
				}
			}).pipe(Effect.provide(UUID7.Sequence('abcdef12'))),
		)
	})
})
