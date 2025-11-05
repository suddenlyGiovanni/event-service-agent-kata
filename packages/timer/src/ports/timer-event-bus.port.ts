// packages/timer/src/ports/timer-event-bus.port.ts

import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { MessageMetadata } from '@event-service-agent/platform/context'
import type * as Ports from '@event-service-agent/platform/ports'
import type * as Messages from '@event-service-agent/schemas/messages'

/**
 * TimerEventBusPort - Timer module's complete EventBus contract
 *
 * Represents ALL EventBus capabilities Timer needs:
 * 1. Publish DueTimeReached events (polling workflow)
 * 2. Subscribe to ScheduleTimer commands (command handler)
 *
 * Abstracts Timer-specific concerns (envelopes, topics, parsing)
 * from workflows and handlers. Domain code works with commands/events,
 * not infrastructure primitives.
 *
 * **Design Pattern**: Port accepts pure domain events (DueTimeReached.Type),
 * adapter wraps in MessageEnvelope and delegates to EventBusPort. Enables domain purity
 * while maintaining transactional publishing (outbox pattern deferred to ADR-0008).
 *
 * @see docs/design/hexagonal-architecture-layers.md#event-publishing-pattern
 */
export interface TimerEventBusPort {
	/**
	 * Publish DueTimeReached domain event when timer fires
	 *
	 * Used by: pollDueTimersWorkflow
	 *
	 * **Pattern**: Workflow constructs pure domain event, port publishes it.
	 * Workflow provisions MessageMetadata Context with correlationId/causationId.
	 *
	 * Adapter responsibilities:
	 * - Extract MessageMetadata from Effect Context (yield* MessageMetadata)
	 * - Wrap event in MessageEnvelope with generated EnvelopeId
	 * - Extract tenantId/serviceCallId/reachedAt for routing/metadata
	 * - Populate correlationId/causationId from MessageMetadata Context
	 * - Delegate to `EventBusPort.publish([envelope])`
	 *
	 * **Type Safety**: R parameter requires MessageMetadata, enforcing context
	 * provisioning at workflow level. Missing context = compile error.
	 *
	 * @param event - Pure domain event {@link DueTimeReached.Type} with all domain fields
	 * @returns Effect that succeeds when event is published
	 * @throws PublishError - When broker publish fails
	 * @requires MessageMetadata - Context providing correlationId/causationId
	 *
	 * @example
	 * ```typescript
	 * // Workflow provisions context
	 * yield* eventBus.publishDueTimeReached(event).pipe(
	 *   Effect.provideService(MessageMetadata, {
	 *     correlationId: timer.correlationId,
	 *     causationId: Option.none()
	 *   })
	 * )
	 * ```
	 */
	readonly publishDueTimeReached: (
		event: Messages.Timer.Events.DueTimeReached.Type,
	) => Effect.Effect<void, Ports.PublishError, MessageMetadata>

	/**
	 * Subscribe to ScheduleTimer commands from Orchestration
	 *
	 * Used by: Command Handler
	 *
	 * **Pattern**: Adapter extracts envelope metadata (correlationId, causationId)
	 * and provisions MessageMetadata Context for handler. Handler receives pure
	 * command and extracts metadata from context when needed.
	 *
	 * Adapter responsibilities:
	 * - Subscribe to timer.commands topic
	 * - Parse and validate {@link MessageEnvelope}
	 * - Extract command from payload
	 * - Provision MessageMetadata Context with envelope metadata:
	 *   - correlationId: From envelope (upstream correlation)
	 *   - causationId: envelope.id (this command envelope is the cause)
	 * - Delegate to handler with pure command
	 * - Map errors (parse errors, subscription errors)
	 *
	 * Handler responsibilities:
	 * - Receive pure command (no infrastructure metadata in signature)
	 * - Extract MessageMetadata from context: `yield* MessageMetadata`
	 * - Use correlationId for timer aggregate
	 * - Use causationId when publishing events (tracks "which command triggered this")
	 *
	 * **Type Safety**: Handler R parameter requires MessageMetadata, but adapter
	 * provisions it, so handler implementer doesn't manage provisioning.
	 *
	 * @param handler - Effect to process each command (invokes scheduleTimerWorkflow)
	 * @returns Effect that runs indefinitely, processing commands
	 * @throws SubscribeError - When subscription setup fails
	 * @throws E - When handler fails (propagated for error handling)
	 *
	 * @example
	 * ```typescript
	 * // Command Handler usage
	 * yield* eventBus.subscribeToScheduleTimerCommands(command =>
	 *   Effect.gen(function* () {
	 *     // Extract metadata from context (provisioned by adapter)
	 *     const metadata = yield* MessageMetadata
	 *
	 *     // Use correlationId for timer aggregate
	 *     yield* scheduleTimerWorkflow({
	 *       command,
	 *       correlationId: metadata.correlationId
	 *     })
	 *   })
	 * )
	 * ```
	 */
	readonly subscribeToScheduleTimerCommands: <E, R>(
		handler: (
			command: Messages.Orchestration.Commands.ScheduleTimer.Type,
		) => Effect.Effect<void, E, R | MessageMetadata>,
	) => Effect.Effect<void, Ports.SubscribeError | E, R>
}

export const TimerEventBusPort = Context.GenericTag<TimerEventBusPort>('@event-service-agent/timer/TimerEventBusPort')
