/**
 * Clock Port Adapters
 *
 * Provides production and test implementations of ClockPort:
 *
 * - **Clock.Live**: Uses Effect's Clock service (real system time)
 * - **Clock.Test**: Uses Effect's TestClock service (controlled time for testing)
 *
 * Both adapters follow the Effect Layer pattern for dependency injection, ensuring proper resource management and test
 * isolation.
 *
 * @see packages/timer/src/ports/clock.port.ts — Port interface specification
 * @see docs/design/hexagonal-architecture-layers.md — Adapter layer guidelines
 */

import * as Clock_ from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'

import { ClockPort } from '../ports/clock.port.ts'

export class Clock {
	/**
	 * Production clock adapter backed by Effect's Clock service
	 *
	 * Uses real system time via Clock.currentTimeMillis. This is the default implementation for production workloads where
	 * time should advance naturally.
	 *
	 * Why Effect.Clock instead of Date.now():
	 *
	 * - Testability: Can be swapped for TestClock in tests
	 * - Effect integration: Returns Effect for composition
	 * - Tracing: Clock access can be traced/logged
	 *
	 * Layer signature: `Layer<ClockPort, never, never>`
	 *
	 * - Provides: ClockPort (domain abstraction)
	 * - Requires: none (Clock is default Effect service)
	 * - Error: never (construction cannot fail)
	 */
	static readonly Live: Layer.Layer<ClockPort> = Layer.succeed(
		ClockPort,
		ClockPort.of({
			now: () => Effect.map(Clock_.currentTimeMillis, DateTime.unsafeMake),
		}),
	)

	/**
	 * Test clock adapter backed by Effect's TestClock service
	 *
	 * Provides controlled time for deterministic testing. Time only advances when explicitly adjusted via
	 * TestClock.adjust() or TestClock.setTime().
	 *
	 * Why TestClock for tests:
	 *
	 * - **Determinism**: Tests get reproducible results (no flaky time-based tests)
	 * - **Speed**: Can advance hours/days instantly (no actual waiting)
	 * - **Precision**: Control exact time progression (test edge cases)
	 * - **Isolation**: Each test gets independent time context
	 *
	 * Layer signature: Layer<ClockPort, never, never>
	 *
	 * - Provides: ClockPort (domain abstraction)
	 * - Requires: none (TestClock provided via TestContext in tests)
	 * - Error: never (construction cannot fail)
	 *
	 * Note: TestContext.TestContext layer must be provided in test setup for TestClock to function properly.
	 */
	static readonly Test: Layer.Layer<ClockPort> = Layer.succeed(
		ClockPort,
		ClockPort.of({
			now: () => Effect.map(TestClock.currentTimeMillis, DateTime.unsafeMake),
		}),
	)
}
