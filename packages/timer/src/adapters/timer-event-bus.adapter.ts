/** biome-ignore-all lint/style/useNamingConvention: Effect Layer pattern uses PascalCase for static layer properties */
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import { PublishError } from '@event-service-agent/platform/ports'
import { Topics } from '@event-service-agent/platform/routing'
import { UUID7 } from '@event-service-agent/platform/uuid7'
import { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { type CorrelationId, EnvelopeId } from '@event-service-agent/schemas/shared'

import type { TimerEntry } from '../domain/timer-entry.domain.ts'
import { EventBusPort, TimerEventBusPort } from '../ports/index.ts'

export class TimerEventBus {
	/**
	 * Live adapter implementation that composes over shared EventBusPort
	 *
	 * Layer requirements:
	 * - EventBusPort: Shared broker abstraction
	 * - UUID7: Service for generating validated EnvelopeId
	 */
	static readonly Live: Layer.Layer<TimerEventBusPort, never, EventBusPort> = Layer.effect(
		TimerEventBusPort,
		Effect.gen(function* () {
			const sharedBus = yield* EventBusPort

			return TimerEventBusPort.of({
				publishDueTimeReached: Effect.fn('Timer.publishDueTimeReached')(function* (
					scheduledTimer: TimerEntry.ScheduledTimer,
					firedAt: DateTime.Utc,
				) {
					const { tenantId, correlationId, serviceCallId } = scheduledTimer

					/**
					 * Build DueTimeReached event with DateTime.Utc (domain type)
					 * Schema will handle DateTime → ISO8601 string transformation during encoding
					 */
					const dueTimeReached = new Messages.Timer.Events.DueTimeReached({
						reachedAt: Option.some(firedAt), // Wrap in Option for proper semantics
						serviceCallId,
						tenantId,
					}) /**
					 * Build envelope with generated EnvelopeId
					 * Provide UUID7 service locally to eliminate from requirements
					 */
					const envelopeId: EnvelopeId.Type = yield* EnvelopeId.makeUUID7().pipe(
						Effect.provide(UUID7.Default), // TODO: move the UUID7 requirement to another layer?
						Effect.mapError(
							parseError =>
								new PublishError({
									cause: `Failed to generate EnvelopeId: ${parseError}`,
								}),
						),
					)

					/**
					 * Build self-contained envelope with all routing metadata
					 *
					 * No separate context needed - envelope contains:
					 * - tenantId: For multi-tenancy and routing (required)
					 * - correlationId: For distributed tracing (optional - autonomous events may lack this)
					 * - aggregateId: ServiceCallId for per-aggregate ordering (preserves partition key)
					 * - timestampMs: Event occurrence time (DateTime.Utc, encodes to epoch milliseconds)
					 */
					const envelope = new MessageEnvelope({
						aggregateId: Option.some(serviceCallId), // Preserve tenant+serviceCall partition key for ordering
						causationId: Option.none(), // No causation tracking for autonomous timer events
						correlationId, // Already Option<CorrelationId> from scheduledTimer
						id: envelopeId,
						payload: dueTimeReached,
						tenantId,
						timestampMs: firedAt,
						type: Messages.Timer.Events.DueTimeReached.Tag,
					}) // Delegate to shared bus - envelope is self-contained!
					yield* sharedBus.publish([envelope])
				}),

				subscribeToScheduleTimerCommands: Effect.fn('Timer.subscribeToScheduleTimerCommands')(function* <E, R>(
					handler: (
						command: Messages.Orchestration.Commands.ScheduleTimer.Type,
						correlationId?: CorrelationId.Type,
					) => Effect.Effect<void, E, R>,
				) {
					yield* sharedBus.subscribe([Topics.Timer.Commands], envelope =>
						MessageEnvelope.matchPayload(envelope).pipe(
							Match.tag(Messages.Orchestration.Commands.ScheduleTimer.Tag, command =>
								handler(command, Option.getOrUndefined(envelope.correlationId)),
							),
							Match.orElse(() =>
								Effect.logDebug('Ignoring non-ScheduleTimer message', {
									receivedType: envelope.type,
								}),
							),
						),
					)
				}),
			})
		}),
	)
}
