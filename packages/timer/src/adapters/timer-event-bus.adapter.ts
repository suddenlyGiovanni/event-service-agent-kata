/** biome-ignore-all lint/style/useNamingConvention: Effect Layer pattern uses PascalCase for static layer properties */

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import { MessageMetadata } from '@event-service-agent/platform/context'
import { Topics } from '@event-service-agent/platform/routing'
import { UUID7 } from '@event-service-agent/platform/uuid7'
import { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import * as Messages from '@event-service-agent/schemas/messages'
import { EnvelopeId } from '@event-service-agent/schemas/shared'

import * as Ports from '../ports/index.ts'

/**
 * TimerEventBus — Adapter implementation for timer event publishing
 *
 * Wraps timer domain events in MessageEnvelope and publishes via EventBusPort. Generates envelope IDs and correlation
 * context for each published event.
 */
export class TimerEventBus {
	/**
	 * Live adapter implementation that composes over shared EventBusPort
	 *
	 * Layer requirements:
	 *
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

				const publishDueTimeReached = Effect.fn('Timer.publishDueTimeReached')(function* (
					dueTimeReached: Messages.Timer.Events.DueTimeReached.Type,
				) {
					/**
					 * Extract observability metadata from Effect Context
					 *
					 * MessageMetadata is provisioned by workflow with correlationId/causationId extracted from timer aggregate.
					 * This enables distributed tracing without polluting domain event types.
					 *
					 * Type-safe: Port signature requires MessageMetadata in R parameter, so missing context at workflow level
					 * causes compile error.
					 */
					const metadata = yield* MessageMetadata

					const envelopeId: EnvelopeId.Type = yield* EnvelopeId.makeUUID7().pipe(
						Effect.mapError(
							(parseError) =>
								new Ports.PublishError({
									cause: `Failed to generate EnvelopeId: ${parseError}`,
								}),
						),
						Effect.provideService(UUID7, uuid),
					)

					/**
					 * Annotate span with message-level metadata for distributed tracing
					 *
					 * Infrastructure-level annotations complement workflow's domain-level ones:
					 *
					 * - Workflow annotates: timer.dueAt, timer.serviceCallId, timer.tenantId
					 * - Adapter annotates: message.envelope.id, message.correlationId, message.causationId
					 *
					 * Enables span linking: envelope.id connects workflow span to downstream consumer spans
					 */
					yield* Effect.annotateCurrentSpan({
						'message.causationId': Option.getOrUndefined(metadata.causationId),
						'message.correlationId': Option.getOrUndefined(metadata.correlationId),
						'message.envelope.id': envelopeId,
						'message.type': dueTimeReached._tag,
					})

					const envelope: MessageEnvelope.Type = new MessageEnvelope({
						/**
						 * Preserve tenant+serviceCall partition key for ordering
						 */
						aggregateId: Option.some(dueTimeReached.serviceCallId),

						/**
						 * Extract causationId from MessageMetadata Context
						 *
						 * - Some(id): Event caused by specific parent message (command envelope ID)
						 * - None: Autonomous event (timer fired, no parent message)
						 */
						causationId: metadata.causationId,

						/**
						 * Extract correlationId from MessageMetadata Context
						 *
						 * Workflow provisions this from timer aggregate:
						 *
						 * - Some(id): Timer scheduled with correlationId (from HTTP request or parent workflow)
						 * - None: Timer scheduled without correlation context
						 *
						 * Enables distributed tracing across service boundaries.
						 */
						correlationId: metadata.correlationId,
						id: envelopeId,
						payload: dueTimeReached,
						tenantId: dueTimeReached.tenantId,

						/**
						 * Get current time for envelope timestamp (infrastructure timing) Distinct from payload.reachedAt (domain
						 * timing):
						 *
						 * - `timestampMs`: When message was created/published (now)
						 * - `reachedAt`: When timer became due (domain event time) Gap between them reveals publishing latency for
						 *   observability.
						 */
						timestampMs: yield* clock.now(),
						type: dueTimeReached._tag,
					})

					yield* eventBus.publish([envelope])

					/**
					 * Log successful publish with envelope details
					 *
					 * Infrastructure-level logging complements workflow's domain-level logs:
					 *
					 * - Workflow logs: "Timer fired successfully" (business event)
					 * - Adapter logs: "Published DueTimeReached event" (technical event)
					 *
					 * Enables debugging: verify exact metadata used at publish time
					 */
					yield* Effect.logDebug('Published DueTimeReached event', {
						causationId: Option.getOrUndefined(metadata.causationId),
						correlationId: Option.getOrUndefined(metadata.correlationId),
						envelopeId,
						serviceCallId: dueTimeReached.serviceCallId,
						tenantId: dueTimeReached.tenantId,
					})
				})

				const subscribeToScheduleTimerCommands = Effect.fn('Timer.subscribeToScheduleTimerCommands')(
					<E, R>(
						handler: (
							command: Messages.Orchestration.Commands.ScheduleTimer.Type,
							metadata: MessageMetadata.Type,
						) => Effect.Effect<void, E, R>,
					): Effect.Effect<void, Ports.SubscribeError | E, R> =>
						Effect.gen(function* () {
							/**
							 * Log subscription establishment
							 *
							 * One-time log when subscription is set up, showing which topics the Timer module is listening to for
							 * commands.
							 */
							yield* Effect.logInfo('Subscribed to ScheduleTimer commands', {
								topics: Topics.Timer.Commands,
							})

							yield* eventBus.subscribe([Topics.Timer.Commands], (envelope) =>
								MessageEnvelope.matchPayload(envelope).pipe(
									Match.tag(Messages.Orchestration.Commands.ScheduleTimer.Tag, (command) =>
										Effect.gen(function* () {
											/**
											 * Annotate span with inbound message metadata
											 *
											 * Infrastructure-level annotations for command reception (inbound):
											 *
											 * - Adapter annotates: message.envelope.id, message.correlationId (from upstream)
											 * - Handler annotates: domain-level command details
											 *
											 * Enables span linking: upstream service span → adapter span → handler span
											 */
											yield* Effect.annotateCurrentSpan({
												'message.causationId': Option.getOrUndefined(envelope.causationId),
												'message.correlationId': Option.getOrUndefined(envelope.correlationId),
												'message.envelope.id': envelope.id,
												'message.type': envelope.type,
											})

											/**
											 * Log command reception at adapter boundary
											 *
											 * Infrastructure-level logging for inbound commands:
											 *
											 * - Adapter logs: "Received ScheduleTimer command" (message arrived)
											 * - Handler logs: domain-level processing events
											 *
											 * Enables debugging: verify command arrived with correct correlationId
											 */
											yield* Effect.logDebug('Received ScheduleTimer command', {
												causationId: Option.getOrUndefined(envelope.causationId),
												correlationId: Option.getOrUndefined(envelope.correlationId),
												envelopeId: envelope.id,
												serviceCallId: command.serviceCallId,
												tenantId: command.tenantId,
											})

											yield* handler(command, {
												causationId: Option.some(envelope.id),
												correlationId: envelope.correlationId,
											})
										}),
									),
									Match.orElse(() =>
										Effect.logDebug('Ignoring non-ScheduleTimer message', {
											receivedType: envelope.type,
										}),
									),
								),
							)
						}),
				)

				return Ports.TimerEventBusPort.of({
					publishDueTimeReached,
					subscribeToScheduleTimerCommands,
				})
			}),
		)
}
