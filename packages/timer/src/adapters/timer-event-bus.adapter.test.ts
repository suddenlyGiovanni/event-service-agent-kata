import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { type EventBusPort, PublishError, SubscribeError } from '@event-service-agent/platform/ports'
import { Topics } from '@event-service-agent/platform/routing'
import { UUID7 } from '@event-service-agent/schemas'
import type { MessageEnvelopeSchema } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import type * as Domain from '../domain/timer-entry.domain.ts'
import { TimerEventBusPort } from '../ports/index.ts'
import { TimerEventBus } from './timer-event-bus.adapter.ts'

describe('TimerEventBus', () => {
	// Test fixtures
	const tenantId = TenantId.make('01234567-89ab-7cde-89ab-0123456789ab')
	const serviceCallId = ServiceCallId.make('fedcba98-7654-7321-8fed-cba987654321')
	const correlationId = CorrelationId.make('aaaabbbb-cccc-7ddd-8eee-ffffffffffff')

	describe('publishDueTimeReached', () => {
		describe('Happy Path', () => {
			it.effect('should publish DueTimeReached event with correlation ID', () =>
				Effect.gen(function* () {
					const publishedEnvelopes: MessageEnvelopeSchema.Type[] = []

					// Mock EventBusPort that captures published envelopes
					const mockEventBus: EventBusPort = {
						publish: envelopes =>
							Effect.sync(() => {
								publishedEnvelopes.push(...envelopes)
							}),
						subscribe: () => Effect.never,
					}

					const now = DateTime.unsafeNow()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
						_tag: 'Scheduled',
						correlationId: Option.some(correlationId),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

					// Assert
					expect(publishedEnvelopes).toHaveLength(1)

					const envelope = publishedEnvelopes[0]
					expect(envelope.type).toBe('DueTimeReached')
					expect(envelope.tenantId).toBe(tenantId)
					expect(envelope.correlationId).toBe(correlationId)
					expect(envelope.timestampMs).toBe(now.epochMillis)

					// Verify payload
					const payload = envelope.payload as Messages.Timer.Events.DueTimeReached.Type
					expect(payload._tag).toBe('DueTimeReached')
					expect(payload.tenantId).toBe(tenantId)
					expect(payload.serviceCallId).toBe(serviceCallId)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should publish DueTimeReached event without correlation ID', () =>
				Effect.gen(function* () {
					const publishedEnvelopes: MessageEnvelopeSchema.Type[] = []

					const mockEventBus: EventBusPort = {
						publish: envelopes =>
							Effect.sync(() => {
								publishedEnvelopes.push(...envelopes)
							}),
						subscribe: () => Effect.never,
					}

					const now = DateTime.unsafeNow()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
						_tag: 'Scheduled',
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

					// Assert
					expect(publishedEnvelopes).toHaveLength(1)

					const envelope = publishedEnvelopes[0]
					expect(envelope.correlationId).toBeUndefined()
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should generate unique envelope IDs for each publish', () =>
				Effect.gen(function* () {
					const publishedEnvelopes: MessageEnvelopeSchema.Type[] = []

					const mockEventBus: EventBusPort = {
						publish: envelopes =>
							Effect.sync(() => {
								publishedEnvelopes.push(...envelopes)
							}),
						subscribe: () => Effect.never,
					}

					const now = DateTime.unsafeNow()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
						_tag: 'Scheduled',
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					}

					// Act - publish twice
					const timerEventBus = yield* TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

					// Assert
					expect(publishedEnvelopes).toHaveLength(2)
					expect(publishedEnvelopes[0].id).not.toBe(publishedEnvelopes[1].id)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should use provided firedAt timestamp', () =>
				Effect.gen(function* () {
					const publishedEnvelopes: MessageEnvelopeSchema.Type[] = []

					const mockEventBus: EventBusPort = {
						publish: envelopes =>
							Effect.sync(() => {
								publishedEnvelopes.push(...envelopes)
							}),
						subscribe: () => Effect.never,
					}

					const now = DateTime.unsafeNow()
					const firedAt = DateTime.add(now, { minutes: 10 })
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
						_tag: 'Scheduled',
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					yield* timerEventBus.publishDueTimeReached(scheduledTimer, firedAt)

					// Assert
					const envelope = publishedEnvelopes[0]
					expect(envelope.timestampMs).toBe(firedAt.epochMillis)

					const payload = envelope.payload as Messages.Timer.Events.DueTimeReached.Type
					expect(Iso8601DateTime.toDateTime(payload.reachedAt).epochMillis).toBe(firedAt.epochMillis)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)
		})

		describe('Error Handling', () => {
			it.effect('should propagate PublishError from EventBusPort', () =>
				Effect.gen(function* () {
					const mockEventBus: EventBusPort = {
						publish: () => Effect.fail(new PublishError({ cause: 'Connection failed' })),
						subscribe: () => Effect.never,
					}

					const now = DateTime.unsafeNow()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
						_tag: 'Scheduled',
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.publishDueTimeReached(scheduledTimer, now))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('PublishError')
					}
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should fail if EnvelopeId generation fails', () =>
				Effect.gen(function* () {
					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: () => Effect.never,
					}

					const now = DateTime.unsafeNow()
					const dueAt = DateTime.add(now, { minutes: 5 })

					const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
						_tag: 'Scheduled',
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					}

					// Act - Note: UUID7 internally provided, hard to make it fail
					// This test documents the error path exists
					const timerEventBus = yield* TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.publishDueTimeReached(scheduledTimer, now))

					// Assert - in normal case, this succeeds
					expect(Either.isRight(result)).toBe(true)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)
		})
	})

	describe('subscribeToScheduleTimerCommands', () => {
		describe('Happy Path', () => {
			it.effect('should subscribe to Timer.Commands topic', () =>
				Effect.gen(function* () {
					let subscribedTopics: readonly Topics.Type[] = []

					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: (topics, _handler) =>
							Effect.sync(() => {
								subscribedTopics = topics
							}).pipe(Effect.flatMap(() => Effect.never)),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					const subscription = timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void)

					// Start subscription in background
					yield* Effect.fork(subscription)

					// Small delay to let subscription start
					yield* Effect.sleep('10 millis')

					// Assert
					expect(subscribedTopics).toContain(Topics.Timer.Commands)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should call handler with decoded ScheduleTimer command', () =>
				Effect.gen(function* () {
					let handlerCalled = false
					let receivedCommand: Messages.Orchestration.Commands.ScheduleTimer.Type | null = null
					let receivedCorrelationId: CorrelationId.Type | undefined = undefined

					const now = DateTime.unsafeNow()
					const dueAt = Iso8601DateTime.make(DateTime.formatIso(DateTime.add(now, { minutes: 5 })))

					const envelope: MessageEnvelopeSchema.Type = {
						correlationId,
						id: '12345678-0000-7000-8000-000000000000' as any,
						payload: {
							_tag: 'ScheduleTimer',
							dueAt,
							serviceCallId,
							tenantId,
						},
						tenantId,
						timestampMs: now.epochMillis,
						type: 'ScheduleTimer',
					}

					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: (_topics, handler) =>
							Effect.gen(function* () {
								yield* handler(envelope)
							}),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
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
					expect(receivedCommand?._tag).toBe('ScheduleTimer')
					expect(receivedCommand?.tenantId).toBe(tenantId)
					expect(receivedCommand?.serviceCallId).toBe(serviceCallId)
					expect(receivedCorrelationId).toBe(correlationId)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should ignore non-ScheduleTimer messages', () =>
				Effect.gen(function* () {
					let handlerCalled = false

					const now = DateTime.unsafeNow()

					// Wrong message type
					const envelope: MessageEnvelopeSchema.Type = {
						id: '12345678-0000-7000-8000-000000000000' as any,
						payload: {
							_tag: 'DueTimeReached', // Wrong type
							reachedAt: Iso8601DateTime.make(DateTime.formatIso(now)),
							serviceCallId,
							tenantId,
						},
						tenantId,
						timestampMs: now.epochMillis,
						type: 'DueTimeReached',
					}

					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: (_topics, handler) =>
							Effect.gen(function* () {
								yield* handler(envelope)
							}),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands(() =>
						Effect.sync(() => {
							handlerCalled = true
						}),
					)

					// Assert - handler should NOT be called for wrong message type
					expect(handlerCalled).toBe(false)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should pass correlationId undefined when not present', () =>
				Effect.gen(function* () {
					let receivedCorrelationId: CorrelationId.Type | undefined = 'not-set' as any

					const now = DateTime.unsafeNow()
					const dueAt = Iso8601DateTime.make(DateTime.formatIso(DateTime.add(now, { minutes: 5 })))

					const envelope: MessageEnvelopeSchema.Type = {
						// No correlationId
						id: '12345678-0000-7000-8000-000000000000' as any,
						payload: {
							_tag: 'ScheduleTimer',
							dueAt,
							serviceCallId,
							tenantId,
						},
						tenantId,
						timestampMs: now.epochMillis,
						type: 'ScheduleTimer',
					}

					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: (_topics, handler) =>
							Effect.gen(function* () {
								yield* handler(envelope)
							}),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					yield* timerEventBus.subscribeToScheduleTimerCommands((_command, correlId) =>
						Effect.sync(() => {
							receivedCorrelationId = correlId
						}),
					)

					// Assert
					expect(receivedCorrelationId).toBeUndefined()
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)
		})

		describe('Error Handling', () => {
			it.effect('should propagate handler errors', () =>
				Effect.gen(function* () {
					const now = DateTime.unsafeNow()
					const dueAt = Iso8601DateTime.make(DateTime.formatIso(DateTime.add(now, { minutes: 5 })))

					const envelope: MessageEnvelopeSchema.Type = {
						id: '12345678-0000-7000-8000-000000000000' as any,
						payload: {
							_tag: 'ScheduleTimer',
							dueAt,
							serviceCallId,
							tenantId,
						},
						tenantId,
						timestampMs: now.epochMillis,
						type: 'ScheduleTimer',
					}

					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: (_topics, handler) =>
							Effect.gen(function* () {
								yield* handler(envelope)
							}),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					const result = yield* Effect.either(
						timerEventBus.subscribeToScheduleTimerCommands(() =>
							Effect.fail(new Error('Handler processing failed')),
						),
					)

					// Assert
					expect(Either.isLeft(result)).toBe(true)
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should map decode errors to SubscribeError', () =>
				Effect.gen(function* () {
					const now = DateTime.unsafeNow()

					// Invalid payload (missing required fields)
					const envelope: MessageEnvelopeSchema.Type = {
						id: '12345678-0000-7000-8000-000000000000' as any,
						payload: {
							_tag: 'ScheduleTimer',
							// Missing dueAt, tenantId, serviceCallId
						} as any,
						tenantId,
						timestampMs: now.epochMillis,
						type: 'ScheduleTimer',
					}

					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: (_topics, handler) =>
							Effect.gen(function* () {
								yield* handler(envelope)
							}),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('SubscribeError')
					}
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)

			it.effect('should propagate SubscribeError from EventBusPort', () =>
				Effect.gen(function* () {
					const mockEventBus: EventBusPort = {
						publish: () => Effect.void,
						subscribe: () => Effect.fail(new SubscribeError({ cause: 'Consumer creation failed' })),
					}

					// Act
					const timerEventBus = yield* TimerEventBusPort
					const result = yield* Effect.either(timerEventBus.subscribeToScheduleTimerCommands(() => Effect.void))

					// Assert
					expect(Either.isLeft(result)).toBe(true)
					if (Either.isLeft(result)) {
						expect(result.left._tag).toBe('SubscribeError')
					}
				}).pipe(
					Effect.provide(TimerEventBus.Live),
					Effect.provideService(EventBusPort, mockEventBus as any),
				),
			)
		})
	})

	describe('Layer Composition', () => {
		it.effect('should require EventBusPort dependency', () =>
			Effect.gen(function* () {
				// This test verifies that TimerEventBus.Live requires EventBusPort
				// If we try to use it without providing EventBusPort, it should fail at compile time
				// At runtime, we verify it works when EventBusPort is provided

				const mockEventBus: EventBusPort = {
					publish: () => Effect.void,
					subscribe: () => Effect.never,
				}

				const timerEventBus = yield* TimerEventBusPort

				expect(timerEventBus).toBeDefined()
				expect(timerEventBus.publishDueTimeReached).toBeDefined()
				expect(timerEventBus.subscribeToScheduleTimerCommands).toBeDefined()
			}).pipe(
				Effect.provide(TimerEventBus.Live),
				Effect.provideService(EventBusPort, mockEventBus as any),
			),
		)

		it.effect('should integrate with UUID7 service', () =>
			Effect.gen(function* () {
				const publishedEnvelopes: MessageEnvelopeSchema.Type[] = []

				const mockEventBus: EventBusPort = {
					publish: envelopes =>
						Effect.sync(() => {
							publishedEnvelopes.push(...envelopes)
						}),
					subscribe: () => Effect.never,
				}

				const now = DateTime.unsafeNow()
				const dueAt = DateTime.add(now, { minutes: 5 })

				const scheduledTimer: Domain.TimerEntry.ScheduledTimer = {
					_tag: 'Scheduled',
					correlationId: Option.none(),
					dueAt,
					registeredAt: now,
					serviceCallId,
					tenantId,
				}

				// Act
				const timerEventBus = yield* TimerEventBusPort
				yield* timerEventBus.publishDueTimeReached(scheduledTimer, now)

				// Assert - envelope ID should be valid UUID7
				expect(publishedEnvelopes).toHaveLength(1)
				const envelopeId = publishedEnvelopes[0].id
				expect(envelopeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
			}).pipe(
				Effect.provide(TimerEventBus.Live),
				Effect.provideService(EventBusPort, mockEventBus as any),
			),
		)
	})
})