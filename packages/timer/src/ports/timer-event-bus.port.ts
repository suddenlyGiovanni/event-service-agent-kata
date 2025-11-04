// packages/timer/src/ports/timer-event-bus.port.ts

import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type * as Ports from '@event-service-agent/platform/ports'
import type * as Messages from '@event-service-agent/schemas/messages'
import type { CorrelationId } from '@event-service-agent/schemas/shared'

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
	 * Adapter responsibilities:
	 * - Wrap event in MessageEnvelope with generated EnvelopeId
	 * - Extract tenantId/serviceCallId/reachedAt for routing/metadata
	 * - Extract correlationId from timer aggregate (stored during schedule)
	 * - Delegate to EventBusPort.publish([envelope])
	 *
	 * @param event - Pure domain event (DueTimeReached.Type) with all domain fields
	 * @returns Effect that succeeds when event is published
	 * @throws PublishError - When broker publish fails
	 */
	readonly publishDueTimeReached: (
		event: Messages.Timer.Events.DueTimeReached.Type,
	) => Effect.Effect<void, Ports.PublishError>

	/**
	 * Subscribe to ScheduleTimer commands from Orchestration
	 *
	 * Used by: Command Handler (future - not PL-4.4)
	 *
	 * Handles:
	 * - Topic subscription ('timer.commands')
	 * - Envelope parsing and validation
	 * - Command extraction from payload
	 * - CorrelationId propagation
	 * - Error mapping (parse errors, subscription errors)
	 *
	 * Handler receives parsed, validated command (not raw envelope).
	 *
	 * @param handler - Effect to process each command (invokes scheduleTimerWorkflow)
	 * @returns Effect that runs indefinitely, processing commands
	 * @throws SubscribeError - When subscription setup fails
	 * @throws E - When handler fails (propagated for error handling)
	 *
	 * @example
	 * ```typescript
	 * // Command Handler usage (future)
	 * yield* eventBus.subscribeToScheduleTimerCommands((command, correlationId) =>
	 *   scheduleTimerWorkflow({ command, correlationId })
	 * )
	 * ```
	 */
	readonly subscribeToScheduleTimerCommands: <E, R>(
		handler: (
			command: Messages.Orchestration.Commands.ScheduleTimer.Type,
			correlationId?: CorrelationId.Type,
		) => Effect.Effect<void, E, R>,
	) => Effect.Effect<void, Ports.SubscribeError | E, R>
}

export const TimerEventBusPort = Context.GenericTag<TimerEventBusPort>('@event-service-agent/timer/TimerEventBusPort')
