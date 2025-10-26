import { describe, expect, it } from '@effect/vitest'
import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as TestClock from 'effect/TestClock'

import { UUID7 } from '@event-service-agent/contracts/services'
import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { ClockPortTest } from '../adapters/clock.adapter.ts'
import { TimerPersistence } from '../adapters/timer-persistence.adapter.ts'
import { ScheduledTimer, TimerEntry } from '../domain/timer-entry.domain.ts'
import { ClockPort, PersistenceError, PublishError, TimerEventBusPort, TimerPersistencePort } from '../ports/index.ts'
import { pollDueTimersWorkflow } from './poll-due-timers.workflow.ts'

/**
 * Test suite for pollDueTimersWorkflow
 *
 * Covers:
 * - Happy path (timers found and processed)
 * - Edge cases (no timers, empty batches)
 * - Error handling (publish failures, persistence failures)
 * - Partial failures (some timers succeed, others fail)
 * - Idempotency (duplicate processing attempts)
 * - Observability (spans, logs, context propagation)
 */
describe('pollDueTimersWorkflow', () => {
	describe('Happy Path', () => {
		it.effect('processes due timers successfully', () => {
			// Mock EventBus to track published events
			const publishedEvents: unknown[] = []
			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
			const serviceCallId = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')

			return Effect.gen(function* () {
				/**
				 * GIVEN a single timer that is due
				 * WHEN pollDueTimersWorkflow executes
				 * THEN the DueTimeReached event should be published
				 *   AND the timer should be marked as Reached
				 *   AND workflow should complete successfully
				 */

				// Arrange: Create a timer that will be due
				const clock = yield* ClockPort
				const now = yield* clock.now()

				// Timer will be due in 5 minutes
				const dueAt = DateTime.add(now, { minutes: 5 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				}) // Get persistence and save timer
				const persistence = yield* TimerPersistencePort
				yield* persistence.save(scheduledTimer)

				// Verify timer is not due yet
				const notDueYet = yield* persistence.findDue(yield* DateTime.now)
				expect(Chunk.isEmpty(notDueYet)).toBe(true)

				// Act: Advance time to make timer due (5 minutes + 1 second)
				yield* TestClock.adjust('6 minutes')

				// Execute workflow
				yield* pollDueTimersWorkflow()

				// Assert: Verify event was published
				expect(publishedEvents).toHaveLength(1)

				// Assert: Verify timer was marked as Reached
				const found = yield* persistence.find(tenantId, serviceCallId)
				expect(Option.isSome(found)).toBe(true)

				const timer = Option.getOrThrow(found)
				expect(timer._tag).toBe('Reached')

				// Assert: Timer should no longer appear in findDue
				const afterFired = yield* persistence.findDue(yield* DateTime.now)
				expect(Chunk.isEmpty(afterFired)).toBe(true)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus)))
		})

		it.effect('processes multiple due timers sequentially', () => {
			/**
			 * GIVEN three timers that are due
			 * WHEN pollDueTimersWorkflow executes
			 * THEN all three DueTimeReached events should be published in order
			 *   AND all three timers should be marked as Reached
			 *   AND workflow should complete successfully
			 */

			// Track the order of operations to verify sequential processing
			const operations: string[] = []
			const publishedEvents: unknown[] = []

			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						operations.push(`publish:${timer.serviceCallId}`)
						publishedEvents.push({ firedAt, timer })
					}),
			})

			const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
			const serviceCallIds = [
				ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1'),
				ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2'),
				ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a3'),
			]

			return Effect.gen(function* () {
				// Arrange: Create three timers that will be due
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				// Create and save timers using iteration
				const timers = serviceCallIds.map(serviceCallId =>
					ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt,
						serviceCallId,
						tenantId,
					}),
				)

				yield* Effect.forEach(timers, persistence.save, { concurrency: 1, discard: true })

				// Act: Advance time to make all timers due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow
				yield* pollDueTimersWorkflow()

				// Assert: All three events should be published
				expect(publishedEvents).toHaveLength(serviceCallIds.length)

				// Assert: All three timers should be marked as Reached using iteration
				yield* pipe(
					serviceCallIds,
					// biome-ignore lint/suspicious/useIterableCallbackReturn: Ensure proper iteration
					Effect.forEach(serviceCallId => persistence.find(tenantId, serviceCallId), { concurrency: 1 }),
					Effect.andThen(foundTimers => {
						foundTimers.forEach(found => {
							expect(Option.isSome(found)).toBe(true)
							expect(found.pipe(Option.exists(TimerEntry.isReached))).toBe(true)
						})
					}),
				)

				// Assert: No timers should remain in findDue
				const afterFired = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(afterFired)).toBe(true)

				// Assert: All operations should have occurred (3 publishes)
				expect(operations.filter(op => op.startsWith('publish:'))).toHaveLength(serviceCallIds.length)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus)))
		})

		it.effect('publishes event before marking timer as fired', () => {
			/**
			 * GIVEN a timer that is due
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the event should be published first
			 *   AND the timer should be marked as fired second
			 *   AND the order should be verifiable via call sequence
			 */

			const operations: string[] = []

			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: timer =>
					Effect.sync(() => {
						operations.push(`publish:${timer.serviceCallId}`)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that will be due
				const clock = yield* ClockPort
				const basePersistence = yield* TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				})

				yield* basePersistence.save(scheduledTimer)

				// Create wrapped persistence that tracks markFired calls
				const TestPersistence = Layer.succeed(
					TimerPersistencePort,
					TimerPersistencePort.of({
						...basePersistence,
						markFired: (tenantId, serviceCallId, reachedAt) =>
							Effect.gen(function* () {
								operations.push(`markFired:${serviceCallId}`)
								yield* basePersistence.markFired(tenantId, serviceCallId, reachedAt)
							}),
					}),
				)

				// Act: Advance time to make timer due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow with wrapped persistence
				yield* pollDueTimersWorkflow().pipe(Effect.provide(TestPersistence))

				// Assert: Should have exactly 2 operations
				expect(operations).toHaveLength(2)

				// Assert: publish should happen before markFired
				expect(operations[0]).toBe(`publish:${serviceCallId}`)
				expect(operations[1]).toBe(`markFired:${serviceCallId}`)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.effect('propagates correlationId from timer to event', () => {
			/**
			 * GIVEN a timer with a correlationId
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the published DueTimeReached event should include the correlationId
			 *   AND the correlationId should match the timer's correlationId
			 */

			let publishedTimer: ScheduledTimer | undefined

			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: timer =>
					Effect.sync(() => {
						publishedTimer = timer
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()
				const correlationId = yield* CorrelationId.makeUUID7()

				// Arrange: Create a timer with a specific correlationId
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.some(correlationId),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Advance time to make timer due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow
				yield* pollDueTimersWorkflow()

				// Assert: Timer should have been published
				expect(publishedTimer).toBeDefined()
				if (!publishedTimer) throw new Error('Timer was not published')

				// Assert: Published timer should have the same correlationId
				expect(Option.isSome(publishedTimer.correlationId)).toBe(true)
				expect(Option.getOrThrow(publishedTimer.correlationId)).toBe(correlationId)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})
	})

	describe('Edge Cases - Empty Results', () => {
		it.effect('completes successfully when no timers are due', () => {
			/**
			 * GIVEN no timers are due (findDue returns empty Chunk)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN no events should be published
			 *   AND no persistence operations should occur
			 *   AND workflow should complete successfully
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []
			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that is NOT due yet (future)
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const now = yield* clock.now()

				// Timer due in 10 minutes (well into the future)
				const dueAt = DateTime.add(now, { minutes: 10 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				}) // Save the future timer
				yield* persistence.save(scheduledTimer)

				// Act: Advance time to while timer is still not due
				yield* TestClock.adjust('9 minutes')

				// Verify timer exists but is not due
				const notDueYet = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(notDueYet)).toBe(true)

				// Act: Execute workflow (should find no due timers)
				yield* pollDueTimersWorkflow()

				// Assert: No events should be published
				expect(publishedEvents).toHaveLength(0)

				// Assert: Timer should still be in Scheduled state (not processed)
				const found = yield* persistence.find(tenantId, serviceCallId)
				expect(Option.isSome(found)).toBe(true)
				expect(Option.exists(found, TimerEntry.isScheduled)).toBe(true)

				// Assert: Workflow completed successfully (no errors)
				// (implicit - if we reach here, no exceptions were thrown)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.effect('completes successfully when persistence is empty', () => {
			/**
			 * GIVEN persistence has no timers at all
			 * WHEN pollDueTimersWorkflow executes
			 * THEN findDue should return empty Chunk
			 *   AND workflow should complete successfully
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []
			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			return Effect.gen(function* () {
				// Arrange: Start with empty persistence (no timers saved)
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort

				// Verify persistence is empty
				const noDueTimers = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(noDueTimers)).toBe(true)

				// Act: Execute workflow (should find nothing)
				yield* pollDueTimersWorkflow()

				// Assert: No events published
				expect(publishedEvents).toHaveLength(0)

				// Assert: Workflow completed successfully
				// (implicit - if we reach here, no exceptions were thrown)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus)))
		})
	})

	describe('Edge Cases - Timing Boundaries', () => {
		it.effect('processes timer exactly at dueAt time', () => {
			/**
			 * GIVEN a timer with dueAt exactly equal to current time (now === dueAt)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the timer should be included in due timers
			 *   AND should be processed successfully
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []
			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()
				// Arrange: Create a timer where dueAt === now (boundary condition)
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const now = yield* clock.now()

				// Timer is due right now (no offset)
				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt: now,
					registeredAt: now,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Execute workflow (timer should be due)
				yield* pollDueTimersWorkflow()

				// Assert: Event should be published (timer is due)
				expect(publishedEvents).toHaveLength(1)

				// Assert: Timer should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isReached)).toBe(true)
					}),
				)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.effect('does not process timer scheduled in the future', () => {
			/**
			 * GIVEN a timer with dueAt > now (future timer)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the timer should NOT be included in due timers
			 *   AND should NOT be processed
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []
			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer due in the future
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const now = yield* clock.now()

				// Timer due 1 second in the future
				const dueAt = DateTime.add(now, { seconds: 1 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Execute workflow (timer should NOT be due yet)
				yield* pollDueTimersWorkflow()

				// Assert: No events should be published
				expect(publishedEvents).toHaveLength(0)

				// Assert: Timer should still be in Scheduled state
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isScheduled)).toBe(true)
					}),
				)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.effect('processes timer that is overdue', () => {
			/**
			 * GIVEN a timer scheduled for 5 minutes from now
			 *   AND time advances 15 minutes (timer is 10 minutes overdue)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the timer should be included in due timers
			 *   AND should be processed successfully
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []
			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Schedule a timer for 5 minutes from now
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const registeredAt = yield* clock.now()

				// Timer due in 5 minutes
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Advance time to 15 minutes (timer is now 10 minutes overdue)
				yield* TestClock.adjust('15 minutes')

				// Execute workflow (timer is overdue and should fire)
				yield* pollDueTimersWorkflow()

				// Assert: Event should be published (timer is overdue)
				expect(publishedEvents).toHaveLength(1)

				// Assert: Timer should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isReached)).toBe(true)
					}),
				)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})
	})

	describe('Error Handling - Publish Failures', () => {
		it.effect('stops processing timer when publish fails', () => {
			/**
			 * GIVEN a timer that is due
			 *   AND eventBus.publish will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the publish should be attempted
			 *   AND the publish should fail
			 *   AND markFired should NOT be called (short-circuit)
			 *   AND the timer should remain in Scheduled state
			 */

			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: () => Effect.fail(new PublishError({ cause: 'Event bus publish failed' })),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that will be due
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Advance time to make timer due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow - should fail due to publish error
				const result = yield* Effect.exit(pollDueTimersWorkflow())

				// Assert: Workflow should have failed with PublishError
				expect(result).toStrictEqual(Exit.fail(new PublishError({ cause: 'Event bus publish failed' })))

				// Assert: Timer should still be in Scheduled state (markFired NOT called)
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isScheduled)).toBe(true)
					}),
				)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.effect.fails('continues with other timers when one publish fails', () => {
			/**
			 * GIVEN three timers that are due
			 *   AND the second timer's publish will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN timer 1 should be processed successfully
			 *   AND timer 2 publish should fail (timer stays Scheduled)
			 *   AND timer 3 should still be processed successfully
			 *   AND workflow should complete (not fail-fast)
			 *
			 * TODO(PL-4.4): Decide error handling strategy
			 * Current implementation uses Effect.forEach which fails fast.
			 * This test expects continue-on-error behavior.
			 * Design decision needed: fail-fast vs continue-processing
			 * See: ADR needed for batch error handling strategy
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []
			let callCount = 0

			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) => {
					callCount++
					// Fail on second timer (callCount === 2)
					if (callCount === 2) {
						return Effect.fail(new PublishError({ cause: 'Event bus publish failed' }))
					}
					return Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					})
				},
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId1 = yield* ServiceCallId.makeUUID7()
				const serviceCallId2 = yield* ServiceCallId.makeUUID7()
				const serviceCallId3 = yield* ServiceCallId.makeUUID7()
				const serviceCallIds = [serviceCallId1, serviceCallId2, serviceCallId3]

				// Arrange: Create three timers that will be due
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const timers = serviceCallIds.map(serviceCallId =>
					ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt,
						serviceCallId,
						tenantId,
					}),
				)

				yield* Effect.forEach(timers, persistence.save, { concurrency: 1, discard: true })

				// Act: Advance time to make all timers due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow (should not fail-fast)
				yield* pollDueTimersWorkflow()

				// Assert: Two events should be published (timers 1 and 3)
				expect(publishedEvents).toHaveLength(2)

				// Assert: Timer 1 should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId1),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isReached)).toBe(true)
					}),
				)

				// Assert: Timer 2 should still be Scheduled (publish failed)
				yield* pipe(
					persistence.find(tenantId, serviceCallId2),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isScheduled)).toBe(true)
					}),
				)

				// Assert: Timer 3 should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId3),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isReached)).toBe(true)
					}),
				)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.todo('logs error when publish fails', () => {
			/**
			 * GIVEN a timer that is due
			 *   AND eventBus.publish will fail with PublishError
			 * WHEN pollDueTimersWorkflow executes
			 * THEN an error log should be emitted
			 *   AND the log should include serviceCallId, tenantId, error details
			 */
		})
	})

	describe('Error Handling - Persistence Failures', () => {
		it.effect('handles markFired failure after successful publish', () => {
			/**
			 * GIVEN a timer that is due
			 *   AND eventBus.publish succeeds
			 *   AND persistence.markFired will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the event should be published (duplicate on next poll)
			 *   AND markFired should fail
			 *   AND the timer should remain in Scheduled state
			 *   AND an error should be logged
			 */

			const publishedEvents: { firedAt: DateTime.Utc; timer: ScheduledTimer }[] = []

			const TestEventBus = Layer.mock(TimerEventBusPort, {
				publishDueTimeReached: (timer, firedAt) =>
					Effect.sync(() => {
						publishedEvents.push({ firedAt, timer })
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that will be due
				const clock = yield* ClockPort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				}) // Use base persistence for save, then provide a mock that fails markFired
				const basePersistence = yield* TimerPersistencePort
				yield* basePersistence.save(scheduledTimer)

				// Create test layer with failing markFired
				const TestPersistence = Layer.succeed(
					TimerPersistencePort,
					TimerPersistencePort.of({
						...basePersistence,
						markFired: () =>
							Effect.fail(new PersistenceError({ cause: 'Database connection lost', operation: 'markFired' })),
					}),
				)

				// Act: Advance time to make timer due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow with failing markFired - should fail at markFired stage
				const result = yield* Effect.exit(pollDueTimersWorkflow()).pipe(Effect.provide(TestPersistence))

				// Assert: Workflow should have failed with PersistenceError
				expect(result).toStrictEqual(
					Exit.fail(new PersistenceError({ cause: 'Database connection lost', operation: 'markFired' })),
				)

				// Assert: Event should have been published (will be duplicate on retry)
				expect(publishedEvents).toHaveLength(1)

				// Assert: Timer should still be in Scheduled state (markFired failed)
				yield* pipe(
					basePersistence.find(tenantId, serviceCallId),
					Effect.andThen(found => {
						expect(Option.isSome(found)).toBe(true)
						expect(Option.exists(found, TimerEntry.isScheduled)).toBe(true)
					}),
				)
			}).pipe(Effect.provide(Layer.mergeAll(TimerPersistence.inMemory, ClockPortTest, TestEventBus, UUID7.Default)))
		})

		it.todo('continues with other timers when one markFired fails', () => {
			/**
			 * GIVEN three timers that are due
			 *   AND the second timer's markFired will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN timer 1 should be fully processed (published + marked)
			 *   AND timer 2 should be published but not marked (stays Scheduled)
			 *   AND timer 3 should be fully processed
			 *   AND workflow should complete
			 */
		})
	})

	describe('Error Handling - Query Failures', () => {
		it.todo('propagates error when findDue fails', () => {
			/**
			 * GIVEN persistence.findDue will fail with PersistenceError
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the workflow should fail with PersistenceError
			 *   AND no events should be published
			 *   AND no timers should be marked
			 */
		})

		it.todo('propagates error when clock.now fails', () => {
			/**
			 * GIVEN clock.now will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the workflow should fail immediately
			 *   AND no persistence operations should occur
			 */
		})
	})

	describe('Partial Batch Failures', () => {
		it.todo('tracks processed and failed counts correctly', () => {
			/**
			 * GIVEN five timers that are due
			 *   AND timers 2 and 4 will fail (publish or markFired)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN processed count should be 3
			 *   AND failed count should be 2
			 *   AND spans should be annotated with these counts
			 */
		})

		it.todo('processes all timers despite individual failures', () => {
			/**
			 * GIVEN ten timers that are due
			 *   AND three timers will fail at different stages
			 * WHEN pollDueTimersWorkflow executes
			 * THEN all ten timers should be attempted
			 *   AND seven should succeed (published + marked)
			 *   AND three should fail but not stop batch processing
			 */
		})
	})

	describe('Idempotency - Duplicate Processing', () => {
		it.todo('handles timer that is already Reached', () => {
			/**
			 * GIVEN a timer that was already marked as Reached
			 * WHEN pollDueTimersWorkflow executes
			 * THEN findDue should NOT return the timer (already Reached)
			 *   AND no duplicate event should be published
			 */
		})

		it.todo('safely retries timer that failed publish on previous poll', () => {
			/**
			 * GIVEN a timer that failed publish in previous poll (still Scheduled)
			 * WHEN pollDueTimersWorkflow executes again
			 * THEN the timer should be found again (still due)
			 *   AND publish should be retried
			 *   AND if successful, timer should be marked as Reached
			 */
		})

		it.todo('handles duplicate event publishing when markFired fails', () => {
			/**
			 * GIVEN a timer that was published but markFired failed (still Scheduled)
			 * WHEN pollDueTimersWorkflow executes again
			 * THEN the timer should be found again
			 *   AND the event should be published again (duplicate)
			 *   AND this time markFired succeeds
			 *   AND Orchestration handles duplicate via state guard
			 */
		})
	})

	describe('Observability - Span Annotations', () => {
		it.todo('annotates span with due count', () => {
			/**
			 * GIVEN three timers that are due
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the span should be annotated with timer.due_count = 3
			 */
		})

		it.todo('annotates span with processed and failed counts', () => {
			/**
			 * GIVEN five timers, where 2 fail processing
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the span should be annotated with:
			 *   - timer.processed_count = 3
			 *   - timer.failed_count = 2
			 */
		})

		it.todo('annotates span with poll time', () => {
			/**
			 * GIVEN current time is 2025-10-18T10:00:00Z
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the span should be annotated with timer.poll_time = "2025-10-18T10:00:00.000Z"
			 */
		})

		it.todo('annotates per-timer span with context', () => {
			/**
			 * GIVEN a timer with tenantId, serviceCallId, correlationId, dueAt
			 * WHEN the timer is processed
			 * THEN the processTimerFiring span should be annotated with:
			 *   - timer.tenant_id
			 *   - timer.service_call_id
			 *   - timer.correlation_id
			 *   - timer.due_at
			 *   - timer.fired_at
			 */
		})
	})

	describe('Observability - Logging', () => {
		it.todo('logs debug message at start of poll cycle', () => {
			/**
			 * GIVEN workflow is about to execute
			 * WHEN pollDueTimersWorkflow starts
			 * THEN a debug log "Starting poll cycle" should be emitted
			 */
		})

		it.todo('logs info message at end of poll cycle with summary', () => {
			/**
			 * GIVEN workflow processes 3 timers (2 succeed, 1 fails)
			 * WHEN pollDueTimersWorkflow completes
			 * THEN an info log should be emitted with:
			 *   - message: "Poll cycle completed"
			 *   - dueCount: 3
			 *   - processed: 2
			 *   - failed: 1
			 */
		})

		it.todo('logs debug message when event is published', () => {
			/**
			 * GIVEN a timer is being processed
			 * WHEN the DueTimeReached event is published successfully
			 * THEN a debug log should be emitted
			 *   AND should include serviceCallId
			 */
		})

		it.todo('logs debug message when timer is marked as fired', () => {
			/**
			 * GIVEN a timer has been published
			 * WHEN persistence.markFired succeeds
			 * THEN a debug log should be emitted
			 *   AND should include serviceCallId
			 */
		})

		it.todo('logs error with context when timer processing fails', () => {
			/**
			 * GIVEN a timer fails during processing
			 * WHEN pollDueTimersWorkflow handles the error
			 * THEN an error log should be emitted with:
			 *   - message: "Timer processing failed - will retry next poll"
			 *   - serviceCallId
			 *   - tenantId
			 *   - error details
			 */
		})
	})

	describe('Sequential Processing', () => {
		it.todo('processes timers in sequential order (not concurrent)', () => {
			/**
			 * GIVEN three timers that are due
			 * WHEN pollDueTimersWorkflow executes
			 * THEN timer 1 should be fully processed before timer 2 starts
			 *   AND timer 2 should be fully processed before timer 3 starts
			 *   AND processing order should be deterministic
			 */
		})

		it.todo('ensures publish happens before markFired for each timer', () => {
			/**
			 * GIVEN multiple timers that are due
			 * WHEN processing each timer
			 * THEN for EACH timer: publish must complete before its markFired
			 *   AND timers should not interleave operations
			 */
		})
	})

	describe('Integration with Ports', () => {
		it.todo('uses ClockPort to get current time', () => {
			/**
			 * GIVEN workflow needs current time
			 * WHEN pollDueTimersWorkflow executes
			 * THEN it should call ClockPort.now()
			 *   AND use the returned DateTime.Utc for findDue and markFired
			 */
		})

		it.todo('uses TimerPersistencePort to find due timers', () => {
			/**
			 * GIVEN current time is now
			 * WHEN pollDueTimersWorkflow executes
			 * THEN it should call persistence.findDue(now)
			 *   AND process the returned Chunk of ScheduledTimers
			 */
		})

		it.todo('uses EventBusPort to publish events', () => {
			/**
			 * GIVEN a timer needs to fire
			 * WHEN processTimerFiring executes
			 * THEN it should call eventBus.publish(DueTimeReached)
			 *   AND the event should contain timer details
			 */
		})

		it.todo('uses TimerPersistencePort to mark timers as fired', () => {
			/**
			 * GIVEN an event was published successfully
			 * WHEN processTimerFiring continues
			 * THEN it should call persistence.markFired(tenantId, serviceCallId, firedAt)
			 */
		})
	})
})

describe('processTimerFiring', () => {
	describe('Happy Path', () => {
		it.todo('publishes event and marks timer as fired', () => {
			/**
			 * GIVEN a ScheduledTimer and a firedAt timestamp
			 * WHEN processTimerFiring executes
			 * THEN the DueTimeReached event should be published
			 *   AND the timer should be marked as Reached
			 *   AND both operations should succeed
			 */
		})

		it.todo('uses firedAt timestamp for both event and markFired', () => {
			/**
			 * GIVEN a timer and firedAt = 2025-10-18T10:00:00Z
			 * WHEN processTimerFiring executes
			 * THEN the DueTimeReached event should have reachedAt = firedAt
			 *   AND persistence.markFired should be called with reachedAt = firedAt
			 */
		})
	})

	describe('Error Handling', () => {
		it.todo('propagates PublishError when event publishing fails', () => {
			/**
			 * GIVEN eventBus.publish will fail with PublishError
			 * WHEN processTimerFiring executes
			 * THEN the workflow should fail with PublishError
			 *   AND markFired should NOT be called
			 */
		})

		it.todo('propagates PersistenceError when markFired fails', () => {
			/**
			 * GIVEN eventBus.publish succeeds
			 *   AND persistence.markFired will fail with PersistenceError
			 * WHEN processTimerFiring executes
			 * THEN the workflow should fail with PersistenceError
			 *   AND the event was already published (duplicate on retry)
			 */
		})
	})

	describe('Observability', () => {
		it.todo('annotates span with timer context', () => {
			/**
			 * GIVEN a timer with full context
			 * WHEN processTimerFiring executes
			 * THEN the span should be annotated with:
			 *   - timer.tenant_id
			 *   - timer.service_call_id
			 *   - timer.correlation_id (or null if None)
			 *   - timer.due_at (ISO8601)
			 *   - timer.fired_at (ISO8601)
			 */
		})

		it.todo('logs debug when event is published', () => {
			/**
			 * GIVEN processTimerFiring is executing
			 * WHEN eventBus.publish succeeds
			 * THEN a debug log should be emitted
			 *   AND should include serviceCallId
			 */
		})

		it.todo('logs debug when timer is marked as fired', () => {
			/**
			 * GIVEN processTimerFiring is executing
			 * WHEN persistence.markFired succeeds
			 * THEN a debug log should be emitted
			 *   AND should include serviceCallId
			 */
		})
	})
})
