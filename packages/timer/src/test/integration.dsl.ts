// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { expect } from '@effect/vitest'
import * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import type { DurationInput } from 'effect/Duration'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import type * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as TestClock from 'effect/TestClock'

import { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { EnvelopeId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Adapters from '../adapters/index.ts'
import { TimerDomain } from '../domain/index.ts'
import { _main } from '../main.ts'
import * as Ports from '../ports/index.ts'
import { ServiceCallFixture } from './service-call.fixture.ts'

class TestEventBusState extends Context.Tag('@event-service-agent/timer/test/integration.dsl.ts/TestEventBusState')<
	TestEventBusState,
	{
		readonly publishedEventsRef: Ref.Ref<Chunk.Chunk<MessageEnvelope.Type>>
		readonly commandHandlerRef: Ref.Ref<
			Option.Option<(envelope: MessageEnvelope.Type) => Effect.Effect<void, unknown, unknown>>
		>
	}
>() {}

/**
 * EventBus test double layer (LOCAL).
 *
 * Captures outbound publishes into `TestEventBusState.publishedEventsRef`
 * for assertions, and exposes the Timer `EventBusPort` mock. Command
 * subscription capture will be added when the command-path tests are enabled.
 *
 * Used in `dependencies` for service construction only.
 */
const EventBusTestLayer: Layer.Layer<TestEventBusState | Ports.Platform.EventBusPort, never, never> =
	Layer.unwrapEffect(
		Effect.gen(function* () {
			const publishedEventsRef = yield* Ref.make(Chunk.empty<MessageEnvelope.Type>())
			const commandHandlerRef = yield* Ref.make<
				Option.Option<(envelope: MessageEnvelope.Type) => Effect.Effect<void, unknown, unknown>>
			>(Option.none())

			const EventBusPortLayer: Layer.Layer<Ports.Platform.EventBusPort, never, never> = Layer.mock(
				Ports.Platform.EventBusPort,
				{
					publish: (events) =>
						Ref.update(publishedEventsRef, (existing) => Chunk.appendAll(existing, Chunk.fromIterable(events))),
					subscribe: Effect.fn(function* <E, R>(
						_topics: readonly string[],
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) {
						yield* Ref.set(commandHandlerRef, Option.some(handler))
						return yield* Effect.never
					}),
				},
			)

			const EventCaptureLayer: Layer.Layer<TestEventBusState, never, never> = Layer.succeed(TestEventBusState, {
				commandHandlerRef,
				publishedEventsRef,
			})

			return Layer.merge(EventCaptureLayer, EventBusPortLayer)
		}),
	)

/**
 * Integration Test DSL - Effect.Service based
 *
 * This uses Effect.Service to provide a scoped TestHarness that:
 * - Automatically tracks elapsed time via internal Ref
 * - Auto-generates time context for assertions (no manual strings)
 * - Encapsulates all test infrastructure as internal details
 *
 * @example
 * ```typescript
 * it.scoped('should do something', () =>
 *   Effect.gen(function* () {
 *     const { Time, Timers, Main, Expect } = yield* TestHarness
 *
 *     const timer = yield* Timers.create.scheduled('5 minutes')
 *     const fiber = yield* Main.start()
 *
 *     yield* Time.advance('6 minutes')
 *
 *     // Assertions auto-capture time context: "t=6 minutes"
 *     yield* Expect.events.toHaveCount(1).verify
 *     yield* Expect.events.forTimer(timer).toHaveType('DueTimeReached').verify
 *
 *     yield* Main.stop(fiber)
 *   }).pipe(Effect.provide(TestHarness.Default))
 * )
 * ```
 */
export class TestHarness extends Effect.Service<TestHarness>()(
	'@event-service-agent/timer/test/integration.dsl.ts/TestHarness',
	{
		dependencies: [
			Layer.merge(
				Layer.merge(Adapters.TimerPersistence.Test, ServiceCallFixture.Default),
				Layer.provideMerge(
					Adapters.TimerEventBus.Live,
					Layer.mergeAll(Adapters.Platform.UUID7.Sequence(), Adapters.Clock.Test, EventBusTestLayer),
				),
			),
		],
		effect: Effect.gen(function* () {
			const persistence = yield* Ports.TimerPersistencePort
			const clock = yield* Ports.ClockPort
			const uuid7 = yield* Adapters.Platform.UUID7
			const eventBus = yield* Ports.TimerEventBusPort
			const serviceCallFixture = yield* ServiceCallFixture
			const { publishedEventsRef, commandHandlerRef } = yield* TestEventBusState

			const timeElapsedRef = yield* Ref.make(Duration.zero)

			const getTimeContext = pipe(
				timeElapsedRef,
				Ref.get,
				Effect.map((elapsedDuration) =>
					Duration.equals(elapsedDuration, Duration.zero)
						? ('t=0' as const)
						: (`t=${Duration.format(elapsedDuration)}` as const),
				),
			)

			const findEventForTimer = (
				timerScheduleKey: Ports.TimerScheduleKey.Type,
			): Effect.Effect<Option.Option<MessageEnvelope>> =>
				pipe(
					publishedEventsRef,
					Ref.get,
					Effect.map(
						Chunk.findFirst(
							({ payload }) =>
								'serviceCallId' in payload &&
								payload.serviceCallId === timerScheduleKey.serviceCallId &&
								payload.tenantId === timerScheduleKey.tenantId,
						),
					),
				)

			/**
			 * Time control DSL - advance virtual clock with automatic tracking
			 */
			const Time = {
				/**
				 * Advance virtual clock and yield to allow fibers to execute.
				 * Automatically tracks elapsed time for assertion context.
				 */
				advance: (duration: DurationInput) =>
					Effect.gen(function* () {
						const dur = Duration.decode(duration)
						yield* TestClock.adjust(dur)
						yield* Ref.update(timeElapsedRef, Duration.sum(dur))
						yield* Effect.yieldNow()
					}),

				/**
				 * Get current virtual time
				 */
				now: clock.now(),
			}

			/**
			 * Timer state DSL - create and query timers
			 */
			const Timers = {
				/**
				 * Get all currently due timers
				 */
				due: pipe(clock.now(), Effect.flatMap(persistence.findDue)),

				/**
				 * Find timer by key (any state)
				 */
				find: persistence.find,
				make: {
					/**
					 * Schedule a timer at given duration from now.
					 * Creates service call fixture and persists timer.
					 * Returns the timer key (tenantId, serviceCallId) for use in assertions.
					 */
					scheduled: (dueIn: DurationInput, tenantId?: TenantId.Type) =>
						Effect.gen(function* () {
							const now = yield* clock.now()

							const timerKey = Ports.TimerScheduleKey.make({
								serviceCallId: ServiceCallId.make(yield* uuid7.randomUUIDv7()),
								tenantId: tenantId ?? TenantId.make(yield* uuid7.randomUUIDv7()),
							})

							const scheduledTimer = TimerDomain.ScheduledTimer.make({
								...timerKey,
								correlationId: Option.none(),
								dueAt: DateTime.addDuration(now, dueIn),
								registeredAt: now,
							})

							yield* serviceCallFixture.make(timerKey)
							yield* persistence.save(scheduledTimer)

							return timerKey
						}),
				},
			}

			/**
			 * Main entry point DSL - fiber lifecycle control
			 */
			const Main = {
				/**
				 * Fork Timer.main as a scoped fiber.
				 *
				 * Uses forkScoped so the fiber is automatically interrupted when the
				 * test scope closes - even if an assertion fails before Main.stop().
				 */
				start: () =>
					pipe(
						Context.empty(),
						Context.add(Ports.TimerPersistencePort, persistence),
						Context.add(Ports.ClockPort, clock),
						Context.add(Adapters.Platform.UUID7, uuid7),
						Context.add(Ports.TimerEventBusPort, eventBus),
						(context) => Effect.provide(_main, context),
						Effect.forkScoped,
					),

				/**
				 * Interrupt the Timer.main fiber and await its exit status.
				 */
				stop: <A, E>(fiber: Fiber.RuntimeFiber<A, E>): Effect.Effect<Exit.Exit<A, E>> =>
					pipe(Fiber.interrupt(fiber), Effect.zipRight(Fiber.await(fiber))),
			}

			/**
			 * Assertion DSL - domain-focused expectations with auto time context
			 */
			const Expect = {
				/**
				 * Event assertions namespace - all EventBus-related checks
				 */
				events: {
					/**
					 * Start assertion chain for a specific timer's event (order-independent).
					 * Finds event by serviceCallId, not by index.
					 */
					forTimer: (timerKey: Ports.TimerScheduleKey.Type) => {
						const assertions: ((event: MessageEnvelope.Type, ctx: string) => void)[] = []

						const builder = {
							/**
							 * Assert event has the given tenantId
							 */
							toHaveTenant: (tenantId: TenantId.Type) => {
								assertions.push((event, ctx) => {
									expect(event.tenantId, `${ctx}: event.tenantId`).toBe(tenantId)
								})
								return builder
							},

							/**
							 * Assert event has the given type
							 */
							toHaveType: (type: MessageEnvelope.Type['type']) => {
								assertions.push((event, ctx) => {
									expect(event.type, `${ctx}: event.type`).toBe(type)
								})
								return builder
							},

							/**
							 * Execute all chained assertions with auto-generated time context
							 */
							verify: pipe(
								getTimeContext,
								Effect.zip(findEventForTimer(timerKey)),
								Effect.andThen(([ctx, maybeEvent]) => {
									// Assert event exists
									expect(Option.isSome(maybeEvent), `${ctx}: expected event for timer ${timerKey.serviceCallId}`).toBe(
										true,
									)

									// Run property assertions on found event
									const event = Option.getOrThrow(maybeEvent)
									for (const assert of assertions) {
										assert(event, ctx)
									}
								}),
							),
						}

						return builder
					},
					/**
					 * Assert no events were published
					 */
					toBeEmpty: () => ({
						/**
						 * Execute assertion with auto-generated time context
						 */
						verify: pipe(
							publishedEventsRef,
							Ref.get,
							Effect.map(Chunk.size),
							Effect.zip(getTimeContext),
							Effect.andThen(([count, ctx]) => {
								expect(count, `${ctx}: expected no events published`).toBe(0)
							}),
						),
					}),

					/**
					 * Assert exact number of events were published
					 */
					toHaveCount: (expected: number) => ({
						/**
						 * Execute assertion with auto-generated time context
						 */
						verify: pipe(
							publishedEventsRef,
							Ref.get,
							Effect.map(Chunk.size),
							Effect.zip(getTimeContext),
							Effect.andThen(([count, ctx]) => {
								expect(count, `${ctx}: expected ${expected} event(s) published`).toBe(expected)
							}),
						),
					}),
				},

				/**
				 * Timer assertions namespace - all persistence-related checks
				 */
				timers: {
					/**
					 * Timer assertion builder - chainable API for persistence assertions
					 */
					forTimer: (timerKey: Ports.TimerScheduleKey.Type) => {
						const assertions: ((timer: TimerDomain.TimerEntry.Type, ctx: string) => void)[] = []

						const builder = {
							/**
							 * Assert timer has transitioned to Reached state in persistence
							 */
							toBeReached: () => {
								assertions.push((timer, ctx) => {
									expect(timer._tag, `${ctx}: timer._tag`).toBe('Reached')
								})
								return builder
							},

							/**
							 * Assert timer is still in Scheduled state
							 */
							toBeScheduled: () => {
								assertions.push((timer, ctx) => {
									expect(timer._tag, `${ctx}: timer._tag`).toBe('Scheduled')
								})
								return builder
							},

							/**
							 * Execute all chained assertions with auto-generated time context
							 */
							verify: pipe(
								getTimeContext,
								Effect.zip(persistence.find(timerKey)),
								Effect.andThen(([ctx, maybeTimer]) => {
									// Assert timer exists
									expect(Option.isSome(maybeTimer), `${ctx}: timer should exist in DB`).toBe(true)

									// Run property assertions on found timer
									const timer = Option.getOrThrow(maybeTimer)
									for (const assert of assertions) {
										assert(timer, ctx)
									}
								}),
							),
						}

						return builder
					},

					/**
					 * Assert no timers are currently due
					 */
					noneDue: pipe(
						clock.now(),
						Effect.flatMap(persistence.findDue),
						Effect.zip(getTimeContext),
						Effect.andThen(([due, ctx]) => {
							expect(Chunk.isEmpty(due), `${ctx}: no timers should be due`).toBe(true)
						}),
					),
				},
			}

			const getCommandHandler = pipe(
				commandHandlerRef,
				Ref.get,
				Effect.flatMap(
					Option.match({
						onNone: () =>
							Effect.die(
								'Command subscription handler missing. Ensure Main.start() has been called to register the subscriber.',
							),
						onSome: Effect.succeed,
					}),
				),
			)

			/**
			 * Command delivery DSL
			 */
			const Commands = {
				deliver: {
					/**
					 * Deliver a ScheduleTimer command via captured EventBus subscription handler.
					 */
					scheduleTimer: Effect.fn(function* ({
						dueIn = '5 minutes',
						tenantId,
					}: {
						dueIn?: DurationInput
						tenantId?: TenantId.Type
					} = {}) {
						const handler = yield* getCommandHandler
						const now = yield* clock.now()
						const dur = Duration.decode(dueIn)
						const dueAt = DateTime.addDuration(now, dur)

						const timerKey = Ports.TimerScheduleKey.make({
							serviceCallId: ServiceCallId.make(yield* uuid7.randomUUIDv7()),
							tenantId: tenantId ?? TenantId.make(yield* uuid7.randomUUIDv7()),
						})

						const envelopeId: EnvelopeId.Type = yield* EnvelopeId.makeUUID7().pipe(
							Effect.provideService(Adapters.Platform.UUID7, uuid7),
						)

						const command = new Messages.Orchestration.Commands.ScheduleTimer({
							...timerKey,
							dueAt,
						})

						const envelope: MessageEnvelope.Type = new MessageEnvelope({
							aggregateId: Option.some(timerKey.serviceCallId),
							causationId: Option.none(),
							correlationId: Option.none(),
							id: envelopeId,
							payload: command,
							tenantId: timerKey.tenantId,
							timestampMs: now,
							type: command._tag,
						})

						yield* handler(envelope)

						return timerKey
					}),
				},
			}

			return { Commands, Expect, Main, Time, Timers } as const
		}),
	},
) {}
