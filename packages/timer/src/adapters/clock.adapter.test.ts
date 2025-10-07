import { describe, expect, it } from 'bun:test'

import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'
import * as TestContext from 'effect/TestContext'

import { ClockPort } from '../ports/clock.port.ts'
import { ClockPortLive, ClockPortTest } from './clock.adapter.ts'

describe('ClockPort Adapters', () => {
	describe('ClockPortLive', () => {
		describe('service provision', () => {
			it('provides ClockPort service', async () => {
				const program = ClockPort.pipe(
					Effect.andThen(clock => {
						expect(clock).toBeDefined()
						expect(typeof clock.now).toBe('function')
					}),
					Effect.provide(ClockPortLive),
				)

				// ClockPortLive has no requirements (Clock is default service)
				await Effect.runPromise(program)
			})
		})

		describe('now() behavior', () => {
			it('returns DateTime.Utc', async () => {
				const program = ClockPort.pipe(
					Effect.flatMap(clock => clock.now()),
					Effect.andThen(time => {
						// Verify it's a DateTime
						expect(DateTime.isDateTime(time)).toBe(true)

						// Verify it's UTC specifically
						expect(DateTime.isUtc(time)).toBe(true)
					}),
					Effect.provide(ClockPortLive),
				)

				await Effect.runPromise(program)
			})

			it('returns advancing time on multiple calls', async () => {
				const program = Effect.gen(function* () {
					const clock = yield* ClockPort

					const time1 = yield* clock.now()
					yield* Effect.sleep('10 millis') // Small delay
					const time2 = yield* clock.now()

					// time2 should be >= time1 (time moves forward)
					expect(DateTime.greaterThanOrEqualTo(time2, time1)).toBe(true)
				}).pipe(Effect.provide(ClockPortLive))

				await Effect.runPromise(program)
			})

			it('multiple calls to now() all succeed', async () => {
				const program = Effect.gen(function* () {
					const clock = yield* ClockPort

					// Call multiple times
					const times = yield* Effect.all([clock.now(), clock.now(), clock.now()])

					// All calls succeeded (returned DateTime)
					expect(times).toHaveLength(3)
					for (const time of times) {
						expect(DateTime.isDateTime(time)).toBe(true)
					}
				}).pipe(Effect.provide(ClockPortLive))

				await Effect.runPromise(program)
			})
		})
	})

	describe('ClockPortTest', () => {
		// Compose layers: TestContext.TestContext provides TestClock, ClockPortTest uses it to provide ClockPort
		// Layer.provide feeds outer's output into inner's input
		const testLayer = Layer.provide(ClockPortTest, TestContext.TestContext)

		describe('service provision', () => {
			it('provides ClockPort service', async () => {
				const program = Effect.gen(function* () {
					const clock = yield* ClockPort

					expect(clock).toBeDefined()
					expect(typeof clock.now).toBe('function')
				}).pipe(Effect.provide(testLayer))

				// TestClock is provided by TestContext.TestContext
				await Effect.runPromise(program)
			})
		})

		describe('TestClock integration', () => {
			it('returns time controlled by TestClock.adjust', async () => {
				const program = Effect.gen(function* () {
					const clock = yield* ClockPort

					const time1 = yield* clock.now()

					// Advance TestClock by 5 minutes
					yield* TestClock.adjust('5 minutes')

					const time2 = yield* clock.now()

					// Verify time advanced by exactly 5 minutes
					const diffMillis = DateTime.toEpochMillis(time2) - DateTime.toEpochMillis(time1)
					expect(diffMillis).toBe(5 * 60 * 1000)
				}).pipe(Effect.provide(testLayer))

				await Effect.runPromise(program)
			})

			it('supports TestClock.setTime', async () => {
				const targetTime = DateTime.unsafeMake('2025-12-25T00:00:00Z')
				const targetMillis = DateTime.toEpochMillis(targetTime)

				const program = Effect.gen(function* () {
					// Set TestClock to specific time
					yield* TestClock.setTime(targetMillis)

					const clock = yield* ClockPort
					const time = yield* clock.now()

					// Verify ClockPort returns the set time
					expect(DateTime.Equivalence(time, targetTime)).toBe(true)
				}).pipe(Effect.provide(testLayer))

				await Effect.runPromise(program)
			})

			it('accumulates multiple TestClock adjustments', async () => {
				const program = Effect.gen(function* () {
					const clock = yield* ClockPort

					const time1 = yield* clock.now()

					// Advance in multiple steps
					yield* TestClock.adjust('1 minute')
					yield* TestClock.adjust('2 minutes')
					yield* TestClock.adjust('3 minutes')

					const time2 = yield* clock.now()

					// Total advance should be 6 minutes
					expect(DateTime.distance(time1, time2)).toBe(6 * 60 * 1_000)
				}).pipe(Effect.provide(testLayer))

				await Effect.runPromise(program)
			})
		})
	})
})
