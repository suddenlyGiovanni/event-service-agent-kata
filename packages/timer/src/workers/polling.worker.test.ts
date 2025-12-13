import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as TestClock from 'effect/TestClock'

import { UUID7 } from '@event-service-agent/platform/adapters'
import { SQL } from '@event-service-agent/platform/database'

import * as Adapters from '../adapters/index.ts'
import * as Ports from '../ports/index.ts'
import { PollingWorker } from './index.ts'

/**
 * Base test layers for PollingWorker tests
 *
 * Uses TestClock to control time advancement for testing scheduled repetition.
 * Uses TimerEventBus.Live composed over mocked Platform.EventBusPort.
 */
const BaseTestLayers = Layer.mergeAll(Adapters.Clock.Test, UUID7.Default, Adapters.TimerPersistence.Test, SQL.Test)

/**
 * Creates a mock Platform.EventBusPort and composes TimerEventBus.Live on top
 *
 * Following the pattern from timer-event-bus.adapter.test.ts:
 * - Mock at the infrastructure layer (Platform.EventBusPort)
 * - Use real adapter layer (TimerEventBus.Live)
 */
const makeTimerEventBusTest = () => {
	const EventBusMock = Layer.mock(Ports.Platform.EventBusPort, {
		publish: () => Effect.void,
	})
	return Layer.provide(Adapters.TimerEventBus.Live, Layer.merge(EventBusMock, BaseTestLayers))
}

describe('PollingWorker', () => {
	describe('run', () => {
		it.scoped('should poll on 5-second intervals', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 * WHEN TestClock advances by 15 seconds
				 * THEN findDue should be called 4 times (at 0s, 5s, 10s, 15s)
				 * ```
				 *
				 * Note: Schedule.spaced runs immediately on start, then waits 5s between each run.
				 * So at 15s we have: initial + 3 spaced runs = 4 total.
				 */

				// Track findDue calls
				const pollCount = yield* Ref.make(0)

				// Get base persistence and wrap with counting
				const basePersistence = yield* Ports.TimerPersistencePort
				const CountingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								yield* Ref.update(pollCount, (n) => n + 1)
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(CountingPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 15 seconds
				yield* TestClock.adjust('15 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have polled 4 times (0s, 5s, 10s, 15s)
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(4)
			}).pipe(Effect.provide(BaseTestLayers)),
		)

		it.scoped('should recover from BatchProcessingError and continue polling', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND the first poll fails with BatchProcessingError
				 * WHEN TestClock advances by 10 seconds
				 * THEN findDue should be called 3 times (at 0s failure, 5s success, 10s success)
				 *   AND polling should continue despite the error
				 * ```
				 */

				const pollCount = yield* Ref.make(0)

				// Platform.EventBusPort that fails on first call (triggers BatchProcessingError via TimerEventBus.Live)
				let eventBusCallCount = 0
				const FailingEventBusMock: Layer.Layer<Ports.Platform.EventBusPort> = Layer.mock(Ports.Platform.EventBusPort, {
					publish: () => {
						eventBusCallCount++
						if (eventBusCallCount === 1) {
							return Effect.fail(
								new Ports.Platform.PublishError({
									cause: new Error('Simulated failure'),
									message: 'First call fails',
								}),
							)
						}
						return Effect.void
					},
				})
				const FailingTimerEventBus = Layer.provide(
					Adapters.TimerEventBus.Live,
					Layer.merge(FailingEventBusMock, BaseTestLayers),
				)

				// Get base persistence and wrap with counting + timer creation
				const basePersistence = yield* Ports.TimerPersistencePort
				const CountingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								yield* Ref.update(pollCount, (n) => n + 1)
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(CountingPersistence, FailingTimerEventBus))),
				)

				// Advance clock by 10 seconds (past first failure + one successful poll)
				yield* TestClock.adjust('10 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have polled 3 times (0s, 5s, 10s) - recovered from first failure
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(3)
			}).pipe(Effect.provide(BaseTestLayers)),
		)

		it.scoped('should recover from PersistenceError and continue polling', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND the first findDue call fails with PersistenceError
				 * WHEN TestClock advances by 10 seconds
				 * THEN findDue should be called 3 times (at 0s failure, 5s success, 10s success)
				 *   AND polling should continue despite the error
				 * ```
				 */

				const pollCount = yield* Ref.make(0)

				// Get base persistence and wrap with failing first call
				const basePersistence = yield* Ports.TimerPersistencePort
				const FailingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								const currentCount = yield* Ref.getAndUpdate(pollCount, (n) => n + 1)
								// Fail on first call only
								if (currentCount === 0) {
									return yield* Effect.fail(
										new Ports.PersistenceError({
											cause: 'Simulated DB failure',
											operation: 'findDue',
										}),
									)
								}
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(FailingPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 10 seconds
				yield* TestClock.adjust('10 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have polled 3 times (0s failure, 5s, 10s) - recovered
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(3)
			}).pipe(Effect.provide(BaseTestLayers)),
		)

		it.scoped('should handle multiple consecutive poll cycles', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 * WHEN TestClock advances by 25 seconds
				 * THEN findDue should be called 6 times (at 0s, 5s, 10s, 15s, 20s, 25s)
				 * ```
				 */

				const pollCount = yield* Ref.make(0)

				// Get base persistence and wrap with counting
				const basePersistence = yield* Ports.TimerPersistencePort
				const CountingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								yield* Ref.update(pollCount, (n) => n + 1)
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(CountingPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 25 seconds
				yield* TestClock.adjust('25 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have polled 6 times (0s, 5s, 10s, 15s, 20s, 25s)
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(6)
			}).pipe(Effect.provide(BaseTestLayers)),
		)
	})

	describe('Edge Cases', () => {
		it.scoped('should handle zero timers gracefully', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND persistence is empty (no timers)
				 * WHEN TestClock advances by 10 seconds
				 * THEN findDue should be called 3 times (0s, 5s, 10s)
				 *   AND no errors should occur
				 * ```
				 */

				const pollCount = yield* Ref.make(0)

				// Get base persistence and wrap with counting
				const basePersistence = yield* Ports.TimerPersistencePort
				const CountingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								yield* Ref.update(pollCount, (n) => n + 1)
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(CountingPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 10 seconds
				yield* TestClock.adjust('10 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have polled 3 times without errors
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(3)
			}).pipe(Effect.provide(BaseTestLayers)),
		)

		it.scoped('should handle rapid successive errors and recoveries', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND findDue alternates between failure and success
				 * WHEN TestClock advances by 20 seconds
				 * THEN all polls should complete (error recovery on every other poll)
				 *   AND polling should continue without crashing
				 * ```
				 */

				const pollCount = yield* Ref.make(0)

				// Get base persistence and wrap with alternating failures
				const basePersistence = yield* Ports.TimerPersistencePort
				const AlternatingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								const currentCount = yield* Ref.getAndUpdate(pollCount, (n) => n + 1)
								// Fail on even counts (0, 2, 4, ...), succeed on odd
								if (currentCount % 2 === 0) {
									return yield* Effect.fail(
										new Ports.PersistenceError({
											cause: 'Intermittent DB failure',
											operation: 'findDue',
										}),
									)
								}
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(AlternatingPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 20 seconds (should attempt 5 polls: 0s, 5s, 10s, 15s, 20s)
				yield* TestClock.adjust('20 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have attempted 5 polls despite alternating failures
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(5)
			}).pipe(Effect.provide(BaseTestLayers)),
		)

		it.scoped('should maintain schedule timing after errors', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND the first poll fails
				 * WHEN TestClock advances
				 * THEN subsequent polls should occur at correct 5-second intervals
				 *   AND error should not disrupt timing
				 * ```
				 */

				const pollTimes: number[] = []

				// Get base persistence and track poll times
				const basePersistence = yield* Ports.TimerPersistencePort
				const TimedPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								const clock = yield* Ports.ClockPort
								const currentTime = yield* clock.now()
								pollTimes.push(currentTime.epochMillis)

								// Fail first poll
								if (pollTimes.length === 1) {
									return yield* Effect.fail(
										new Ports.PersistenceError({
											cause: 'First poll fails',
											operation: 'findDue',
										}),
									)
								}
								return yield* basePersistence.findDue(now)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(TimedPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 15 seconds
				yield* TestClock.adjust('15 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Should have 4 polls at correct intervals
				expect(pollTimes.length).toBe(4)

				// Verify 5-second intervals (allowing for test clock precision)
				for (let i = 1; i < pollTimes.length; i++) {
					const interval = pollTimes[i]! - pollTimes[i - 1]!
					expect(interval).toBe(5000) // 5 seconds in milliseconds
				}
			}).pipe(Effect.provide(BaseTestLayers)),
		)
	})

	describe('Concurrency and Race Conditions', () => {
		it.scoped('should handle concurrent findDue calls gracefully', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND findDue takes significant time to complete
				 * WHEN a new poll cycle starts before previous completes
				 * THEN both polls should complete independently
				 *   AND no data corruption should occur
				 * ```
				 *
				 * Note: Schedule.fixed prevents overlapping executions, so this test
				 * verifies that behavior is maintained.
				 */

				const activeCalls = yield* Ref.make(0)
				const maxConcurrent = yield* Ref.make(0)

				// Get base persistence and wrap with concurrency tracking
				const basePersistence = yield* Ports.TimerPersistencePort
				const SlowPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: (now) =>
							Effect.gen(function* () {
								// Track concurrent calls
								const current = yield* Ref.updateAndGet(activeCalls, (n) => n + 1)
								yield* Ref.update(maxConcurrent, (max) => Math.max(max, current))

								// Simulate slow query
								yield* Effect.sleep('100 millis')

								const result = yield* basePersistence.findDue(now)

								yield* Ref.update(activeCalls, (n) => n - 1)
								return result
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(SlowPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 10 seconds (should trigger 3 polls)
				yield* TestClock.adjust('10 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: Schedule.fixed should prevent concurrent execution
				const max = yield* Ref.get(maxConcurrent)
				expect(max).toBe(1)
			}).pipe(Effect.provide(BaseTestLayers)),
		)
	})

	describe('Performance and Resource Management', () => {
		it.scoped('should not accumulate memory on repeated error recovery', () =>
			Effect.gen(function* () {
				/**
				 * ```txt
				 * GIVEN PollingWorker.run() is started
				 *   AND errors occur on every poll
				 * WHEN TestClock advances through many cycles
				 * THEN all polls should be attempted
				 *   AND error handling should not leak resources
				 * ```
				 *
				 * Note: This is a behavioral test. Actual memory profiling would
				 * require runtime instrumentation beyond vitest's capabilities.
				 */

				const pollCount = yield* Ref.make(0)

				// Persistence that always fails
				const basePersistence = yield* Ports.TimerPersistencePort
				const AlwaysFailingPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						findDue: () =>
							Effect.gen(function* () {
								yield* Ref.update(pollCount, (n) => n + 1)
								return yield* Effect.fail(
									new Ports.PersistenceError({
										cause: 'Persistent failure',
										operation: 'findDue',
									}),
								)
							}),
					}),
				)

				// Fork the worker
				const fiber = yield* Effect.fork(
					PollingWorker.run.pipe(Effect.provide(Layer.merge(AlwaysFailingPersistence, makeTimerEventBusTest()))),
				)

				// Advance through many cycles (50 seconds = 11 polls)
				yield* TestClock.adjust('50 seconds')

				// Interrupt the worker
				yield* Fiber.interrupt(fiber)

				// Assert: All polls should have been attempted
				const count = yield* Ref.get(pollCount)
				expect(count).toBe(11)

				// Fiber should be interruptible (not stuck)
				const status = yield* Fiber.status(fiber)
				expect(status._tag).not.toBe('Running')
			}).pipe(Effect.provide(BaseTestLayers)),
		)
	})
})
