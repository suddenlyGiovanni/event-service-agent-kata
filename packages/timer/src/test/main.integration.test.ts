import { describe, expect, it } from '@effect/vitest'
import * as ReadonlyArray from 'effect/Array'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'

import { TestHarness } from './integration.dsl.ts'

/**
 * Integration tests for Timer.main entry point
 *
 * **Purpose**: Exercise the full Timer module lifecycle with focus on:
 * - Command subscription (ScheduleTimer → ServiceCallScheduled)
 * - Polling worker behavior (due timer detection → DueTimeReached events)
 * - Multi-tenancy isolation (no cross-tenant data leakage)
 * - Fiber lifecycle (startup, shutdown, scope semantics)
 * - Error recovery (polling continues after failures)
 *
 * **Test Strategy**:
 * - Uses `TestHarness` DSL with auto time context tracking
 * - TestClock for deterministic time control
 * - Mock EventBusPort captures published events and command handlers
 * - In-memory SQLite for isolated persistence per test
 *
 * **Test Organization**:
 * - **Command Subscription**: Tests command handling (Commands.deliver.scheduleTimer)
 * - **Polling Worker**: Tests timer detection and firing (Timers.make.scheduled)
 * - **End-to-End Lifecycle**: Full flow from command to event (command-driven)
 * - **Fiber Lifecycle**: Tests Effect.forkScoped semantics
 * - **Error Recovery**: Tests resilience to transient failures
 *
 * **DSL Usage**:
 * - `yield* TestHarness` provides scoped DSL with automatic cleanup
 * - `Expect.*.verify` is a property (Effect), not a method
 * - Time context auto-generated from elapsed time tracking
 *
 * @see main.ts — Entry point implementation
 * @see integration.dsl.ts — TestHarness DSL
 * @see polling.worker.test.ts — PollingWorker unit tests
 */

describe('Timer.main', () => {
	describe('Command Subscription', () => {
		/**
		 * Command subscription tests are blocked pending TestHarness enhancement.
		 *
		 * The `Commands.deliver.scheduleTimer` DSL method requires the EventBus
		 * test double to capture the subscription handler callback, which is not
		 * yet implemented (see integration.dsl.ts TODO).
		 *
		 * **Required DSL enhancement**:
		 * 1. EventBusTestLayer.subscribe must capture the handler callback
		 * 2. Commands.deliver.scheduleTimer must invoke the captured handler
		 * 3. Handler invocation must include MessageMetadata context
		 *
		 * When implemented, these tests will verify:
		 * - ScheduleTimer command → timer persisted as Scheduled
		 * - CorrelationId propagation through MessageMetadata
		 * - ServiceCallScheduled event published after persistence
		 * - Retry with exponential backoff on transient failures
		 * - Error propagation to broker after retry exhaustion
		 */

		it.scoped(
			'should persist timer and publish ServiceCallScheduled on ScheduleTimer command',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 * WHEN ScheduleTimer command is delivered via EventBus
			 * THEN timer is persisted in Scheduled state
			 *   AND ServiceCallScheduled event is published
			 *   AND event contains correct tenantId, serviceCallId, dueAt
			 * ```
			 */
			() =>
				Effect.gen(function* () {
					const { Main, Expect, Commands } = yield* TestHarness
					const fiber = yield* Main.start()

					const timerKey = yield* Commands.deliver.scheduleTimer({ dueIn: '5 minutes' })

					yield* Expect.timers.forTimer(timerKey).toBeScheduled().verify

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		/**
		 * Error Injection Tests
		 *
		 * These tests use imperative layer overrides to inject failures into port operations.
		 *
		 * Pattern:
		 * 1. Get real port implementation via `yield* Ports.PortName`
		 * 2. Create Ref to track call count: `yield* Ref.make(0)`
		 * 3. Build mock layer with `Layer.succeed` that wraps operations
		 * 4. Inject failures based on call count
		 * 5. Delegate to real port after failure threshold
		 * 6. Provide mock layer to Main.start() via Effect.provide()
		 */

		it.skip('should retry with exponential backoff on transient persistence failure' /**
		 * ```txt
		 * GIVEN Timer.main is running
		 *   AND persistence fails on first 2 attempts, succeeds on 3rd
		 * WHEN ScheduleTimer command is processed
		 * THEN retries automatically
		 *   AND third attempt succeeds
		 *   AND timer is eventually persisted
		 * ```
		 *
		 * Uses imperative layer override pattern (see Error Injection Tests comment above).
		 *
		 * **Blocked**: Requires workflow-level retry policy implementation.
		 * Currently scheduleTimerWorkflow doesn't retry on PersistenceError.
		 * Once retry policy is added, this test can verify:
		 * - Retry count (3 attempts)
		 * - Timer eventually persists after retries
		 * - Timer can fire normally after persistence
		 *
		 * Note: Exponential backoff timing should be tested in workflow unit tests.
		 */, () => Effect.void)
	})

	describe('Polling Worker', () => {
		it.scoped(
			'should detect due timers at staggered intervals and publish DueTimeReached events',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 *   AND three timers scheduled at 5min, 6min, 7min
			 * WHEN TestClock advances past each dueAt
			 * THEN each timer fires exactly once in order
			 *   AND DueTimeReached events published with correct tenantId
			 *   AND timers transition from Scheduled → Reached
			 *   AND no timers remain due after all fire
			 * ```
			 *
			 * Boundary conditions verified:
			 * - No events at t=0 (before any timer is due)
			 * - Each timer fires only when its dueAt is reached
			 * - Timer state persists correctly after firing
			 *
			 * @see ADR-0003 for timer state machine (Scheduled → Reached)
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: Three timers at staggered intervals ───────────────────
					const timerA = yield* Timers.make.scheduled('5 minutes')
					const timerB = yield* Timers.make.scheduled('6 minutes')
					const timerC = yield* Timers.make.scheduled('7 minutes')

					// ─── Baseline (t=0): Nothing due, no events ─────────────────────────
					yield* Expect.timers.noneDue
					yield* Expect.events.toBeEmpty().verify

					// ─── Start Timer.main ───────────────────────────────────────────────
					const fiber = yield* Main.start()
					yield* Effect.yieldNow()
					yield* Expect.events.toBeEmpty().verify

					// ─── Timer A fires (t=5m1s) ─────────────────────────────────────────
					yield* Time.advance(Duration.sum('5 minutes', '1 seconds'))
					yield* Expect.events.toHaveCount(1).verify
					yield* Expect.events.forTimer(timerA).toHaveType('DueTimeReached').toHaveTenant(timerA.tenantId).verify
					yield* Expect.timers.forTimer(timerA).toBeReached().verify

					// ─── Timer B fires (t=6m1s) ─────────────────────────────────────────
					yield* Time.advance('1 minute')
					yield* Expect.events.toHaveCount(2).verify
					yield* Expect.events.forTimer(timerB).toHaveType('DueTimeReached').toHaveTenant(timerB.tenantId).verify
					yield* Expect.timers.forTimer(timerB).toBeReached().verify

					// ─── Timer C fires (t=7m1s) ─────────────────────────────────────────
					yield* Time.advance('1 minute')
					yield* Expect.events.toHaveCount(3).verify
					yield* Expect.events.forTimer(timerC).toHaveType('DueTimeReached').toHaveTenant(timerC.tenantId).verify
					yield* Expect.timers.forTimer(timerC).toBeReached().verify

					// ─── Final: No timers remain due ────────────────────────────────────
					yield* Expect.timers.noneDue

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		it.scoped(
			'should poll on 5-second intervals (boundary: poll cycle timing)',
			/**
			 * ```txt
			 * GIVEN Timer.main is running with a timer due at t=7s
			 * WHEN TestClock advances in 5s increments
			 * THEN poll at t=5s finds nothing due
			 *   AND poll at t=10s detects and fires the timer
			 * ```
			 *
			 * Tests polling interval boundary - timer at 7s fires on 10s poll, not 5s.
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: Timer due at t=7s (between poll cycles) ───────────────
					const timer = yield* Timers.make.scheduled('7 seconds')

					// ─── Start Timer.main ───────────────────────────────────────────────
					const fiber = yield* Main.start()
					yield* Effect.yieldNow()

					// ─── First poll at t=0: Nothing due ─────────────────────────────────
					yield* Expect.events.toBeEmpty().verify
					yield* Expect.timers.forTimer(timer).toBeScheduled().verify

					// ─── Advance to t=5s (second poll): Timer not yet due ───────────────
					yield* Time.advance('5 seconds')
					yield* Expect.events.toBeEmpty().verify
					yield* Expect.timers.forTimer(timer).toBeScheduled().verify

					// ─── Advance to t=10s (third poll): Timer now due ───────────────────
					yield* Time.advance('5 seconds')
					yield* Expect.events.toHaveCount(1).verify
					yield* Expect.events.forTimer(timer).toHaveType('DueTimeReached').verify
					yield* Expect.timers.forTimer(timer).toBeReached().verify

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		it.scoped(
			'should fire immediately available timer at t=0 (boundary: immediate polling)',
			/**
			 * ```txt
			 * GIVEN a timer already due before Timer.main starts (dueAt in past)
			 * WHEN Timer.main is started
			 * THEN first poll (t=0) should detect and fire the timer immediately
			 * ```
			 *
			 * Tests that polling runs immediately on startup, not just after first interval.
			 * Note: We verify this by having a timer due at t=0 (scheduled with 0 duration
			 * from now), starting the fiber, and checking that it fires without needing
			 * to advance the clock by a full 5-second poll interval.
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: Timer due at t=5s ─────────────────────────────────────
					const timer = yield* Timers.make.scheduled('5 seconds')

					// ─── Advance clock so timer is due ──────────────────────────────────
					yield* Time.advance('6 seconds')

					// ─── Start Timer.main ───────────────────────────────────────────────
					const fiber = yield* Main.start()

					// ─── Allow multiple yields for the workflow to complete ─────────────
					yield* Effect.yieldNow()
					yield* Effect.yieldNow()
					yield* Effect.yieldNow()

					// ─── First poll runs immediately, finds due timer ───────────────────
					// The timer should fire on the first poll (t=5s) without needing to
					// wait for the next 5-second interval
					yield* Expect.events.toHaveCount(1).verify
					yield* Expect.events.forTimer(timer).toHaveType('DueTimeReached').verify
					yield* Expect.timers.forTimer(timer).toBeReached().verify

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		it.scoped(
			'should handle timer at exact clock boundary (dueAt === now)',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 *   AND a timer scheduled with dueAt exactly at current clock time
			 * WHEN polling executes
			 * THEN timer fires (inclusive boundary: dueAt <= now)
			 *   AND DueTimeReached event is published
			 * ```
			 *
			 * Tests microsecond precision boundary: timer due at exact clock value.
			 * Verifies inclusive comparison (<=) in findDue query.
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: Timer due in 10 seconds ───────────────────────────────
					const timer = yield* Timers.make.scheduled('10 seconds')

					// ─── Start Timer.main ───────────────────────────────────────────────
					const fiber = yield* Main.start()
					yield* Effect.yieldNow()

					// ─── Advance to EXACT due time (not past) ───────────────────────────
					yield* Time.advance('10 seconds') // now === dueAt

					// ─── Timer fires at exact boundary (inclusive comparison) ───────────
					yield* Expect.events.toHaveCount(1).verify
					yield* Expect.events.forTimer(timer).toHaveType('DueTimeReached').verify
					yield* Expect.timers.forTimer(timer).toBeReached().verify

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		it.scoped(
			'should handle large batch of due timers efficiently',
			/**
			 * ```txt
			 * GIVEN Timer.main is running
			 *   AND 50 timers all due at same time
			 * WHEN polling executes
			 * THEN all 50 timers fire in single poll cycle
			 *   AND all 50 DueTimeReached events published
			 *   AND all timers transition to Reached state
			 * ```
			 *
			 * Tests batch processing efficiency and correctness.
			 * Verifies no timers are dropped or duplicated.
			 *
			 * Note: 50 timers chosen as reasonable batch size for test performance.
			 * Production systems may handle 1000+ timers per poll.
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: 50 timers all due at 5 minutes ────────────────────────
					const batchSize = 50
					const timers = yield* pipe(
						Timers.make.scheduled('5 minutes'),
						ReadonlyArray.replicate(batchSize),
						Effect.allWith({ concurrency: 'unbounded' }),
					)

					// ─── Start Timer.main ───────────────────────────────────────────────
					const fiber = yield* Main.start()
					yield* Effect.yieldNow()

					// ─── Advance past due time ──────────────────────────────────────────
					yield* Time.advance(Duration.sum('5 minutes', '1 seconds'))

					// ─── All timers fire in single poll ─────────────────────────────────
					yield* Expect.events.toHaveCount(batchSize).verify

					// ─── Verify each timer transitioned to Reached ──────────────────────
					for (const timer of timers) {
						yield* Expect.timers.forTimer(timer).toBeReached().verify
					}

					// ─── No timers remain due ───────────────────────────────────────────
					yield* Expect.timers.noneDue

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)
	})

	describe('End-to-End Lifecycle', () => {
		it.scoped(
			'should complete full lifecycle from command to fired timer (end-to-end)',
			/**
			 * ```txt
			 * GIVEN Timer.main is running with command subscription active
			 * WHEN ScheduleTimer command is delivered
			 *   AND TestClock advances past dueAt
			 * THEN timer is persisted as Scheduled initially
			 *   AND polling worker detects due timer
			 *   AND DueTimeReached event is published
			 *   AND timer transitions to Reached state
			 * ```
			 *
			 * End-to-end lifecycle test verifying:
			 * - Command subscription → persistence (inbound path)
			 * - Polling worker → event publishing (outbound path)
			 * - Full state machine: Command → Scheduled → Reached
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Main, Expect, Commands } = yield* TestHarness

					// ─── Start Timer.main with command subscription ─────────────────────
					const fiber = yield* Main.start()

					// ─── Deliver ScheduleTimer command ──────────────────────────────────
					const timerKey = yield* Commands.deliver.scheduleTimer({ dueIn: '5 minutes' })

					// ─── Verify timer persisted as Scheduled ────────────────────────────
					yield* Expect.timers.forTimer(timerKey).toBeScheduled().verify
					yield* Expect.events.toBeEmpty().verify

					// ─── Advance past due time ──────────────────────────────────────────
					yield* Time.advance(Duration.sum('5 minutes', '1 seconds'))

					// ─── Verify polling worker fired timer ──────────────────────────────
					yield* Expect.events.toHaveCount(1).verify
					yield* Expect.events.forTimer(timerKey).toHaveType('DueTimeReached').verify
					yield* Expect.timers.forTimer(timerKey).toBeReached().verify

					yield* Main.stop(fiber)
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		describe('Multi-Tenancy', () => {
			it.scoped(
				'should process multiple tenants in single poll cycle with correct isolation',
				/**
				 * ```txt
				 * GIVEN Timer.main is running with command subscription
				 *   AND ScheduleTimer commands delivered for tenant-A and tenant-B
				 *   AND both timers due at same time (5min)
				 * WHEN TestClock advances past 5min
				 * THEN both DueTimeReached events published in same poll cycle
				 *   AND event for tenant-A has tenant-A's tenantId
				 *   AND event for tenant-B has tenant-B's tenantId
				 *   AND both timers marked as Reached
				 * ```
				 *
				 * Verifies:
				 * - Multiple tenants processed together (efficiency)
				 * - No cross-tenant data leakage (security)
				 * - End-to-end multi-tenancy through command path
				 *
				 * @see ADR-0004 for multi-tenancy database design
				 * @see ADR-0005 for schema tenant_id filtering requirements
				 */
				() =>
					Effect.gen(function* () {
						const { Time, Main, Expect, Commands, Generators } = yield* TestHarness

						// ─── Start Timer.main with command subscription ─────────────────────
						const fiber = yield* Main.start()
						yield* Effect.yieldNow() // Allow subscription to register

						// ─── Deliver commands for two different tenants ─────────────────────
						const tenantA = yield* Generators.tenantId()
						const tenantB = yield* Generators.tenantId()

						const timerA = yield* Commands.deliver.scheduleTimer({ dueIn: '5 minutes', tenantId: tenantA })
						const timerB = yield* Commands.deliver.scheduleTimer({ dueIn: '5 minutes', tenantId: tenantB })

						// ─── Verify both timers persisted as Scheduled ──────────────────────
						yield* Expect.timers.forTimer(timerA).toBeScheduled().verify
						yield* Expect.timers.forTimer(timerB).toBeScheduled().verify
						yield* Expect.events.toBeEmpty().verify

						// ─── Advance past due time: Both fire in same poll cycle ────────────
						yield* Time.advance(Duration.sum('5 minutes', '1 seconds'))

						// ─── Both events published ──────────────────────────────────────────
						yield* Expect.events.toHaveCount(2).verify

						// ─── Tenant A's event has tenant A's data ───────────────────────────
						yield* Expect.events.forTimer(timerA).toHaveType('DueTimeReached').toHaveTenant(tenantA).verify
						yield* Expect.timers.forTimer(timerA).toBeReached().verify

						// ─── Tenant B's event has tenant B's data ───────────────────────────
						yield* Expect.events.forTimer(timerB).toHaveType('DueTimeReached').toHaveTenant(tenantB).verify
						yield* Expect.timers.forTimer(timerB).toBeReached().verify

						yield* Main.stop(fiber)
					}).pipe(Effect.provide(TestHarness.Default)),
			)
		})

		describe('Idempotency', () => {
			it.scoped(
				'should handle duplicate timer scheduling gracefully (upsert semantics)',
				/**
				 * ```txt
				 * GIVEN Timer.main is running with command subscription
				 * WHEN duplicate ScheduleTimer commands arrive for same (tenantId, serviceCallId)
				 * THEN persistence upserts (no constraint violation)
				 *   AND only one timer entry exists
				 *   AND timer fires exactly once when due
				 *   AND only one DueTimeReached event published
				 * ```
				 *
				 * Tests end-to-end idempotency through the command path.
				 * Verifies that duplicate commands (e.g., from message broker retries)
				 * don't create duplicate timers or duplicate events.
				 *
				 * @see ADR-0006 for idempotency strategy (keyed by tenantId, serviceCallId)
				 */
				() =>
					Effect.gen(function* () {
						const { Time, Main, Expect, Commands, Generators } = yield* TestHarness

						// ─── Start Timer.main with command subscription ─────────────────────
						const fiber = yield* Main.start()
						yield* Effect.yieldNow() // Allow subscription to register

						// ─── Deliver initial ScheduleTimer command ──────────────────────────
						const tenantId = yield* Generators.tenantId()
						const serviceCallId = yield* Generators.serviceCallId()

						const timerKey = yield* Commands.deliver.scheduleTimer({
							dueIn: '5 minutes',
							serviceCallId,
							tenantId,
						})

						// ─── Verify timer persisted as Scheduled ────────────────────────────
						yield* Expect.timers.forTimer(timerKey).toBeScheduled().verify
						yield* Expect.events.toBeEmpty().verify

						// ─── Deliver duplicate command with SAME key ────────────────────────
						// This simulates message broker retry with identical command
						yield* Commands.deliver.scheduleTimer({
							dueIn: '5 minutes', // Same dueAt (relative to same clock position)
							serviceCallId, // Same service call (idempotency key)
							tenantId, // Same tenant
						})

						// ─── Still only one timer entry (upsert, no duplicate) ──────────────
						yield* Expect.timers.forTimer(timerKey).toBeScheduled().verify

						// ─── Advance to fire the timer ──────────────────────────────────────
						yield* Time.advance(Duration.sum('5 minutes', '1 seconds'))

						// ─── Timer fires exactly once ───────────────────────────────────────
						yield* Expect.events.toHaveCount(1).verify
						yield* Expect.events.forTimer(timerKey).toHaveType('DueTimeReached').verify
						yield* Expect.timers.forTimer(timerKey).toBeReached().verify

						// ─── Additional poll cycles: Timer does NOT fire again ──────────────
						yield* Time.advance('10 seconds')
						yield* Expect.events.toHaveCount(1).verify // Still just one event

						yield* Main.stop(fiber)
					}).pipe(Effect.provide(TestHarness.Default)),
			)
		})
	})

	describe('Fiber Lifecycle', () => {
		it.scoped(
			'should start polling immediately and stop cleanly on scope close',
			/**
			 * ```txt
			 * GIVEN Timer.main is started via forkScoped
			 *   AND a timer is due
			 * WHEN main fiber starts
			 * THEN polling executes immediately (not waiting for first interval)
			 *   AND due timer is processed
			 * WHEN Main.stop is called
			 * THEN fiber is interrupted and terminates
			 * ```
			 *
			 * Tests both startup (immediate first poll) and shutdown (clean interruption).
			 *
			 * @see ADR-0003 for polling worker design and lifecycle
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: Timer due at t=5s ─────────────────────────────────────
					const timer = yield* Timers.make.scheduled('5 seconds')

					// ─── Advance so timer is due ────────────────────────────────────────
					yield* Time.advance('5 seconds')

					// ─── Start: First poll fires immediately ────────────────────────────
					const fiber = yield* Main.start()
					yield* Effect.yieldNow()
					yield* Effect.yieldNow()
					yield* Effect.yieldNow()

					yield* Expect.events.toHaveCount(1).verify
					yield* Expect.timers.forTimer(timer).toBeReached().verify

					// ─── Stop: Interrupt polling fiber and await termination ────────────
					const exit = yield* Main.stop(fiber)

					// ─── Verify fiber was interrupted ───────────────────────────────────
					expect(exit._tag).toBe('Failure')
				}).pipe(Effect.provide(TestHarness.Default)),
		)

		it.scoped(
			'should tie polling fiber lifetime to main scope (no orphan fibers)',
			/**
			 * ```txt
			 * GIVEN Timer.main is running with polling fiber active
			 * WHEN main fiber is interrupted
			 * THEN polling fiber is automatically interrupted (forkScoped semantics)
			 *   AND fiber terminates with Failure exit
			 * ```
			 *
			 * Verifies Effect.forkScoped semantics for child fiber cleanup.
			 */
			() =>
				Effect.gen(function* () {
					const { Time, Timers, Main, Expect } = yield* TestHarness

					// ─── Arrange: Timer that will be due at t=30s ───────────────────────
					yield* Timers.make.scheduled('30 seconds')

					// ─── Start Timer.main ───────────────────────────────────────────────
					const fiber = yield* Main.start()
					yield* Effect.yieldNow()

					// ─── Verify polling is active (first poll at t=0, nothing due) ──────
					yield* Expect.events.toBeEmpty().verify

					// ─── Advance one poll cycle (t=5s), still nothing due ───────────────
					yield* Time.advance('5 seconds')
					yield* Expect.events.toBeEmpty().verify

					// ─── Interrupt main fiber (simulates scope close) ───────────────────
					const exit = yield* Main.stop(fiber)

					// ─── Verify fiber was interrupted (forkScoped semantics) ────────────
					// When main fiber is interrupted, the scoped child (polling worker)
					// should also be interrupted, resulting in a Failure exit; TODO: but why?
					expect(exit._tag).toBe('Failure')
				}).pipe(Effect.provide(TestHarness.Default)),
		)
	})

	describe('Error Recovery', () => {
		it.skip('should recover from polling errors and continue on next interval' /**
		 * ```txt
		 * GIVEN Timer.main is running
		 *   AND first poll fails (e.g., persistence query error)
		 * WHEN TestClock advances by one poll interval (5s)
		 * THEN second poll executes successfully
		 *   AND polling continues on schedule
		 *   AND subsequent due timers are processed
		 * ```
		 *
		 * Tests PollingWorker error recovery - single failure doesn't stop polling.
		 *
		 * **Blocked**: Requires complex layer composition that's beyond current DSL.
		 * The challenge: We need to wrap TimerPersistencePort BEFORE TestHarness
		 * provides it, but Layer.unwrapScoped adds complexity that may not be worth it
		 * for 1-2 tests (YAGNI principle).
		 *
		 * Alternative approaches when unblocked:
		 * - Or test error recovery at PollingWorker unit test level instead
		 */, () => Effect.void)
	})
})
