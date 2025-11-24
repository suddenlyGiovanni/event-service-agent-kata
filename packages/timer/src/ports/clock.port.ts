/**
 * ClockPort — Time service abstraction
 *
 * Provides current time access with controllable implementation for testing. This is a fundamental port that enables
 * deterministic time handling in tests while using real system time in production.
 *
 * Why this abstraction exists:
 *
 * - **Testability**: Tests can control time progression (TestClock.adjust)
 * - **Determinism**: Tests get reproducible results (no flaky time-based tests)
 * - **Simplicity**: Single method interface (just "what time is it?")
 *
 * This port follows Effect's port/adapter pattern:
 *
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
 *
 * - Testability (inject TestClock for deterministic time)
 * - Time manipulation in tests (TestClock.adjust)
 * - Platform independence (Effect DateTime)
 */
export class ClockPort extends Context.Tag('@event-service-agent/timer/ClockPort')<
	ClockPort,
	{
		/**
		 * Get current UTC time
		 *
		 * Returns Effect to enable:
		 *
		 * - Testability (TestClock.adjust in tests)
		 * - Tracing (time access can be logged/traced)
		 * - Composition (time can be part of Effect workflows)
		 *
		 * @example
		 *
		 * ```typescript
		 * import * as Effect from "effect/Effect"
		 * import * as DateTime from "effect/DateTime"
		 * import * as Adapters from "../adapters/index.ts"
		 *
		 * // Validate timer is scheduled for future time (domain rule)
		 * declare const dueAt: DateTime.Utc
		 *
		 * const validateFutureTime: Effect.Effect<DateTime.Utc, Error, ClockPort> = Effect.gen(function* () {
		 *   const clock = yield* ClockPort
		 *   const now = yield* clock.now()
		 *   if (DateTime.lessThanOrEqualTo(dueAt, now)) {
		 *     return yield* Effect.fail(new Error("Timer must be scheduled in future"))
		 *   }
		 *   return dueAt
		 * })
		 *
		 * // Resolve dependency via Effect.provide (hexagonal architecture + Effect DI)
		 * validateFutureTime.pipe(Effect.provide(Adapters.Clock.Test))
		 * // Effect.Effect<DateTime.Utc, Error, never>
		 * ```
		 *
		 * @returns Effect that produces current UTC time when executed
		 */
		readonly now: () => Effect.Effect<DateTime.Utc>
	}
>() {}

export declare namespace ClockPort {
	type Type = Context.Tag.Service<ClockPort>
}
