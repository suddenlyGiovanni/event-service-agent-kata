import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'

import { ClockPort } from '#/ports/clock.port.ts'

/**
 * Live Layer providing the ClockPort backed by Effect's Clock service.
 *
 * Exposes a ClockPort implementation whose `now` function retrieves the current
 * time (in millis) from Clock.currentTimeMillis and converts it to DateTime.Utc.
 *
 * Layer signature:
 *   Layer<ClockPort, never, never>
 *   - Requirements: none (Clock is a default service provided by Effect runtime)
 *   - Error: never (construction cannot fail)
 *   - Output: ClockPort (domain-facing clock abstraction)
 *
 * Implementation:
 * - Uses Clock.currentTimeMillis directly (Effect<number, never, never>)
 * - Clock service is automatically provided by Effect runtime
 * - Converts millisecond epoch to DateTime.Utc via DateTime.unsafeMake
 *
 * Usage:
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const clock = yield* ClockPort
 *   const now = yield* clock.now()
 *   // now is DateTime.Utc
 * }).pipe(Effect.provide(ClockPortLive))
 * ```
 */
export const ClockPortLive: Layer.Layer<ClockPort> = Layer.succeed(
	ClockPort,
	ClockPort.of({
		now: () => Effect.map(Clock.currentTimeMillis, DateTime.unsafeMake),
	}),
)

/**
 * Test Layer providing the ClockPort backed by Effect's TestClock service.
 *
 * Exposes a ClockPort implementation whose `now` function retrieves the current
 * simulated time (in millis) from TestClock.currentTimeMillis and converts it to DateTime.Utc.
 *
 * Layer signature:
 *   Layer<ClockPort, never, never>
 *   - Requirements: none (TestClock provided via TestContext.TestContext)
 *   - Error: never (construction cannot fail)
 *   - Output: ClockPort (domain-facing clock abstraction)
 *
 * Implementation:
 * - Uses TestClock.currentTimeMillis directly (Effect<number, never, never> when TestContext provided)
 * - TestClock must be provided via TestContext.TestContext layer in test setup
 * - Converts millisecond epoch to DateTime.Utc via DateTime.unsafeMake
 * - Enables deterministic time control via TestClock.adjust() and TestClock.setTime()
 *
 * Usage:
 * ```typescript
 * // Compose with TestContext to satisfy TestClock dependency
 * const testLayer = Layer.provide(ClockPortTest, TestContext.TestContext)
 *
 * const program = Effect.gen(function* () {
 *   const clock = yield* ClockPort
 *   const time1 = yield* clock.now()
 *
 *   yield* TestClock.adjust('1 hour')  // Advance time
 *
 *   const time2 = yield* clock.now()
 *   // time2 is exactly 1 hour after time1
 * }).pipe(Effect.provide(testLayer))
 * ```
 */
export const ClockPortTest: Layer.Layer<ClockPort> = Layer.succeed(
	ClockPort,
	ClockPort.of({
		now: () => Effect.map(TestClock.currentTimeMillis, DateTime.unsafeMake),
	}),
)
