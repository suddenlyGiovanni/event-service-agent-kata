/**
 * Clock Port Adapters
 *
 * Provides production and test implementations of ClockPort:
 * - **ClockPortLive**: Uses Effect's Clock service (real system time)
 * - **ClockPortTest**: Uses Effect's TestClock service (controlled time for testing)
 *
 * Both adapters follow the Effect Layer pattern for dependency injection,
 * ensuring proper resource management and test isolation.
 *
 * @see packages/timer/src/ports/clock.port.ts — Port interface specification
 * @see docs/design/hexagonal-architecture-layers.md — Adapter layer guidelines
 */

import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'

import { ClockPort } from '../ports/clock.port.ts'

/**
 * Production clock adapter backed by Effect's Clock service
 *
 * Uses real system time via Clock.currentTimeMillis. This is the default
 * implementation for production workloads where time should advance naturally.
 *
 * Why Effect.Clock instead of Date.now():
 * - Testability: Can be swapped for TestClock in tests
 * - Effect integration: Returns Effect for composition
 * - Tracing: Clock access can be traced/logged
 *
 * Layer signature:
 *   Layer<ClockPort, never, never>
 *   - Provides: ClockPort (domain abstraction)
 *   - Requires: none (Clock is default Effect service)
 *   - Error: never (construction cannot fail)
 *
 * @example Production usage
 * ```typescript ignore
 * const program = Effect.gen(function* () {
 *   const clock = yield* ClockPort
 *   const now = yield* clock.now()
 *   // now is current system time
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
 * Test clock adapter backed by Effect's TestClock service
 *
 * Provides controlled time for deterministic testing. Time only advances when
 * explicitly adjusted via TestClock.adjust() or TestClock.setTime().
 *
 * Why TestClock for tests:
 * - **Determinism**: Tests get reproducible results (no flaky time-based tests)
 * - **Speed**: Can advance hours/days instantly (no actual waiting)
 * - **Precision**: Control exact time progression (test edge cases)
 * - **Isolation**: Each test gets independent time context
 *
 * Layer signature:
 *   Layer<ClockPort, never, never>
 *   - Provides: ClockPort (domain abstraction)
 *   - Requires: none (TestClock provided via TestContext in tests)
 *   - Error: never (construction cannot fail)
 *
 * Note: TestContext.TestContext layer must be provided in test setup for
 * TestClock to function properly.
 *
 * @example Test with time control
 * ```typescript ignore
 * it.effect('should process timer after 5 minutes', () =>
 *   Effect.gen(function* () {
 *     const clock = yield* ClockPort
 *     const t1 = yield* clock.now()
 *
 *     // Schedule timer for 5 minutes from now
 *     yield* scheduleTimer({ dueAt: DateTime.add(t1, '5 minutes') })
 *
 *     // Advance time instantly
 *     yield* TestClock.adjust('5 minutes')
 *
 *     // Timer should be due now
 *     const t2 = yield* clock.now()
 *     const dueTimers = yield* findDue(t2)
 *     expect(Chunk.size(dueTimers)).toBe(1)
 *   }).pipe(Effect.provide(ClockPortTest))
 * )
 * ```
 *
 * @example Testing edge case (exact millisecond boundary)
 * ```typescript ignore
 * it.effect('should fire timer at exact due time', () =>
 *   Effect.gen(function* () {
 *     const clock = yield* ClockPort
 *     const now = yield* clock.now()
 *     const dueAt = DateTime.add(now, '1 second')
 *
 *     yield* scheduleTimer({ dueAt })
 *
 *     // Set time to EXACTLY dueAt (not before, not after)
 *     yield* TestClock.setTime(dueAt.epochMillis)
 *
 *     const current = yield* clock.now()
 *     expect(DateTime.equals(current, dueAt)).toBe(true)
 *
 *     const dueTimers = yield* findDue(current)
 *     expect(Chunk.size(dueTimers)).toBe(1) // Should be due (inclusive comparison)
 *   }).pipe(Effect.provide(ClockPortTest))
 * )
 * ```
 */
export const ClockPortTest: Layer.Layer<ClockPort> = Layer.succeed(
	ClockPort,
	ClockPort.of({
		now: () => Effect.map(TestClock.currentTimeMillis, DateTime.unsafeMake),
	}),
)
