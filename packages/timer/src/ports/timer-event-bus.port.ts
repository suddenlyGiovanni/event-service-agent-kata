// packages/timer/src/ports/timer-event-bus.port.ts

import * as Context from 'effect/Context'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'

import type * as Messages from '@event-service-agent/contracts/messages'
import type { PublishError, SubscribeError } from '@event-service-agent/contracts/ports'
import type { CorrelationId } from '@event-service-agent/schemas/shared'

import type { TimerEntry } from '../domain/timer-entry.domain.ts'

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
 */
export interface TimerEventBusPort {
	/**
	 * Publish DueTimeReached event when the timer fires
	 *
	 * Used by: pollDueTimersWorkflow
	 *
	 * Handles:
	 * - Envelope construction with generated EnvelopeId
	 * - RequestContext building from timer data
	 * - Single-event publishing via shared EventBusPort
	 *
	 * @param timer - The timer that has reached its due time
	 * @param firedAt - Timestamp when timer fired
	 * @returns Effect that succeeds when event is published
	 * @throws PublishError - When broker publish fails
	 */
	readonly publishDueTimeReached: (
		timer: TimerEntry.ScheduledTimer,
		firedAt: DateTime.Utc,
	) => Effect.Effect<void, PublishError>

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
	readonly subscribeToScheduleTimerCommands: <E>(
		handler: (
			command: Messages.Orchestration.Commands.ScheduleTimer,
			correlationId?: CorrelationId.Type,
		) => Effect.Effect<void, E>,
	) => Effect.Effect<void, SubscribeError | E>
}

export const TimerEventBusPort = Context.GenericTag<TimerEventBusPort>('@event-service-agent/timer/TimerEventBusPort')
