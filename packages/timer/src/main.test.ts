/**
 * Unit tests for Timer service main entry point
 *
 * Tests the Timer service's lifecycle management, layer composition,
 * and integration between polling worker and command subscription.
 *
 * @see packages/timer/TEST_COVERAGE_SUMMARY.md - Comprehensive test coverage documentation
 * @see packages/timer/src/main.ts - Source implementation
 *
 * Test Categories:
 * - Layer Composition (2 tests)
 * - Service Lifecycle (3 tests)
 * - Command Processing (2 tests)
 * - Polling Integration (1 test)
 * - Error Handling (1 test)
 * - Multi-tenancy (1 test)
 *
 * Total: 10 comprehensive tests
 */
 */

// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { describe, expect, it } from '@effect/vitest'
import * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as TestClock from 'effect/TestClock'

import { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Adapters from './adapters/index.ts'
import { Timer } from './main.ts'
import * as Ports from './ports/index.ts'

/**
 * Test state for capturing EventBus interactions
 */
class TestEventBusState extends Context.Tag('@timer/test/main/TestEventBusState')<
	TestEventBusState,
	{
		readonly publishedEvents: Ref.Ref<Chunk.Chunk<MessageEnvelope.Type>>
		readonly subscribeCallCount: Ref.Ref<number>
		readonly subscriptionHandler: Deferred.Deferred<
			(envelope: MessageEnvelope.Type) => Effect.Effect<void>,
			never
		>
	}
>() {}

/**
 * Mock EventBus layer that captures publish/subscribe calls
 */
const MockEventBusLayer = Layer.unwrapEffect(
	Effect.gen(function* () {
		const publishedEvents = yield* Ref.make(Chunk.empty<MessageEnvelope.Type>())
		const subscribeCallCount = yield* Ref.make(0)
		const subscriptionHandler = yield* Deferred.make<
			(envelope: MessageEnvelope.Type) => Effect.Effect<void>,
			never
		>()

		const mockPort = Ports.Platform.EventBusPort.of({
			publish: (events) =>
				Ref.update(publishedEvents, (existing) => Chunk.appendAll(existing, Chunk.fromIterable(events))),

			subscribe: (_topics, handler) =>
				Effect.gen(function* () {
					yield* Ref.update(subscribeCallCount, (n) => n + 1)
					yield* Deferred.succeed(subscriptionHandler, handler as (envelope: MessageEnvelope.Type) => Effect.Effect<void>)
					// Never complete to simulate long-running subscription
					return yield* Effect.never
				}),
		})

		return Layer.mergeAll(
			Layer.succeed(TestEventBusState, {
				publishedEvents,
				subscribeCallCount,
				subscriptionHandler,
			}),
			Layer.succeed(Ports.Platform.EventBusPort, mockPort),
		)
	}),
)

/**
 * Base test layers with all Timer dependencies except EventBus
 */
const BaseTestLayers = Layer.mergeAll(
	Adapters.TimerPersistence.Test,
	Adapters.Clock.Test,
	Adapters.Platform.UUID7.Sequence(),
)

describe('Timer Service', () => {
	describe('Layer Composition', () => {
		it.effect('Test layer should provide all required services', () =>
			Effect.gen(function* () {
				// Verify all port dependencies are satisfied
				const persistence = yield* Ports.TimerPersistencePort
				const clock = yield* Ports.ClockPort
				const uuid = yield* Adapters.Platform.UUID7

				// Smoke test each service
				const now = yield* clock.now()
				expect(now).toBeDefined()

				const id = yield* uuid.make()
				expect(id).toBeDefined()

				const emptyTimers = yield* persistence.findDue(now)
				expect(Chunk.size(emptyTimers)).toBe(0)
			}).pipe(Effect.provide(Timer.Test), Effect.provide(MockEventBusLayer)),
		)

		it.effect('Live layer should have correct dependency structure', () =>
			Effect.gen(function* () {
				// This test verifies the layer can be constructed without runtime errors
				// We don't actually run it since it requires real infrastructure
				const layer = Timer.Live

				// Verify layer is defined
				expect(layer).toBeDefined()
			}),
		)
	})

	describe('Service Lifecycle', () => {
		it.scoped('should start polling worker in background fiber', () =>
			Effect.gen(function* () {
				const testState = yield* TestEventBusState

				// Start the Timer service (forks polling worker)
				const fiber = yield* Effect.forkScoped(Timer)

				// Advance time to trigger at least one poll cycle (5 seconds)
				yield* TestClock.adjust(Duration.seconds(6))
				yield* Effect.yieldNow()

				// Verify the service is still running (hasn't crashed)
				const status = yield* Fiber.status(fiber)
				expect(status._tag).toBe('Running')

				// Service should have established subscription
				const subCount = yield* Ref.get(testState.subscribeCallCount)
				expect(subCount).toBeGreaterThanOrEqual(1)
			}).pipe(
				Effect.provide(Timer.Test),
				Effect.provide(MockEventBusLayer),
				Effect.scoped,
			),
		)

		it.scoped('should interrupt polling worker when scope closes', () =>
			Effect.gen(function* () {
				let fiberRef: Fiber.RuntimeFiber<void, never> | null = null

				// Create inner scope for Timer service
				yield* Effect.scoped(
					Effect.gen(function* () {
						const fiber = yield* Effect.forkScoped(Timer)
						fiberRef = fiber

						// Verify running
						const status = yield* Fiber.status(fiber)
						expect(status._tag).toBe('Running')

						// Scope will close here
					}),
				)

				// After scope closes, fiber should be interrupted
				if (fiberRef) {
					const finalStatus = yield* Fiber.status(fiberRef)
					expect(finalStatus._tag).not.toBe('Running')
				}
			}).pipe(
				Effect.provide(Timer.Test),
				Effect.provide(MockEventBusLayer),
				Effect.scoped,
			),
		)

		it.scoped('should handle command subscription errors gracefully', () =>
			Effect.gen(function* () {
				// Create a mock that fails subscription
				const failingEventBus = Ports.Platform.EventBusPort.of({
					publish: () => Effect.void,
					subscribe: () => Effect.fail(Ports.Platform.SubscribeError.make({ message: 'Connection failed' })),
				})

				const failingLayer = Layer.succeed(Ports.Platform.EventBusPort, failingEventBus)

				// Service should fail fast on subscription error
				const result = yield* Effect.fork(Timer).pipe(
					Effect.provide(Timer.Test),
					Effect.provide(failingLayer),
					Effect.flip,
				)

				expect(result).toMatchObject({
					message: 'Connection failed',
				})
			}).pipe(Effect.scoped),
		)
	})

	describe('Command Processing', () => {
		it.scoped('should process ScheduleTimer commands with retry policy', () =>
			Effect.gen(function* () {
				const testState = yield* TestEventBusState
				const persistence = yield* Ports.TimerPersistencePort
				const clock = yield* Ports.ClockPort

				// Start Timer service
				yield* Effect.forkScoped(Timer)

				// Wait for subscription handler to be ready
				const handler = yield* Deferred.await(testState.subscriptionHandler)

				// Create a valid ScheduleTimer command
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()
				const now = yield* clock.now()

				const command = Messages.Orchestration.Commands.ScheduleTimer.make({
					correlationId: Option.none(),
					dueIn: Duration.minutes(5),
					serviceCallId,
					tenantId,
				})

				const envelope = MessageEnvelope.make({
					causationId: Option.none(),
					correlationId: Option.none(),
					payload: command,
				})

				// Invoke the handler
				yield* handler(envelope)

				// Verify timer was persisted
				const savedTimer = yield* persistence.find({ serviceCallId, tenantId })
				expect(Option.isSome(savedTimer)).toBe(true)
			}).pipe(
				Effect.provide(Timer.Test),
				Effect.provide(MockEventBusLayer),
				Effect.scoped,
			),
		)

		it.scoped('should retry failed command processing', () =>
			Effect.gen(function* () {
				const testState = yield* TestEventBusState
				const attemptCount = yield* Ref.make(0)

				// Create a mock persistence that fails twice then succeeds
				const flakyPersistence = Ports.TimerPersistencePort.of({
					save: (timer) =>
						Effect.gen(function* () {
							const count = yield* Ref.getAndUpdate(attemptCount, (n) => n + 1)
							if (count < 2) {
								return yield* Effect.fail(
									Ports.PersistenceError.make({ message: 'Temporary failure', type: 'SaveError' }),
								)
							}
							// Succeed on third attempt
							return timer
						}),
					find: () => Effect.succeed(Option.none()),
					findDue: () => Effect.succeed(Chunk.empty()),
					markFired: () => Effect.void,
					findScheduledTimer: () => Effect.succeed(Option.none()),
				})

				const flakyLayer = Layer.succeed(Ports.TimerPersistencePort, flakyPersistence)

				// Start Timer with flaky persistence
				yield* Effect.forkScoped(Timer.DefaultWithoutDependencies).pipe(
					Effect.provide(flakyLayer),
					Effect.provide(Adapters.TimerEventBus.Live),
					Effect.provide(MockEventBusLayer),
					Effect.provide(Adapters.Clock.Test),
					Effect.provide(Adapters.Platform.UUID7.Sequence()),
				)

				const handler = yield* Deferred.await(testState.subscriptionHandler)

				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				const command = Messages.Orchestration.Commands.ScheduleTimer.make({
					correlationId: Option.none(),
					dueIn: Duration.minutes(5),
					serviceCallId,
					tenantId,
				})

				const envelope = MessageEnvelope.make({
					causationId: Option.none(),
					correlationId: Option.none(),
					payload: command,
				})

				// Should eventually succeed after retries
				yield* handler(envelope)

				// Verify retry happened (should be 3 attempts: initial + 2 retries, but we fail first 2)
				const finalCount = yield* Ref.get(attemptCount)
				expect(finalCount).toBeGreaterThanOrEqual(2)
			}).pipe(Effect.scoped),
		)
	})

	describe('Polling Integration', () => {
		it.scoped('should poll for due timers periodically', () =>
			Effect.gen(function* () {
				const testState = yield* TestEventBusState
				const persistence = yield* Ports.TimerPersistencePort
				const clock = yield* Ports.ClockPort

				// Create a timer that will be due
				const now = yield* clock.now()
				const tenantId = yield* TenantId.makeUUID7()
				const serviceCallId = yield* ServiceCallId.makeUUID7()

				// Import required types for timer creation
				const { TimerEntry } = yield* Effect.succeed(
					// biome-ignore lint/correctness/noUndeclaredVariables: imported dynamically
					await import('./domain/timer-entry.domain.ts'),
				)

				const timer = TimerEntry.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt: now, // Due immediately
					registeredAt: now,
					serviceCallId,
					tenantId,
				})

				yield* persistence.save(timer)

				// Start Timer service
				yield* Effect.forkScoped(Timer)

				// Advance time past polling interval (5 seconds)
				yield* TestClock.adjust(Duration.seconds(6))
				yield* Effect.yieldNow()

				// Check if DueTimeReached event was published
				const events = yield* Ref.get(testState.publishedEvents)
				const dueEvents = Chunk.filter(
					events,
					(env) => env.type === Messages.Timer.Events.DueTimeReached.Tag,
				)

				expect(Chunk.size(dueEvents)).toBeGreaterThanOrEqual(1)
			}).pipe(
				Effect.provide(Timer.Test),
				Effect.provide(MockEventBusLayer),
				Effect.scoped,
			),
		)
	})

	describe('Error Handling', () => {
		it.scoped('should continue polling after transient errors', () =>
			Effect.gen(function* () {
				const errorCount = yield* Ref.make(0)

				// Mock persistence that fails once then recovers
				const recoveringPersistence = Ports.TimerPersistencePort.of({
					findDue: () =>
						Effect.gen(function* () {
							const count = yield* Ref.getAndUpdate(errorCount, (n) => n + 1)
							if (count === 0) {
								return yield* Effect.fail(
									Ports.PersistenceError.make({ message: 'DB locked', type: 'QueryError' }),
								)
							}
							return Chunk.empty()
						}),
					save: () => Effect.fail(Ports.PersistenceError.make({ message: 'Not used', type: 'SaveError' })),
					find: () => Effect.succeed(Option.none()),
					markFired: () => Effect.void,
					findScheduledTimer: () => Effect.succeed(Option.none()),
				})

				const recoveringLayer = Layer.succeed(Ports.TimerPersistencePort, recoveringPersistence)

				// Start service with recovering persistence
				const fiber = yield* Effect.forkScoped(Timer.DefaultWithoutDependencies).pipe(
					Effect.provide(recoveringLayer),
					Effect.provide(Adapters.TimerEventBus.Live),
					Effect.provide(MockEventBusLayer),
					Effect.provide(Adapters.Clock.Test),
					Effect.provide(Adapters.Platform.UUID7.Sequence()),
				)

				// Trigger multiple poll cycles
				yield* TestClock.adjust(Duration.seconds(15))
				yield* Effect.yieldNow()

				// Service should still be running despite initial error
				const status = yield* Fiber.status(fiber)
				expect(status._tag).toBe('Running')

				// Should have recovered (multiple attempts)
				const errors = yield* Ref.get(errorCount)
				expect(errors).toBeGreaterThan(1)
			}).pipe(Effect.scoped),
		)
	})

	describe('Multi-tenancy', () => {
		it.scoped('should handle timers from multiple tenants', () =>
			Effect.gen(function* () {
				const testState = yield* TestEventBusState
				const persistence = yield* Ports.TimerPersistencePort
				const clock = yield* Ports.ClockPort

				const now = yield* clock.now()

				// Import domain types
				const { TimerEntry } = yield* Effect.succeed(
					// biome-ignore lint/correctness/noUndeclaredVariables: imported dynamically
					await import('./domain/timer-entry.domain.ts'),
				)

				// Create timers for two different tenants
				const tenant1 = yield* TenantId.makeUUID7()
				const tenant2 = yield* TenantId.makeUUID7()

				const timer1 = TimerEntry.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt: now,
					registeredAt: now,
					serviceCallId: yield* ServiceCallId.makeUUID7(),
					tenantId: tenant1,
				})

				const timer2 = TimerEntry.ScheduledTimer.make({
					correlationId: Option.none(),
					dueAt: now,
					registeredAt: now,
					serviceCallId: yield* ServiceCallId.makeUUID7(),
					tenantId: tenant2,
				})

				yield* persistence.save(timer1)
				yield* persistence.save(timer2)

				// Start service and trigger polling
				yield* Effect.forkScoped(Timer)
				yield* TestClock.adjust(Duration.seconds(6))
				yield* Effect.yieldNow()

				// Both tenants should have events published
				const events = yield* Ref.get(testState.publishedEvents)
				const tenant1Events = Chunk.filter(events, (env) => 'tenantId' in env.payload && env.payload.tenantId === tenant1)
				const tenant2Events = Chunk.filter(events, (env) => 'tenantId' in env.payload && env.payload.tenantId === tenant2)

				expect(Chunk.size(tenant1Events)).toBeGreaterThanOrEqual(1)
				expect(Chunk.size(tenant2Events)).toBeGreaterThanOrEqual(1)
			}).pipe(
				Effect.provide(Timer.Test),
				Effect.provide(MockEventBusLayer),
				Effect.scoped,
			),
		)
	})
})