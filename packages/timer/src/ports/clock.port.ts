/**
 * ClockPort — Time service abstraction
 *
 * Provides current time access with controllable implementation for testing.
 * This is a fundamental port that enables deterministic time handling in tests
 * while using real system time in production.
 *
 * Why this abstraction exists:
 * - **Testability**: Tests can control time progression (TestClock.adjust)
 * - **Determinism**: Tests get reproducible results (no flaky time-based tests)
 * - **Simplicity**: Single method interface (just "what time is it?")
 *
 * This port follows Effect's port/adapter pattern:
 * - Port defines WHAT (interface) — domain needs current time
 * - Adapter defines HOW (implementation) — Effect Clock or TestClock
 *
 * @see packages/timer/src/adapters/clock.adapter.ts — Live and Test implementations
 * @see docs/design/hexagonal-architecture-layers.md — Port/Adapter pattern
 */

import * as Context from 'effect/Context'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'

/**
 * ClockPort — Port for time operations in Timer module
 *
 * Abstracts system clock to enable:
 * - Testability (inject TestClock for deterministic time)
 * - Time manipulation in tests (TestClock.adjust)
 * - Platform independence (Effect DateTime)
 */
export interface ClockPort {
	/**
	 * Get current UTC time
	 *
	 * Returns Effect to enable:
	 * - Testability (TestClock.adjust in tests)
	 * - Tracing (time access can be logged/traced)
	 * - Composition (time can be part of Effect workflows)
	 *
	 * @returns Effect that produces current UTC time when executed
	 *
	 * @example Production usage
	 * ```typescript ignore
	 * const workflow = Effect.gen(function* () {
	 *   const clock = yield* ClockPort
	 *   const now = yield* clock.now()
	 *   // now is DateTime.Utc (current system time)
	 * })
	 * ```
	 *
	 * @example Test usage with time control
	 * ```typescript ignore
	 * const test = Effect.gen(function* () {
	 *   const clock = yield* ClockPort
	 *   const t1 = yield* clock.now()
	 *
	 *   yield* TestClock.adjust('5 minutes')
	 *
	 *   const t2 = yield* clock.now()
	 *   // t2 is exactly 5 minutes after t1
	 * }).pipe(Effect.provide(ClockPortTest))
	 * ```
	 */
	readonly now: () => Effect.Effect<DateTime.Utc>
}

/**
 * ClockPort service tag
 *
 * Use this to access ClockPort from the Effect context.
 * Inject via Layer in production, TestLayer in tests.
 */
export const ClockPort: Context.Tag<ClockPort, ClockPort> = Context.GenericTag<ClockPort>(
	'@event-service-agent/timer/ClockPort',
)
