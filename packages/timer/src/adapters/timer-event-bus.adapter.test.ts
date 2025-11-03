import { assert, describe, expect, expectTypeOf, it } from '@effect/vitest'
import { assertEquals, assertNone } from '@effect/vitest/utils'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import * as PortsPlatform from '@event-service-agent/platform/ports'
import { Topics } from '@event-service-agent/platform/routing'
import type { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { CorrelationId, EnvelopeId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Domain from '../domain/timer-entry.domain.ts'
import * as PortsTimer from '../ports/index.ts'
import * as AdaptersTimer from './index.ts'

describe('TimerEventBus', () => {
	// Test fixtures
	const tenantId = TenantId.make('01234567-89ab-7cde-89ab-0123456789ab')
	const serviceCallId = ServiceCallId.make('fedcba98-7654-7321-8fed-cba987654321')
	const correlationId = CorrelationId.make('aaaabbbb-cccc-7ddd-8eee-ffffffffffff')

	describe('publishDueTimeReached', () => {
		describe('Happy Path', () => {
			it.effect('should publish DueTimeReached event with correlation ID', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<PortsPlatform.EventBusPort, never, never> = Layer.mock(
					PortsPlatform.EventBusPort,
					{
						publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
					},
				)

				const TestLayers = Layer.merge(
					Layer.provide(AdaptersTimer.TimerEventBus.Live, EventBusTest),
					AdaptersTimer.ClockPortLive,
				)

				return Effect.gen(function* () {
					const clock = yield* PortsTimer.ClockPort
					const now = yield* clock.now()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer = new Domain.ScheduledTimer({
						correlationId: Option.some(correlationId),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

					// Assert
					expect(publishedEnvelopes).toHaveLength(1)

					const envelope = publishedEnvelopes[0]

					assert(envelope !== undefined)

					expect(envelope.type).toBe(Messages.Timer.Events.DueTimeReached.Tag)
					expect(envelope.tenantId).toBe(tenantId)
					assertEquals(envelope.correlationId, Option.some(correlationId))
					// timestampMs is now DateTime.Utc (compare via DateTime.Equivalence)
					expect(DateTime.Equivalence(envelope.timestampMs, now)).toBe(true) // Verify payload
					const payload = envelope.payload
					assert(payload._tag === Messages.Timer.Events.DueTimeReached.Tag)
					expectTypeOf(payload).toEqualTypeOf<Messages.Timer.Events.DueTimeReached.Type>()
					expect(payload._tag).toBe(Messages.Timer.Events.DueTimeReached.Tag)
					expect(payload.tenantId).toBe(tenantId)
					expect(payload.serviceCallId).toBe(serviceCallId)
				}).pipe(Effect.provide(TestLayers))
			})

			it.effect('should publish DueTimeReached event without correlation ID', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<PortsPlatform.EventBusPort, never, never> = Layer.mock(
					PortsPlatform.EventBusPort,
					{
						publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
					},
				)

				const TestLayers = Layer.merge(
					Layer.provide(AdaptersTimer.TimerEventBus.Live, EventBusTest),
					AdaptersTimer.ClockPortLive,
				)

				return Effect.gen(function* () {
					const clock = yield* PortsTimer.ClockPort
					const now = yield* clock.now()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer = new Domain.ScheduledTimer({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

					// Assert
					expect(publishedEnvelopes).toHaveLength(1)

					const envelope = publishedEnvelopes[0]
					assert(envelope !== undefined)
					assertNone(envelope.correlationId)
				}).pipe(Effect.provide(TestLayers))
			})

			it.effect('should generate unique envelope IDs for each publish', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<PortsPlatform.EventBusPort, never, never> = Layer.mock(
					PortsPlatform.EventBusPort,
					{
						publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
					},
				)

				const TestLayers = Layer.merge(
					Layer.provide(AdaptersTimer.TimerEventBus.Live, EventBusTest),
					AdaptersTimer.ClockPortLive,
				)

				return Effect.gen(function* () {
					const clock = yield* PortsTimer.ClockPort
					const now = yield* clock.now()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer = new Domain.ScheduledTimer({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act - publish twice
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

					// Assert
					expect(publishedEnvelopes).toHaveLength(2)
					const firstEnvelope = publishedEnvelopes[0]
					const secondEnvelope = publishedEnvelopes[1]
					assert(firstEnvelope !== undefined)
					assert(secondEnvelope !== undefined)
					expect(firstEnvelope.id).not.toBe(secondEnvelope.id)
				}).pipe(Effect.provide(TestLayers))
			})

			it.effect('should use provided firedAt timestamp', () => {
				const publishedEnvelopes: MessageEnvelope.Type[] = []

				const EventBusTest: Layer.Layer<PortsPlatform.EventBusPort, never, never> = Layer.mock(
					PortsPlatform.EventBusPort,
					{
						publish: envelopes => Effect.sync(() => publishedEnvelopes.push(...envelopes)),
					},
				)

				const TestLayers = Layer.merge(
					Layer.provide(AdaptersTimer.TimerEventBus.Live, EventBusTest),
					AdaptersTimer.ClockPortLive,
				)

				return Effect.gen(function* () {
					const clock = yield* PortsTimer.ClockPort
					const now = yield* clock.now()
					const firedAt = DateTime.add(now, { minutes: 10 })
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer = new Domain.ScheduledTimer({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, firedAt)

					// Assert
					const envelope = publishedEnvelopes[0]
					assert(envelope !== undefined)
					// timestampMs is now DateTime.Utc (compare via DateTime.Equivalence)
					expect(DateTime.Equivalence(envelope.timestampMs, firedAt)).toBe(true)

					const payload = envelope.payload
					assert(payload._tag === Messages.Timer.Events.DueTimeReached.Tag)
					expect(Option.isSome(payload.reachedAt)).toBe(true)
					const reachedAtValue = Option.getOrThrow(payload.reachedAt)
					expect(DateTime.Equivalence(reachedAtValue, firedAt)).toBe(true)
				}).pipe(Effect.provide(TestLayers))
			})
		})

		describe('Error Handling', () => {
			it.effect('should propagate PublishError from EventBusPort', () => {
				const EventBusTest: Layer.Layer<PortsPlatform.EventBusPort, never, never> = Layer.mock(
					PortsPlatform.EventBusPort,
					{
						publish: () => Effect.fail(new PortsPlatform.PublishError({ cause: 'Connection failed' })),
					},
				)

				const TestLayers = Layer.merge(
					Layer.provide(AdaptersTimer.TimerEventBus.Live, EventBusTest),
					AdaptersTimer.ClockPortLive,
				)

				return Effect.gen(function* () {
					const clock = yield* PortsTimer.ClockPort
					const now = yield* clock.now()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer = new Domain.ScheduledTimer({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.publishDueTimeReached(scheduledTimer, now))

					// Assert
					expect(Either.isLeft(result)).toBe(true)

					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('PublishError')
					}
				}).pipe(Effect.provide(TestLayers))
			})
		})
	})

	describe('subscribeToScheduleTimerCommands', () => {
		describe('Happy Path', () => {
			it.effect('should subscribe to Timer.Commands topic', () => {
				let subscribedTopics: readonly Topics.Type[] = []

				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: (topics, _handler) =>
						Effect.sync(() => {
							subscribedTopics = topics
						}),
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void)

					// Assert
					expect(subscribedTopics).toContain(Topics.Timer.Commands)
				}).pipe(Effect.provide(TestLayer))
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

				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands((command, correlId) =>
						Effect.sync(() => {
							handlerCalled = true
							receivedCommand = command
							receivedCorrelationId = correlId
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
				}).pipe(Effect.provide(TestLayer))
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
						reachedAt: Option.some(now),
						serviceCallId,
						tenantId,
					},
					tenantId,
					timestampMs: now, // Domain type: DateTime.Utc
					type: Messages.Timer.Events.DueTimeReached.Tag,
				}

				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(() =>
						Effect.sync(() => {
							handlerCalled = true
						}),
					)

					// Assert - handler should NOT be called for wrong message type
					expect(handlerCalled).toBe(false)
				}).pipe(Effect.provide(TestLayer))
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

				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands((_command, correlId) =>
						Effect.sync(() => {
							receivedCorrelationId = correlId
						}),
					)

					// Assert
					expect(receivedCorrelationId).toBeUndefined()
				}).pipe(Effect.provide(TestLayer))
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

				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					const result = yield* Effect.either(
						timerEventBus.subscribeToScheduleTimerCommands(() => Effect.fail(new Error('Handler processing failed'))),
					)

					// Assert
					expect(Either.isLeft(result)).toBe(true)
				}).pipe(Effect.provide(TestLayer))
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

				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: <E, R>(
						_topics: ReadonlyArray<Topics.Type>,
						handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
					) =>
						Effect.gen(function* () {
							yield* handler(envelope)
						}) as Effect.Effect<void, E, R>,
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('SubscribeError')
					}
				}).pipe(Effect.provide(TestLayer))
			})

			it.effect('should propagate SubscribeError from EventBusPort', () => {
				const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
					subscribe: () => Effect.fail(new PortsPlatform.SubscribeError({ cause: 'Consumer creation failed' })),
				})

				const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

				return Effect.gen(function* () {
					// Act
					const timerEventBus = yield* PortsTimer.TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('SubscribeError')
					}
				}).pipe(Effect.provide(TestLayer))
			})
		})
	})

	describe('Layer Composition', () => {
		it.effect('should require EventBusPort dependency', () => {
			// This test verifies that TimerEventBus.Live requires EventBusPort
			// If we try to use it without providing EventBusPort, it should fail at compile time
			// At runtime, we verify it works when EventBusPort is provided

			const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
				publish: () => Effect.void,
				subscribe: () => Effect.never,
			})

			const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

			return Effect.gen(function* () {
				const timerEventBus = yield* PortsTimer.TimerEventBusPort

				expect(timerEventBus).toBeDefined()
				expect(timerEventBus.publishDueTimeReached).toBeDefined()
				expect(timerEventBus.subscribeToScheduleTimerCommands).toBeDefined()
			}).pipe(Effect.provide(TestLayer))
		})

		it.effect('should integrate with UUID7 service', () => {
			const publishedEnvelopes: MessageEnvelope.Type[] = []

			const mockEventBus = Layer.mock(PortsPlatform.EventBusPort, {
				publish: envelopes =>
					Effect.sync(() => {
						publishedEnvelopes.push(...envelopes)
					}),
				subscribe: () => Effect.never,
			})

			const TestLayer = Layer.provide(AdaptersTimer.TimerEventBus.Live, mockEventBus)

			return Effect.gen(function* () {
				const now = DateTime.unsafeNow()
				const dueAt = DateTime.add(now, { minutes: 5 })

				const scheduledTimer = new Domain.ScheduledTimer({
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				})

				// Act
				const timerEventBus = yield* PortsTimer.TimerEventBusPort
				yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

				// Assert - envelope ID should be valid UUID7
				expect(publishedEnvelopes).toHaveLength(1)
				const envelopeId = publishedEnvelopes[0]?.id
				assert(envelopeId !== undefined)
				expect(envelopeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
			}).pipe(Effect.provide(TestLayer))
		})
	})
})
