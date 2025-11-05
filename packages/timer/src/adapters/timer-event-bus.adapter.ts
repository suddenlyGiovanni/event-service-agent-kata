/** biome-ignore-all lint/style/useNamingConvention: Effect Layer pattern uses PascalCase for static layer properties */

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import { Topics } from '@event-service-agent/platform/routing'
import { UUID7 } from '@event-service-agent/platform/uuid7'
import { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { type CorrelationId, EnvelopeId } from '@event-service-agent/schemas/shared'

import * as Ports from '../ports/index.ts'

export class TimerEventBus {
	/**
	 * Live adapter implementation that composes over shared EventBusPort
	 *
	 * Layer requirements:
	 * - EventBusPort: Shared broker abstraction
	 * - UUID7: Service for generating validated EnvelopeId
	 */
	static readonly Live: Layer.Layer<Ports.TimerEventBusPort, never, Ports.EventBusPort | Ports.ClockPort | UUID7> =
		Layer.effect(
			Ports.TimerEventBusPort,
			Effect.gen(function* () {
				const eventBus = yield* Ports.EventBusPort
				const clock = yield* Ports.ClockPort
				const uuid = yield* UUID7

				return Ports.TimerEventBusPort.of({
					publishDueTimeReached: Effect.fn('Timer.publishDueTimeReached')(function* (
						dueTimeReached: Messages.Timer.Events.DueTimeReached.Type,
					) {
						const envelopeId: EnvelopeId.Type = yield* EnvelopeId.makeUUID7().pipe(
							Effect.mapError(
								parseError => new Ports.PublishError({ cause: `Failed to generate EnvelopeId: ${parseError}` }),
							),
							Effect.provideService(UUID7, uuid),
						)

						const envelope = new MessageEnvelope({
							/**
							 * Preserve tenant+serviceCall partition key for ordering
							 */
							aggregateId: Option.some(dueTimeReached.serviceCallId),

							/**
							 * No causation tracking for autonomous timer events
							 */
							causationId: Option.none(),

							/**
							 * Extract correlationId from...
							 * TODO: need to investigate where this comes from in pure domain event pattern
							 * 		 For now, we'll use Option.none() as the event doesn't carry correlationId
							 */
							correlationId: Option.none<CorrelationId.Type>(),
							id: envelopeId,
							payload: dueTimeReached,
							tenantId: dueTimeReached.tenantId,

							/**
							 * Get current time for envelope timestamp (infrastructure timing)
							 * Distinct from payload.reachedAt (domain timing):
							 * - timestampMs: When message was created/published (now)
							 * - reachedAt: When timer became due (domain event time)
							 * Gap between them reveals publishing latency for observability.
							 */
							timestampMs: yield* clock.now(),
							type: dueTimeReached._tag,
						})

						yield* eventBus.publish([envelope])
					}),

					subscribeToScheduleTimerCommands: Effect.fn('Timer.subscribeToScheduleTimerCommands')(function* <E, R>(
						handler: (
							command: Messages.Orchestration.Commands.ScheduleTimer.Type,
							correlationId?: CorrelationId.Type,
						) => Effect.Effect<void, E, R>,
					) {
						yield* eventBus.subscribe([Topics.Timer.Commands], envelope =>
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
