import { assert, describe, expect, layer } from '@effect/vitest'
import * as Cause from 'effect/Cause'
import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as TestClock from 'effect/TestClock'

import { UUID7 } from '@event-service-agent/platform/uuid7'
import * as Messages from '@event-service-agent/schemas/messages'
import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Adapters from '../adapters/index.ts'
import * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'
import * as Workflows from './poll-due-timers.workflow.ts'

/**
 * Base test layers - static resources shared across most tests:
 * - ClockPortTest: TestClock for time manipulation
 * - UUID7.Default: Deterministic UUID generation
 * - TimerPersistence.inMemory: In-memory persistence adapter
 *
 * Tests add dynamic resources (custom EventBus mocks) via Layer.mergeAll
 */
const BaseTestLayers = Layer.mergeAll(Adapters.ClockPortTest, UUID7.Default, Adapters.TimerPersistence.inMemory)

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
layer(BaseTestLayers)('pollDueTimersWorkflow', it => {
	describe('Happy Path', () => {
		it.effect('processes due timers successfully', () => {
			// Mock EventBus to track published events
			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
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
				const clock = yield* Ports.ClockPort
				const now = yield* clock.now()

				// Timer will be due in 5 minutes
				const dueAt = DateTime.add(now, { minutes: 5 })

				const scheduledTimer = Domain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				}) // Get persistence and save timer

				const persistence = yield* Ports.TimerPersistencePort
				yield* persistence.save(scheduledTimer)

				// Verify timer is not due yet
				const notDueYet = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(notDueYet)).toBe(true)

				// Act: Advance time to make timer due (5 minutes + 1 second)
				yield* TestClock.adjust('6 minutes') // Execute workflow
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: Verify event was published
				expect(publishedEvents).toHaveLength(1)
				const event = publishedEvents[0]
				assert(event !== undefined)
				expect(event._tag).toBe(Messages.Timer.Events.DueTimeReached.Tag)
				expect(event.tenantId).toBe(tenantId)
				expect(event.serviceCallId).toBe(serviceCallId)
				expect(DateTime.Equivalence(event.reachedAt, DateTime.add(now, { minutes: 6 }))).toBe(true)

				// Assert: Verify timer was marked as Reached
				const found = yield* persistence.find(tenantId, serviceCallId)
				expect(Option.isSome(found)).toBe(true)

				const timer = Option.getOrThrow(found)
				expect(timer._tag).toBe('Reached')

				// Assert: Timer should no longer appear in findDue
				const afterFired = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(afterFired)).toBe(true)
			}).pipe(Effect.provide(TimerEventBusTest))
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
			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []

			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						operations.push(`publish:${event.serviceCallId}`)
						publishedEvents.push(event)
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
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				// Create and save timers using iteration
				const timers = serviceCallIds.map(serviceCallId =>
					Domain.ScheduledTimer.make({
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
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: All three events should be published
				expect(publishedEvents).toHaveLength(serviceCallIds.length)

				// Assert: All three timers should be marked as Reached using iteration
				yield* pipe(
					serviceCallIds,
					// biome-ignore lint/suspicious/useIterableCallbackReturn: Ensure proper iteration
					Effect.forEach(serviceCallId => persistence.find(tenantId, serviceCallId), { concurrency: 1 }),
					Effect.tap(foundTimers =>
						Effect.sync(() => {
							foundTimers.forEach(found => {
								expect(Option.isSome(found)).toBe(true)
								expect(found.pipe(Option.exists(Domain.TimerEntry.isReached))).toBe(true)
							})
						}),
					),
				) // Assert: No timers should remain in findDue
				const afterFired = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(afterFired)).toBe(true)

				// Assert: All operations should have occurred (3 publishes)
				expect(operations.filter(op => op.startsWith('publish:'))).toHaveLength(serviceCallIds.length)
			}).pipe(Effect.provide(TimerEventBusTest))
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

			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: timer =>
					Effect.sync(() => {
						operations.push(`publish:${timer.serviceCallId}`)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that will be due
				const clock = yield* Ports.ClockPort
				const basePersistence = yield* Ports.TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = Domain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				})

				yield* basePersistence.save(scheduledTimer)

				// Create wrapped persistence that tracks markFired calls
				const TestPersistence = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
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
				yield* Workflows.pollDueTimersWorkflow().pipe(Effect.provide(TestPersistence))

				// Assert: Should have exactly 2 operations
				expect(operations).toHaveLength(2)

				// Assert: publish should happen before markFired
				expect(operations[0]).toBe(`publish:${serviceCallId}`)
				expect(operations[1]).toBe(`markFired:${serviceCallId}`)
			}).pipe(Effect.provide(TimerEventBusTest))
		})

		/**
		 * TODO(PL-24): Re-enable correlationId propagation test
		 *
		 * This test is marked as .todo() because the workflow currently cannot
		 * pass correlationId from timer aggregate to published event (P0 CRITICAL).
		 *
		 * Current blocker: Port signature changed to `publishDueTimeReached(event)`
		 * where event is pure domain type (no correlationId). Workflow has no way
		 * to provision MessageMetadata Context with correlationId extracted from
		 * timer aggregate.
		 *
		 * Once PL-24 Phase 3 is complete, this test should:
		 * 1. Extract correlationId from timer aggregate: timer.correlationId
		 * 2. Wrap publishDueTimeReached with Effect.provideService(MessageMetadata, ...)
		 * 3. Verify adapter receives context and populates envelope.correlationId
		 * 4. Re-enable assertions at end (currently commented out)
		 *
		 * Test currently only verifies event was published (line 308), not that
		 * correlationId propagated correctly (lines 311-312 commented).
		 *
		 * See: docs/decisions/ADR-0013-correlation-propagation.md
		 * See: docs/plan/correlation-context-implementation.md (Phase 3: PL-24.7)
		 */
		it.todo('propagates correlationId from timer to event via MessageMetadata Context', () => {
			/**
			 * GIVEN a timer with a correlationId
			 * WHEN pollDueTimersWorkflow executes with MessageMetadata Context provisioning
			 * THEN the published DueTimeReached event should include the correlationId
			 *   AND the correlationId should match the timer's correlationId
			 */

			let publishedEvent: Messages.Timer.Events.DueTimeReached.Type | undefined

			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvent = event
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()
				const correlationId = yield* CorrelationId.makeUUID7()

				// Arrange: Create a timer with a specific correlationId
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = Domain.ScheduledTimer.make({
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
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: Timer should have been published
				expect(publishedEvent).toBeDefined()
				if (!publishedEvent) throw new Error('Timer was not published')

				// TODO(PL-24.7): Re-enable after implementing MessageMetadata Context provisioning
				// Assert: Published timer should have the same correlationId
				// expect(Option.isSome(publishedEvent.correlationId)).toBe(true)
				// expect(Option.getOrThrow(publishedEvent.correlationId)).toBe(correlationId)
			}).pipe(Effect.provide(TimerEventBusTest))
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

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that is NOT due yet (future)
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const now = yield* clock.now()

				// Timer due in 10 minutes (well into the future)
				const dueAt = DateTime.add(now, { minutes: 10 })

				const scheduledTimer = Domain.ScheduledTimer.make({
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
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: No events should be published
				expect(publishedEvents).toHaveLength(0)

				// Assert: Timer should still be in Scheduled state (not processed)
				const found = yield* persistence.find(tenantId, serviceCallId)
				expect(Option.isSome(found)).toBe(true)
				expect(Option.exists(found, Domain.TimerEntry.isScheduled)).toBe(true)

				// Assert: Workflow completed successfully (no errors)
				// (implicit - if we reach here, no exceptions were thrown)
			}).pipe(Effect.provide(TimerEventBusTest))
		})

		it.effect('completes successfully when persistence is empty', () => {
			/**
			 * GIVEN persistence has no timers at all
			 * WHEN pollDueTimersWorkflow executes
			 * THEN findDue should return empty Chunk
			 *   AND workflow should complete successfully
			 */

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			return Effect.gen(function* () {
				// Arrange: Start with empty persistence (no timers saved)
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort

				// Verify persistence is empty
				const noDueTimers = yield* persistence.findDue(yield* clock.now())
				expect(Chunk.isEmpty(noDueTimers)).toBe(true)

				// Act: Execute workflow (should find nothing)
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: No events published
				expect(publishedEvents).toHaveLength(0)

				// Assert: Workflow completed successfully
				// (implicit - if we reach here, no exceptions were thrown)
			}).pipe(Effect.provide(TimerEventBusTest))
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

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()
				// Arrange: Create a timer where dueAt === now (boundary condition)
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const now = yield* clock.now()

				// Timer is due right now (no offset)
				const scheduledTimer = Domain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt: now,
					registeredAt: now,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Execute workflow (timer should be due)
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: Event should be published (timer is due)
				expect(publishedEvents).toHaveLength(1)

				// Assert: Timer should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isReached)).toBe(true)
						}),
					),
				)
			}).pipe(Effect.provide(TimerEventBusTest))
		})

		it.effect('does not process timer scheduled in the future', () => {
			/**
			 * GIVEN a timer with dueAt > now (future timer)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the timer should NOT be included in due timers
			 *   AND should NOT be processed
			 */

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer due in the future
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const now = yield* clock.now()

				// Timer due 1 second in the future
				const dueAt = DateTime.add(now, { seconds: 1 })

				const scheduledTimer = Domain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Execute workflow (timer should NOT be due yet)
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: No events should be published
				expect(publishedEvents).toHaveLength(0)

				// Assert: Timer should still be in Scheduled state
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isScheduled)).toBe(true)
						}),
					),
				)
			}).pipe(Effect.provide(TimerEventBusTest))
		})

		it.effect('processes timer that is overdue', () => {
			/**
			 * GIVEN a timer scheduled for 5 minutes from now
			 *   AND time advances 15 minutes (timer is 10 minutes overdue)
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the timer should be included in due timers
			 *   AND should be processed successfully
			 */

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Schedule a timer for 5 minutes from now
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const registeredAt = yield* clock.now()

				// Timer due in 5 minutes
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = Domain.ScheduledTimer.make({
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
				yield* Workflows.pollDueTimersWorkflow()

				// Assert: Event should be published (timer is overdue)
				expect(publishedEvents).toHaveLength(1)

				// Assert: Timer should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isReached)).toBe(true)
						}),
					),
				)
			}).pipe(
				Effect.provide(
					Layer.mergeAll(Adapters.TimerPersistence.inMemory, Adapters.ClockPortTest, TimerEventBusTest, UUID7.Default),
				),
			)
		})
	})

	describe('Error Handling - Publish Failures', () => {
		it.effect.fails('propagates batch failure when publish fails', () => {
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: () => Effect.fail(new Ports.PublishError({ cause: 'Event bus publish failed' })),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that will be due
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = Domain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(scheduledTimer)

				// Act: Advance time to make timer due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow with TimerEventBusTest - should fail with BatchProcessingError
				yield* Workflows.pollDueTimersWorkflow()
			}).pipe(Effect.provide(TimerEventBusTest))
		})

		it.effect('propagates batch failure when some timers fail', () => {
			/**
			 * GIVEN three timers that are due
			 *   AND the second timer's publish will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN timer 1 should be processed successfully
			 *   AND timer 2 publish should fail (timer stays Scheduled)
			 *   AND timer 3 should still be processed successfully
			 *   AND workflow should fail with BatchProcessingError
			 *   AND BatchProcessingError should show 1 failure out of 3 total
			 *
			 * Strategy: Use Effect.partition for error accumulation
			 * - Process all timers regardless of individual failures
			 * - Collect failures separately from successes
			 * - Workflow fails with BatchProcessingError containing failure details
			 * - Failed timers remain Scheduled for retry on next poll
			 */

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			let callCount = 0

			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event => {
					callCount++
					// Fail on second timer (callCount === 2)
					if (callCount === 2) {
						return Effect.fail(new Ports.PublishError({ cause: 'Event bus publish failed' }))
					}
					return Effect.sync(() => {
						publishedEvents.push(event)
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
				const clock = yield* Ports.ClockPort
				const persistence = yield* Ports.TimerPersistencePort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const timers = serviceCallIds.map(serviceCallId =>
					Domain.ScheduledTimer.make({
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

				// Execute workflow (should fail with BatchProcessingError)
				const result = yield* Effect.exit(Workflows.pollDueTimersWorkflow())

				// Assert: Workflow should fail
				expect(Exit.isFailure(result)).toBe(true)

				// Assert: Should fail with BatchProcessingError
				if (Exit.isFailure(result)) {
					const error = Cause.failureOption(result.cause)
					expect(Option.isSome(error)).toBe(true)
					if (Option.isSome(error)) {
						const batchError = error.value as Workflows.BatchProcessingError
						expect(batchError._tag).toBe('BatchProcessingError')
						expect(batchError.failedCount).toBe(1)
						expect(batchError.totalCount).toBe(3)
					}
				}

				// Assert: Two events should be published (timers 1 and 3)
				expect(publishedEvents).toHaveLength(2) // Assert: Timer 1 should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId1),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isReached)).toBe(true)
						}),
					),
				)
				// Assert: Timer 2 should still be Scheduled (publish failed)
				yield* pipe(
					persistence.find(tenantId, serviceCallId2),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isScheduled)).toBe(true)
						}),
					),
				)
				// Assert: Timer 3 should be marked as Reached
				yield* pipe(
					persistence.find(tenantId, serviceCallId3),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isReached)).toBe(true)
						}),
					),
				)

				// End of test case
			}).pipe(
				Effect.provide(
					Layer.mergeAll(Adapters.TimerPersistence.inMemory, Adapters.ClockPortTest, TimerEventBusTest, UUID7.Default),
				),
			)
		})
	})

	describe('Error Handling - Persistence Failures', () => {
		it.effect('propagates batch failure when markFired fails', () => {
			/**
			 * GIVEN a timer that is due
			 *   AND eventBus.publish succeeds
			 *   AND persistence.markFired will fail
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the event should be published (duplicate on next poll)
			 *   AND markFired failure should be collected
			 *   AND the timer should remain in Scheduled state
			 *   AND the workflow should fail with BatchProcessingError
			 *
			 * Strategy: Effect.partition collects failures, workflow propagates to error channel
			 * Note: Event is published but timer stays Scheduled (Orchestration handles duplicate via state guard)
			 */

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			return Effect.gen(function* () {
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Arrange: Create a timer that will be due
				const clock = yield* Ports.ClockPort
				const registeredAt = yield* clock.now()
				const dueAt = DateTime.add(registeredAt, { minutes: 5 })

				const scheduledTimer = Domain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt,
					registeredAt,
					serviceCallId,
					tenantId,
				}) // Use base persistence for save, then provide a mock that fails markFired
				const basePersistence = yield* Ports.TimerPersistencePort
				yield* basePersistence.save(scheduledTimer)

				// Create test layer with failing markFired
				const TimerPersistenceTest = Layer.succeed(
					Ports.TimerPersistencePort,
					Ports.TimerPersistencePort.of({
						...basePersistence,
						markFired: () =>
							Effect.fail(new Ports.PersistenceError({ cause: 'Database connection lost', operation: 'markFired' })),
					}),
				)

				// Act: Advance time to make timer due
				yield* TestClock.adjust('6 minutes')

				// Execute workflow with failing markFired - should fail with BatchProcessingError
				const result = yield* Effect.exit(Workflows.pollDueTimersWorkflow().pipe(Effect.provide(TimerPersistenceTest)))

				// Assert: Workflow should fail
				expect(Exit.isFailure(result)).toBe(true)

				// Assert: Should fail with BatchProcessingError
				if (Exit.isFailure(result)) {
					const error = Cause.failureOption(result.cause)
					expect(Option.isSome(error)).toBe(true)
					if (Option.isSome(error)) {
						const batchError = error.value as Workflows.BatchProcessingError
						expect(batchError._tag).toBe('BatchProcessingError')
						expect(batchError.failedCount).toBe(1)
						expect(batchError.totalCount).toBe(1)
					}
				}

				// Assert: Event should have been published (will be duplicate on retry)
				expect(publishedEvents).toHaveLength(1) // Assert: Timer should still be in Scheduled state (markFired failed but collected)
				yield* pipe(
					basePersistence.find(tenantId, serviceCallId),
					Effect.tap(found =>
						Effect.sync(() => {
							expect(Option.isSome(found)).toBe(true)
							expect(Option.exists(found, Domain.TimerEntry.isScheduled)).toBe(true)
						}),
					),
				)
			}).pipe(
				Effect.provide(
					Layer.mergeAll(Adapters.TimerPersistence.inMemory, Adapters.ClockPortTest, TimerEventBusTest, UUID7.Default),
				),
			)
		})
	})

	describe('Error Handling - Query Failures', () => {
		it.effect('propagates error when findDue fails', () => {
			/**
			 * GIVEN persistence.findDue will fail with PersistenceError
			 * WHEN pollDueTimersWorkflow executes
			 * THEN the workflow should fail with PersistenceError
			 *   AND no events should be published
			 *   AND no timers should be marked
			 */

			const publishedEvents: Messages.Timer.Events.DueTimeReached.Type[] = []
			const TimerEventBusTest = Layer.mock(Ports.TimerEventBusPort, {
				publishDueTimeReached: event =>
					Effect.sync(() => {
						publishedEvents.push(event)
					}),
			})

			const TestPersistence = Layer.mock(Ports.TimerPersistencePort, {
				findDue: () =>
					Effect.fail(new Ports.PersistenceError({ cause: 'Database connection failed', operation: 'findDue' })),
			})

			return Effect.gen(function* () {
				// Act: Execute workflow with failing findDue
				const result = yield* Effect.exit(Workflows.pollDueTimersWorkflow())

				// Assert: Workflow should have failed with PersistenceError
				expect(Exit.isFailure(result)).toBe(true)
				if (Exit.isFailure(result)) {
					const failure = Cause.failureOption(result.cause)
					expect(Option.isSome(failure)).toBe(true)
					if (Option.isSome(failure)) {
						const error = failure.value as Ports.PersistenceError
						expect(error).toBeInstanceOf(Ports.PersistenceError)
						expect(error.operation).toBe('findDue')
						expect(error.cause).toBe('Database connection failed')
					}
				}

				// Assert: No events should have been published
				expect(publishedEvents).toHaveLength(0)
			}).pipe(Effect.provide(Layer.mergeAll(TestPersistence, Adapters.ClockPortTest, TimerEventBusTest, UUID7.Default)))
		})
	})
})
