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
					PollingWorker.run().pipe(Effect.provide(Layer.merge(CountingPersistence, makeTimerEventBusTest()))),
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
					PollingWorker.run().pipe(Effect.provide(Layer.merge(CountingPersistence, FailingTimerEventBus))),
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
					PollingWorker.run().pipe(Effect.provide(Layer.merge(FailingPersistence, makeTimerEventBusTest()))),
				)

				// Advance clock by 10 seconds
				yield* TestClock.adjust('10 seconds')

				// Give the worker a chance to run scheduled work after the clock jump
				yield* Effect.yieldNow()

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
					PollingWorker.run().pipe(Effect.provide(Layer.merge(CountingPersistence, makeTimerEventBusTest()))),
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
})
