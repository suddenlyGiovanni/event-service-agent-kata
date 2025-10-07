import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'

import { ClockPort } from '../ports/clock.port.ts'

/**
 * Live Layer providing the ClockPort backed by Effect's Clock service.
 *
 * Exposes a ClockPort implementation whose `now` function retrieves the current
 * time (in millis) from the Effect Clock service and converts it to a DateTime.
 *
 * Layer signature:
 *   Input: Clock.Clock (required service dependency)
 *   Error: never (construction cannot fail)
 *   Output: ClockPort (domain-facing clock abstraction)
 *
 * Notes:
 * - Uses `DateTime.unsafeMake` assuming upstream millisecond epoch is valid.
 * - Keeps effectful time acquisition abstract for testability/determinism.
 */
export const ClockPortLive: Layer.Layer<ClockPort, never, Clock.Clock> = Layer.effect(
	ClockPort,
	Clock.Clock.pipe(
		Effect.map(clock =>
			ClockPort.of({
				now: () => Effect.map(clock.currentTimeMillis, DateTime.unsafeMake),
			}),
		),
	),
)

/**
 * Test Layer providing the ClockPort backed by Effect's TestClock service.
 *
 * Exposes a ClockPort implementation whose `now` function retrieves the current
 * simulated time (in millis) from the TestClock and converts it to a DateTime.
 *
 * Layer signature:
 *   Input: TestClock.TestClock (required test dependency)
 *   Error: never (construction cannot fail)
 *   Output: ClockPort (domain-facing clock abstraction)
 *
 * Notes:
 * - Deterministic: advance or set time via TestClock utilities to drive scenarios.
 * - Uses `DateTime.unsafeMake` assuming provided millis are valid.
 * - Mirrors the live layer for parity while enabling controlled time in tests.
 */
export const ClockPortTest: Layer.Layer<ClockPort, never, TestClock.TestClock> = Layer.effect(
	ClockPort,
	TestClock.TestClock.pipe(
		Effect.map(testClock =>
			ClockPort.of({
				now: () => Effect.map(testClock.currentTimeMillis, DateTime.unsafeMake),
			}),
		),
	),
)
