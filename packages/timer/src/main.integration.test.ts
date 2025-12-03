import { describe, expect, it } from '@effect/vitest'
import * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import type { DurationInput } from 'effect/Duration'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as TestClock from 'effect/TestClock'

import { SQL } from '@event-service-agent/platform/database'
import type { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import { ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Adapters from './adapters/index.ts'
import { TimerDomain } from './domain/index.ts'
import { _main } from './main.ts'
import * as Ports from './ports/index.ts'
import { withServiceCall } from './test/service-call.fixture.ts'

/**
 * Integration tests for Timer.main entry point
 *
 * These tests exercise the full Timer module lifecycle:
 * - Command subscription (ScheduleTimer → persistence)
 * - Polling worker (due timer detection → DueTimeReached events)
 * - Concurrent execution (both loops running together)
 * - Graceful shutdown (scope closure → fiber interruption)
 *
 * **Test strategy**:
 * - Use TestClock for deterministic time control
 * - Mock Platform.EventBusPort at infrastructure layer
 * - Use SQL.Test for isolated in-memory database per test
 * - Capture published events and subscription callbacks for assertions
 *
 * **Layer composition pattern** (matches timer-event-bus.adapter.test.ts):
 * - BaseTestLayers: static resources shared across tests
 * - Mock Platform.EventBusPort per test for capturing events/commands
 * - Compose TimerEventBus.Live on top of mocked EventBusPort
 *
 * **Scope**: Integration tests, not unit tests. Tests verify:
 * - Components work together correctly
 * - Data flows through the full pipeline
 * - Fiber lifecycle and cleanup work as expected
 *
 * @see main.ts — Entry point implementation
 * @see polling.worker.test.ts — PollingWorker unit tests
 * @see schedule-timer.workflow.test.ts — Workflow unit tests
 */

describe('Timer.main', () => {
	// ═══════════════════════════════════════════════════════════════════════
	// TEST INFRASTRUCTURE
	// ═══════════════════════════════════════════════════════════════════════
	/**
	 * Layer providing both EventBusPort (mock) and TestEventCapture.
	 *
	 * - EventBusPort.publish: appends events to internal Ref
	 * - EventBusPort.subscribe: returns Effect.never (no commands delivered)
	 * - TestEventCapture: exposes the Ref for test assertions
	 */
	const EventBusTest: Layer.Layer<Ports.Platform.EventBusPort | TestEventCapture> = Layer.unwrapEffect(
		Effect.gen(function* () {
			const ref = yield* Ref.make(Chunk.empty<MessageEnvelope.Type>())

			const EventBusMock = Layer.mock(Ports.Platform.EventBusPort, {
				publish: (events) => Ref.update(ref, (existing) => Chunk.appendAll(existing, Chunk.fromIterable(events))),
				subscribe: () => Effect.never,
			})

			const TestEventCaptureLayer = Layer.succeed(TestEventCapture, ref)

			return Layer.merge(EventBusMock, TestEventCaptureLayer)
		}),
	)

	/**
	 * Test-only service for capturing published events.
	 *
	 * Provides access to the internal Ref used by the mocked EventBusPort,
	 * enabling test assertions on published messages.
	 */
	class TestEventCapture extends Context.Tag('TestEventCapture')<
		TestEventCapture,
		Ref.Ref<Chunk.Chunk<MessageEnvelope.Type>>
	>() {}

	const TestHarness = {
		Layer: Adapters.TimerEventBus.Live.pipe(
			Layer.provideMerge(EventBusTest),
			Layer.provideMerge(Adapters.TimerPersistence.Test),
			Layer.provideMerge(Adapters.Clock.Test),
			Layer.provideMerge(Adapters.Platform.UUID7.Sequence()),
			Layer.provideMerge(SQL.Test),
		),
	} as const

	// ═══════════════════════════════════════════════════════════════════════
	// TEST DSL (shared across all tests in this describe block)
	// ═══════════════════════════════════════════════════════════════════════

	/**
	 * Time control DSL - wraps TestClock with domain-meaningful names
	 */
	const Time = {
		/**
		 * Advance virtual clock and yield to allow fibers to execute
		 */
		advance: (duration: DurationInput) =>
			pipe(
				duration,
				TestClock.adjust,
				Effect.andThen(() => Effect.yieldNow()),
			),

		/**
		 * Get current virtual time
		 */
		now: pipe(
			Ports.ClockPort,
			Effect.flatMap((clock) => clock.now()),
		),
	} as const

	/**
	 * Event capture DSL - query published events
	 */
	const Events = {
		/**
		 * Get all published events
		 */
		all: pipe(TestEventCapture, Effect.flatMap(Ref.get)),

		/**
		 * Get event at specific index
		 */
		at: <Idx extends number>(index: Idx) =>
			pipe(TestEventCapture, Effect.flatMap(Ref.get), Effect.flatMap(Chunk.get(index))),

		/**
		 * Get count of published events
		 */
		count: pipe(TestEventCapture, Effect.flatMap(Ref.get), Effect.map(Chunk.size)),
	} as const

	/**
	 * Timer state DSL - query and create timers
	 */
	const Timers = {
		/**
		 * Get all currently due timers
		 */
		due: pipe(
			Effect.all([Ports.TimerPersistencePort, Ports.ClockPort]),
			Effect.flatMap(([persistence, clock]) => clock.now().pipe(Effect.flatMap(persistence.findDue))),
		),

		/**
		 * Find timer by key (any state)
		 */
		find: ({ serviceCallId, tenantId }: TimerDomain.TimerEntry.Type) =>
			pipe(
				Ports.TimerPersistencePort,
				Effect.flatMap((timerPersistence) => timerPersistence.find({ serviceCallId, tenantId })),
			),

		/**
		 * Schedule a timer at given duration from now.
		 * Creates service call fixture and persists timer.
		 */
		scheduleAt: (dueIn: DurationInput) =>
			Effect.gen(function* () {
				const now = yield* Time.now
				const persistence = yield* Ports.TimerPersistencePort

				const scheduledTimer = TimerDomain.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt: DateTime.addDuration(now, dueIn),
					registeredAt: now,
					serviceCallId: yield* ServiceCallId.makeUUID7(),
					tenantId: yield* TenantId.makeUUID7(),
				})

				yield* withServiceCall({
					serviceCallId: scheduledTimer.serviceCallId,
					tenantId: scheduledTimer.tenantId,
				})

				yield* persistence.save(scheduledTimer)

				return scheduledTimer
			}),
	} as const

	/**
	 * Assertion DSL - domain-focused expectations
	 *
	 * Two-phase design:
	 * - `Expect.event.*` — EventBus assertions (published events)
	 * - `Expect.timer(t)` — Database assertions (persisted state)
	 */
	const Expect = (() => {
		// TODO: move stuff here and just return the object?

		return {
			/**
			 * Event assertions namespace - all EventBus-related checks
			 */
			event: {
				/**
				 * Start assertion chain at specific event index (no count check)
				 */
				atIndex: (position: number) => Expect.event.toHaveCount(position + 1).atIndex(position),
				/**
				 * Assert no events were published
				 */
				toBeEmpty: () => Expect.event.toHaveCount(0),
				/**
				 * Assert exact number of events were published.
				 * Returns a builder that can chain to atIndex or verify directly.
				 */
				toHaveCount: (expected: number) => {
					type AssertionFn = (ctx: string) => Effect.Effect<void, any, TestEventCapture>

					const countAssertion: AssertionFn = (ctx) =>
						pipe(
							Events.count,
							Effect.tap((actual) => expect(actual, `${ctx}: expected ${expected} event(s) published`).toBe(expected)),
						)

					const createIndexBuilder = (assertions: AssertionFn[], position: number) => ({
						/**
						 * Assert event is for the given timer (serviceCallId matches)
						 */
						toBeForTimer: (timer: TimerDomain.ScheduledTimer) =>
							createIndexBuilder(
								[
									...assertions,
									(ctx) =>
										pipe(
											Events.at(position),
											Effect.tap((event) => {
												expect(event.payload.serviceCallId, `${ctx}: event[${position}].serviceCallId`).toBe(
													timer.serviceCallId,
												)
											}),
										),
								],
								position,
							),

						/**
						 * Assert event has the given tenantId
						 */
						toHaveTenant: (tenantId: TenantId.Type) =>
							createIndexBuilder(
								[
									...assertions,
									(ctx) =>
										pipe(
											Events.at(position),
											Effect.tap((event) => {
												expect(event.tenantId, `${ctx}: event[${position}].tenantId`).toBe(tenantId)
											}),
										),
								],
								position,
							),

						/**
						 * Assert event has the given type
						 */
						toHaveType: (type: MessageEnvelope.Type['type']) =>
							createIndexBuilder(
								[
									...assertions,
									(ctx) =>
										pipe(
											Events.at(position),
											Effect.tap((event) => {
												expect(event.type, `${ctx}: event[${position}].type`).toBe(type)
											}),
										),
								],
								position,
							),

						/**
						 * Execute all chained assertions with the given context
						 */
						verify: (context: string) =>
							Effect.all(
								assertions.map((fn) => fn(context)),
								{ discard: true },
							),
					})

					return {
						/**
						 * Continue to assert on event at specific index
						 */
						atIndex: (position: number) => createIndexBuilder([countAssertion], position),

						/**
						 * Execute count assertion only
						 */
						verify: (context: string) => countAssertion(context),
					}
				},
			},
			/**
			 * Assert no timers are currently due
			 */ noTimersDue: (context: string) =>
				pipe(
					Timers.due,
					Effect.tap((due) => expect(Chunk.isEmpty(due), `${context}: no timers should be due`).toBe(true)),
				),

			/**
			 * Timer assertion builder - chainable API for Database assertions.
			 */
			timer: (timer: TimerDomain.ScheduledTimer) => {
				type AssertionFn = (ctx: string) => Effect.Effect<void, any, Ports.TimerPersistencePort>

				const createBuilder = (assertions: AssertionFn[]) => ({
					/**
					 * Assert timer has transitioned to Reached state in persistence
					 */
					toBeReached: () =>
						createBuilder([
							...assertions,
							(ctx) =>
								pipe(
									Timers.find(timer),
									Effect.tap((found) => {
										expect(Option.isSome(found), `${ctx}: timer should exist in DB`).toBe(true)
										expect(found.pipe(Option.map((t) => t._tag)), `${ctx}: timer._tag`).toEqual(Option.some('Reached'))
									}),
								),
						]),

					/**
					 * Assert timer is still in Scheduled state
					 */
					toBeScheduled: () =>
						createBuilder([
							...assertions,
							(ctx) =>
								pipe(
									Timers.find(timer),
									Effect.tap((found) => {
										expect(Option.isSome(found), `${ctx}: timer should exist in DB`).toBe(true)
										expect(found.pipe(Option.map((t) => t._tag)), `${ctx}: timer._tag`).toEqual(
											Option.some('Scheduled'),
										)
									}),
								),
						]),

					/**
					 * Execute all chained assertions with the given context
					 */
					verify: (context: string) =>
						Effect.all(
							assertions.map((fn) => fn(context)),
							{ discard: true },
						),
				})

				return createBuilder([])
			},
		} as const
	})()

	describe('Happy Path', () => {
		describe('Command Subscription', () => {
			it.todo(
				'should persist timer when ScheduleTimer command is received',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND EventBusPort mock delivers ScheduleTimer command
				 * WHEN the command handler processes the command
				 * THEN TimerEntry should be persisted via TimerPersistencePort
				 *   AND timer state should be Scheduled
				 * ```
				 */
			)

			it.todo(
				'should propagate MessageMetadata (correlationId, causationId) to workflow',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND ScheduleTimer command has correlationId in envelope
				 * WHEN the command handler processes the command
				 * THEN MessageMetadata context should contain correlationId
				 *   AND persisted timer should include correlationId
				 * ```
				 */
			)

			it.todo(
				'should publish ServiceCallScheduled event after successful persistence',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND ScheduleTimer command is received
				 * WHEN persistence succeeds
				 * THEN ServiceCallScheduled event should be published via EventBusPort
				 *   AND event should contain correct tenantId, serviceCallId, dueAt
				 * ```
				 */
			)
		})

		describe('Polling Worker', (): void => {
			it.scoped(
				'should detect due timers and publish DueTimeReached events',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND a timer with dueAt in the past exists in persistence
				 * WHEN TestClock advances past dueAt
				 * THEN DueTimeReached event should be published via EventBusPort
				 *   AND event should contain correct tenantId, serviceCallId, reachedAt
				 * ```
				 */

				() =>
					Effect.gen(function* () {
						// ─── Arrange ────────────────────────────────────────────────────────
						const timerA = yield* Timers.scheduleAt('5 minutes')
						const timerB = yield* Timers.scheduleAt('6 minutes')
						const timerC = yield* Timers.scheduleAt('7 minutes')

						// ─── Baseline ───────────────────────────────────────────────────────
						yield* Expect.noTimersDue('Baseline')
						yield* Expect.event.toBeEmpty().verify('Baseline')

						// ─── Act: Start Timer.main ──────────────────────────────────────────
						const fiber = yield* Effect.fork(_main)
						yield* Effect.yieldNow()

						yield* Expect.event.toBeEmpty().verify('After fork (no time passed)')

						// ─── Timer A fires at t=5:01 ────────────────────────────────────────
						yield* Time.advance(Duration.sum('5 minutes', '1 seconds'))

						yield* Expect.event
							.toHaveCount(1)
							.atIndex(0)
							.toBeForTimer(timerA)
							.toHaveType('DueTimeReached')
							.toHaveTenant(timerA.tenantId)
							.verify('At t=5:01')
						yield* Expect.timer(timerA).toBeReached().verify('At t=5:01')

						// ─── Timer B fires at t=6:01 ────────────────────────────────────────
						yield* Time.advance('1 minute')

						yield* Expect.event
							.toHaveCount(2)
							.atIndex(1)
							.toBeForTimer(timerB)
							.toHaveType('DueTimeReached')
							.toHaveTenant(timerB.tenantId)
							.verify('At t=6:01')
						yield* Expect.timer(timerB).toBeReached().verify('At t=6:01')

						// ─── Timer C fires at t=7:01 ────────────────────────────────────────
						yield* Time.advance('1 minute')

						yield* Expect.event
							.toHaveCount(3)
							.atIndex(2)
							.toBeForTimer(timerC)
							.toHaveType('DueTimeReached')
							.toHaveTenant(timerC.tenantId)
							.verify('At t=7:01')
						yield* Expect.timer(timerC).toBeReached().verify('At t=7:01')

						// ─── Final ──────────────────────────────────────────────────────────
						yield* Expect.noTimersDue('Final')

						// ─── Cleanup ────────────────────────────────────────────────────────
						yield* Fiber.interrupt(fiber)
					}).pipe(Effect.provide(TestHarness.Layer)),
			)

			it.todo(
				'should mark timers as fired after successful event publishing',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND a due timer exists in persistence
				 * WHEN polling workflow processes the timer
				 * THEN timer state should transition from Scheduled to Reached
				 *   AND timer should not be returned in subsequent findDue queries
				 * ```
				 */
			)

			it.todo(
				'should poll on 5-second intervals',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 * WHEN TestClock advances by 15 seconds
				 * THEN findDue should be called 4 times (at 0s, 5s, 10s, 15s)
				 * ```
				 */
			)
		})

		describe('End-to-End Flow', () => {
			it.todo(
				'should complete full lifecycle: schedule → poll → fire',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND EventBusPort mock delivers ScheduleTimer command with dueAt = now + 5 minutes
				 * WHEN command is processed
				 *   AND TestClock advances by 6 minutes (past dueAt + one poll cycle)
				 * THEN timer should be persisted as Scheduled
				 *   AND DueTimeReached event should be published
				 *   AND timer should be marked as Reached
				 * ```
				 */
			)

			it.todo(
				'should handle multiple timers with different due times',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND three timers scheduled: dueAt = 2min, 4min, 6min
				 * WHEN TestClock advances incrementally
				 * THEN timers should fire in order as their dueAt is reached
				 *   AND each timer should only fire once
				 * ```
				 */
			)
		})
	})

	describe('Error Handling', () => {
		describe('Command Subscription Retry', () => {
			it.todo(
				'should retry with exponential backoff on transient PersistenceError',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND TimerPersistencePort.save fails on first 2 attempts
				 * WHEN ScheduleTimer command is processed
				 * THEN workflow should retry with exponential backoff (100ms, 200ms)
				 *   AND third attempt should succeed
				 *   AND timer should be persisted
				 * ```
				 */
			)

			it.todo(
				'should propagate error to broker after 3 retry attempts exhausted',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND TimerPersistencePort.save always fails
				 * WHEN ScheduleTimer command is processed
				 * THEN workflow should retry 3 times (100ms, 200ms, 400ms)
				 *   AND after 3 failures, error should propagate
				 *   AND broker should receive nack for message redelivery
				 * ```
				 */
			)
		})

		describe('Polling Worker Recovery', () => {
			it.todo(
				'should recover from BatchProcessingError and continue polling',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND first poll fails with BatchProcessingError (e.g., publish failure)
				 * WHEN TestClock advances by 10 seconds
				 * THEN second poll should execute successfully
				 *   AND polling should continue on schedule
				 * ```
				 */
			)

			it.todo(
				'should recover from PersistenceError and continue polling',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND first findDue call fails with PersistenceError
				 * WHEN TestClock advances by 10 seconds
				 * THEN second poll should execute successfully
				 *   AND polling should continue on schedule
				 * ```
				 */
			)
		})
	})

	describe('Multi-Tenancy', () => {
		it.todo(
			'should isolate timers by tenantId (no cross-tenant leakage)',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 *   AND tenant-A has a due timer
			 *   AND tenant-B has a due timer
			 * WHEN polling executes
			 * THEN published events should have correct tenantId
			 *   AND each event should only contain data for its tenant
			 * ```
			 */
		)

		it.todo(
			'should process timers for multiple tenants in single poll cycle',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 *   AND tenant-A and tenant-B both have due timers
			 * WHEN single poll cycle executes
			 * THEN both DueTimeReached events should be published
			 *   AND both timers should be marked as Reached
			 * ```
			 */
		)
	})

	describe('Fiber Lifecycle', () => {
		describe('Startup', () => {
			it.todo(
				'should fork polling worker before blocking on command subscription',
				/**
				 * ```txt
				 * GIVEN Timer.main is started
				 * WHEN Effect.forkScoped(PollingWorker.run) executes
				 * THEN polling fiber should be forked immediately
				 *   AND main fiber should proceed to command subscription
				 * ```
				 */
			)

			it.todo(
				'should start polling immediately (first poll at t=0)',
				/**
				 * ```txt
				 * GIVEN Timer.main is started
				 *   AND a due timer exists in persistence
				 * WHEN Timer.main begins (before any TestClock.adjust)
				 * THEN first poll should execute immediately
				 *   AND due timer should be processed
				 * ```
				 */
			)
		})

		describe('Graceful Shutdown', () => {
			it.todo(
				'should interrupt polling fiber when scope closes',
				/**
				 * ```txt
				 * GIVEN Timer.main is running within Effect.scoped
				 * WHEN scope closes (e.g., Scope.close or fiber interruption)
				 * THEN polling worker fiber should be interrupted
				 *   AND no new poll cycles should start
				 * ```
				 */
			)

			it.todo(
				'should complete in-flight command processing before shutdown',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND command handler is mid-execution
				 * WHEN graceful shutdown is initiated
				 * THEN current command should complete (uninterruptible critical section)
				 *   AND no new commands should be accepted
				 * ```
				 */
			)

			it.todo(
				'should not start new poll cycles after interruption signal',
				/**
				 * ```txt
				 * GIVEN Timer.main is running
				 *   AND polling has executed N cycles
				 * WHEN interruption signal is received
				 * THEN current poll may complete
				 *   AND no additional poll cycles should start
				 * ```
				 */
			)
		})

		describe('Scope Semantics', () => {
			it.todo(
				'should tie polling fiber lifetime to local scope (forkScoped)',
				/**
				 * ```txt
				 * GIVEN Timer.main uses Effect.forkScoped for polling
				 * WHEN main fiber terminates (success, failure, or interruption)
				 * THEN polling fiber should be automatically interrupted
				 *   AND polling fiber should NOT outlive main fiber
				 * ```
				 */
			)

			it.todo(
				'should clean up resources when main fiber terminates',
				/**
				 * ```txt
				 * GIVEN Timer.main is running with active fibers
				 * WHEN main fiber terminates
				 * THEN all child fibers should be cleaned up
				 *   AND no resource leaks (open connections, pending timers)
				 * ```
				 */
			)
		})
	})

	describe('Concurrency', () => {
		it.todo(
			'should run command subscription and polling concurrently',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 * WHEN command is received
			 *   AND poll cycle is in progress
			 * THEN both operations should proceed independently
			 *   AND neither should block the other
			 * ```
			 */
		)

		it.todo(
			'should not block command processing during poll execution',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 *   AND poll cycle is processing multiple timers
			 * WHEN new ScheduleTimer command arrives
			 * THEN command should be processed immediately
			 *   AND command should not wait for poll to complete
			 * ```
			 */
		)

		it.todo(
			'should handle concurrent ScheduleTimer commands for same serviceCallId (idempotency)',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 * WHEN two ScheduleTimer commands for same (tenantId, serviceCallId) arrive concurrently
			 * THEN both should succeed (persistence handles upsert)
			 *   AND only one timer entry should exist after processing
			 *   AND no constraint violation errors
			 * ```
			 */
		)
	})
})
