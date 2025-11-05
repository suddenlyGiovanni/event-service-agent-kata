import { assert, describe, expect, expectTypeOf, it, layer } from '@effect/vitest'
import { assertEquals, assertNone } from '@effect/vitest/utils'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as TestClock from 'effect/TestClock'

import { MessageMetadata } from '@event-service-agent/platform/context'
import { Topics } from '@event-service-agent/platform/routing'
import { UUID7 } from '@event-service-agent/platform/uuid7'
import type { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { CorrelationId, EnvelopeId, ServiceCallId, TenantId, UUID7Regex } from '@event-service-agent/schemas/shared'

import * as Ports from '../ports/index.ts'
import * as AdaptersTimer from './index.ts'

describe('TimerEventBus', () => {
	// Test fixtures
	const tenantId = TenantId.make('01234567-89ab-7cde-89ab-0123456789ab')
	const serviceCallId = ServiceCallId.make('fedcba98-7654-7321-8fed-cba987654321')
	const correlationId = CorrelationId.make('aaaabbbb-cccc-7ddd-8eee-ffffffffffff')

	// These are shared across all tests via @effect/vitest layer()
	const BaseTestLayers = Layer.merge(UUID7.Default, AdaptersTimer.ClockPortTest)

	layer(BaseTestLayers)('publishDueTimeReached', it => {
		describe('Happy Path', () => {
			/**
			 * TODO(PL-24): Implement MessageMetadata Context provisioning
			 *
			 * This test is currently marked as .todo() because we haven't implemented
			 * the MessageMetadata Context pattern yet (tracked in ADR-0013, PL-24).
			 *
			 * Once PL-24 is complete, this test should:
			 * 1. Provision MessageMetadata context with correlationId via Effect.provideService
			 * 2. Verify adapter extracts correlationId from context (not Option.none)
			 * 3. Assert envelope.correlationId === Option.some(correlationId)
			 *
			 * Current blocker: Port signature doesn't require MessageMetadata in R parameter,
			 * adapter has no mechanism to access correlationId from timer aggregate or context.
			 *
			 * See: docs/decisions/ADR-0013-correlation-propagation.md
			 * See: docs/plan/correlation-context-implementation.md (Phase 1-2)
			 */
			it.todo('should publish DueTimeReached event with correlationId from MessageMetadata context', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<Ports.EventBusPort, never, never> = Layer.mock(Ports.EventBusPort, {
					publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					const clock = yield* Ports.ClockPort
					const now = yield* clock.now()

					// Create domain event (pure, no correlationId)
					const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
						reachedAt: now,
						serviceCallId,
						tenantId,
					})

					const timerEventBus = yield* Ports.TimerEventBusPort
					// TODO(PL-24): Wrap with Effect.provideService(MessageMetadata, { correlationId, causationId })
					yield* timerEventBus.publishDueTimeReached(dueTimeReachedEvent)

					// Assert
					expect(publishedEnvelopes).toHaveLength(1)

					const envelope = publishedEnvelopes[0]

					assert(envelope !== undefined)

					expect(envelope.type).toBe(Messages.Timer.Events.DueTimeReached.Tag)
					expect(envelope.tenantId).toBe(tenantId)
					// TODO(PL-24): Change to Option.some(correlationId) once context provisioning implemented
					assertEquals(envelope.correlationId, Option.some(correlationId))
					// timestampMs is now DateTime.Utc (compare via DateTime.Equivalence)
					expect(DateTime.Equivalence(envelope.timestampMs, now)).toBe(true)
					const payload = envelope.payload
					assert(payload._tag === Messages.Timer.Events.DueTimeReached.Tag)
					expectTypeOf(payload).toEqualTypeOf<Messages.Timer.Events.DueTimeReached.Type>()
					expect(payload._tag).toBe(Messages.Timer.Events.DueTimeReached.Tag)
					expect(payload.tenantId).toBe(tenantId)
					expect(payload.serviceCallId).toBe(serviceCallId)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should publish DueTimeReached event without correlation ID', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<Ports.EventBusPort, never, never> = Layer.mock(Ports.EventBusPort, {
					publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					const clock = yield* Ports.ClockPort
					const now = yield* clock.now()

					// Create domain event
					const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
						reachedAt: now,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus
						.publishDueTimeReached(dueTimeReachedEvent)
						.pipe(Effect.provideService(MessageMetadata, { causationId: Option.none(), correlationId: Option.none() }))

					// Assert
					expect(publishedEnvelopes).toHaveLength(1)

					const envelope = publishedEnvelopes[0]
					assert(envelope !== undefined)
					assertNone(envelope.correlationId)
					// assert envelope contents...
					expect(envelope.type).toBe(Messages.Timer.Events.DueTimeReached.Tag)
					expect(envelope.tenantId).toBe(tenantId)
					expect(envelope.payload).toEqual(dueTimeReachedEvent)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should generate unique envelope IDs for each publish', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<Ports.EventBusPort, never, never> = Layer.mock(Ports.EventBusPort, {
					publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					const clock = yield* Ports.ClockPort
					const now = yield* clock.now()

					// Create domain event
					const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
						reachedAt: now,
						serviceCallId,
						tenantId,
					})

					const messageMetadata = MessageMetadata.of({ causationId: Option.none(), correlationId: Option.none() })

					// Act - publish twice
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus
						.publishDueTimeReached(dueTimeReachedEvent)
						.pipe(Effect.provideService(MessageMetadata, messageMetadata))
					yield* timerEventBus
						.publishDueTimeReached(dueTimeReachedEvent)
						.pipe(Effect.provideService(MessageMetadata, messageMetadata))

					// Assert
					expect(publishedEnvelopes).toHaveLength(2)
					const firstEnvelope = publishedEnvelopes[0]
					const secondEnvelope = publishedEnvelopes[1]
					assert(firstEnvelope !== undefined)
					assert(secondEnvelope !== undefined)
					expect(firstEnvelope.id).not.toBe(secondEnvelope.id)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should distinguish envelope timestamp (now) from domain timestamp (reachedAt)', () => {
				/**
				 * This test verifies the semantic difference between:
				 * - envelope.timestampMs: Infrastructure time (when message was published)
				 * - payload.reachedAt: Domain time (when timer became due)
				 *
				 * Scenario: Timer reached at T+0, but published at T+10
				 * The gap reveals publishing latency for observability.
				 */
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<Ports.EventBusPort, never, never> = Layer.mock(Ports.EventBusPort, {
					publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					const clock = yield* Ports.ClockPort
					const initialTime = yield* clock.now()

					// Domain event: timer reached at initial time
					const reachedAt = initialTime

					// Simulate 10-minute delay before publishing
					yield* TestClock.adjust('10 minutes')
					const publishedAt = yield* clock.now()

					const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
						reachedAt,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus
						.publishDueTimeReached(dueTimeReachedEvent)
						.pipe(Effect.provideService(MessageMetadata, { causationId: Option.none(), correlationId: Option.none() }))

					// Assert: envelope timestamp reflects publishing time (T+10)
					const envelope = publishedEnvelopes[0]
					assert(envelope !== undefined)

					expect(DateTime.Equivalence(envelope.timestampMs, publishedAt)).toBe(true)

					// Assert: payload timestamp preserves domain time (T+0)
					const payload = envelope.payload
					assert(payload._tag === Messages.Timer.Events.DueTimeReached.Tag)
					expect(DateTime.Equivalence(payload.reachedAt, reachedAt)).toBe(true)

					// Assert: timestamps are different (10-minute gap reveals latency)
					expect(DateTime.Equivalence(envelope.timestampMs, payload.reachedAt)).toBe(false)
					expect(DateTime.greaterThan(envelope.timestampMs, payload.reachedAt)).toBe(true)
				}).pipe(Effect.provide(TimerEventBusLive))
			})
		})

		describe('Error Handling', () => {
			it.effect('should propagate PublishError from EventBusPort', () => {
				const EventBusTest: Layer.Layer<Ports.EventBusPort, never, never> = Layer.mock(Ports.EventBusPort, {
					publish: () => Effect.fail(new Ports.PublishError({ cause: 'Connection failed' })),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					const clock = yield* Ports.ClockPort
					const now = yield* clock.now()

					const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
						reachedAt: now,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.publishDueTimeReached(dueTimeReachedEvent)).pipe(
						Effect.provideService(MessageMetadata, { causationId: Option.none(), correlationId: Option.none() }),
					)

					// Assert
					expect(Either.isLeft(result)).toBe(true)

					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('PublishError')
					}
				}).pipe(Effect.provide(TimerEventBusLive))
			})
		})
	})

	layer(BaseTestLayers)('subscribeToScheduleTimerCommands', it => {
		describe('Happy Path', () => {
			it.effect('should subscribe to Timer.Commands topic', () => {
				let subscribedTopics: readonly Topics.Type[] = []

				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: (topics, _handler) =>
						Effect.sync(() => {
							subscribedTopics = topics
						}),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void)

					// Assert
					expect(subscribedTopics).toContain(Topics.Timer.Commands)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should call handler with decoded ScheduleTimer command', () => {
				let handlerCalled = false
				let receivedCommand: Messages.Orchestration.Commands.ScheduleTimer.Type | null = null
				let receivedCorrelationId: CorrelationId.Type | undefined

				const now = DateTime.unsafeNow()
				const dueAt = DateTime.add(now, { minutes: 5 })

				// Create envelope (already decoded, domain types)
				const envelope: MessageEnvelope.Type = {
					aggregateId: Option.none(),
					causationId: Option.none(),
					correlationId: Option.some(correlationId),
					id: EnvelopeId.make('12345678-0000-7000-8000-000000000000'),
					payload: {
						_tag: Messages.Orchestration.Commands.ScheduleTimer.Tag,
						dueAt, // Domain type: DateTime.Utc
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs: now, // Domain type: DateTime.Utc
					type: Messages.Orchestration.Commands.ScheduleTimer.Tag,
				}

				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(command =>
						Effect.gen(function* () {
							// Extract metadata from context (provisioned by adapter)
							const metadata = yield* MessageMetadata
							handlerCalled = true
							receivedCommand = command
							receivedCorrelationId = Option.getOrUndefined(metadata.correlationId)
						}),
					)

					// Assert
					expect(handlerCalled).toBe(true)
					expect(receivedCommand).not.toBeNull()
					if (receivedCommand) {
						expect(receivedCommand._tag).toBe('ScheduleTimer')
						expect(receivedCommand.tenantId).toBe(tenantId)
						expect(receivedCommand.serviceCallId).toBe(serviceCallId)
					}
					expect(receivedCorrelationId).toBe(correlationId)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should ignore non-ScheduleTimer messages', () => {
				let handlerCalled = false

				const now = DateTime.unsafeNow()

				// Wrong message type
				const envelope: MessageEnvelope.Type = {
					aggregateId: Option.none(),
					causationId: Option.none(),
					correlationId: Option.none(),
					id: EnvelopeId.make('12345678-0000-7000-8000-000000000000'),
					payload: {
						_tag: Messages.Timer.Events.DueTimeReached.Tag, // Wrong type
						reachedAt: now,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs: now, // Domain type: DateTime.Utc
					type: Messages.Timer.Events.DueTimeReached.Tag,
				}

				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(() =>
						Effect.sync(() => {
							handlerCalled = true
						}),
					)

					// Assert - handler should NOT be called for wrong message type
					expect(handlerCalled).toBe(false)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should pass correlationId undefined when not present', () => {
				let receivedCorrelationId: CorrelationId.Type | undefined = 'not-set' as CorrelationId.Type

				const now = DateTime.unsafeNow()
				const dueAt = DateTime.add(now, { minutes: 5 })

				const envelope: MessageEnvelope.Type = {
					aggregateId: Option.none(),
					causationId: Option.none(),
					correlationId: Option.none(),
					// No correlationId
					id: EnvelopeId.make('12345678-0000-7000-8000-000000000000'),
					payload: {
						_tag: Messages.Orchestration.Commands.ScheduleTimer.Tag,
						dueAt,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs: now,
					type: Messages.Orchestration.Commands.ScheduleTimer.Tag,
				}

				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(_command =>
						Effect.gen(function* () {
							// Extract metadata from context (provisioned by adapter)
							const metadata = yield* MessageMetadata
							receivedCorrelationId = Option.getOrUndefined(metadata.correlationId)
						}),
					)

					// Assert
					expect(receivedCorrelationId).toBeUndefined()
				}).pipe(Effect.provide(TimerEventBusLive))
			})
		})

		describe('Error Handling', () => {
			it.effect('should propagate handler errors', () => {
				const now = DateTime.unsafeNow()
				const dueAt = DateTime.add(now, { minutes: 5 })

				const envelope: MessageEnvelope.Type = {
					aggregateId: Option.none(),
					causationId: Option.none(),
					correlationId: Option.none(),
					id: EnvelopeId.make('12345678-0000-7000-8000-000000000000'),
					payload: {
						_tag: Messages.Orchestration.Commands.ScheduleTimer.Tag,
						dueAt,
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs: now,
					type: Messages.Orchestration.Commands.ScheduleTimer.Tag,
				}

				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					const result = yield* Effect.either(
						timerEventBus.subscribeToScheduleTimerCommands(() => Effect.fail(new Error('Handler processing failed'))),
					)

					// Assert
					expect(Either.isLeft(result)).toBe(true)
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			// TODO: This test is no longer relevant after removing decode logic from adapter
			// The EventBusPort (platform layer) is now responsible for decoding/validation
			// The TimerEventBus adapter assumes it receives valid, decoded envelopes
			it.skip('should map decode errors to SubscribeError', () => {
				const now = DateTime.unsafeNow()

				// Invalid payload (missing required fields)
				const envelope = {
					id: EnvelopeId.make('12345678-0000-7000-8000-000000000000'),
					payload: {
						_tag: Messages.Orchestration.Commands.ScheduleTimer.Tag,
						// Missing dueAt, tenantId, serviceCallId
					},
					tenantId,
					timestampMs: now,
					type: Messages.Orchestration.Commands.ScheduleTimer.Tag,
				} as MessageEnvelope.Type

				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('SubscribeError')
					}
				}).pipe(Effect.provide(TimerEventBusLive))
			})

			it.effect('should propagate SubscribeError from EventBusPort', () => {
				const EventBusTest = Layer.mock(Ports.EventBusPort, {
					subscribe: () => Effect.fail(new Ports.SubscribeError({ cause: 'Consumer creation failed' })),
				})

				const TimerEventBusLive = Layer.provide(
					AdaptersTimer.TimerEventBus.Live,
					Layer.merge(EventBusTest, BaseTestLayers),
				)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* Ports.TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('SubscribeError')
					}
				}).pipe(Effect.provide(TimerEventBusLive))
			})
		})
	})

	describe('Layer Composition', () => {
		it.effect('should require EventBusPort dependency', () => {
			// This test verifies that TimerEventBus.Live requires EventBusPort
			// If we try to use it without providing EventBusPort, it should fail at compile time
			// At runtime, we verify it works when EventBusPort is provided

			const EventBusTest = Layer.mock(Ports.EventBusPort, {
				publish: () => Effect.void,
				subscribe: () => Effect.never,
			})

			const TimerEventBusLive = Layer.provide(
				AdaptersTimer.TimerEventBus.Live,
				Layer.merge(EventBusTest, BaseTestLayers),
			)

			return Effect.gen(function* () {
				const timerEventBus = yield* Ports.TimerEventBusPort

				expect(timerEventBus).toBeDefined()
				expect(timerEventBus.publishDueTimeReached).toBeDefined()
				expect(timerEventBus.subscribeToScheduleTimerCommands).toBeDefined()
			}).pipe(Effect.provide(TimerEventBusLive))
		})

		it.effect('should integrate with UUID7 service', () => {
			const publishedEnvelopes: MessageEnvelope.Type[] = []

			const EventBusTest = Layer.mock(Ports.EventBusPort, {
				publish: envelopes =>
					Effect.sync(() => {
						publishedEnvelopes.push(...envelopes)
					}),
				subscribe: () => Effect.never,
			})

			const TimerEventBusLive = Layer.provide(
				AdaptersTimer.TimerEventBus.Live,
				Layer.merge(EventBusTest, BaseTestLayers),
			)

			return Effect.gen(function* () {
				const now = DateTime.unsafeNow()

				const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
					reachedAt: now,
					serviceCallId,
					tenantId,
				})

				// Act
				const timerEventBus = yield* Ports.TimerEventBusPort
				yield* timerEventBus
					.publishDueTimeReached(dueTimeReachedEvent)
					.pipe(Effect.provideService(MessageMetadata, { causationId: Option.none(), correlationId: Option.none() }))

				// Assert - envelope ID should be valid UUID7
				expect(publishedEnvelopes).toHaveLength(1)
				const envelopeId = publishedEnvelopes[0]?.id
				assert(envelopeId !== undefined)
				expect(envelopeId).toMatch(UUID7Regex)
			}).pipe(Effect.provide(TimerEventBusLive))
		})
	})
})
