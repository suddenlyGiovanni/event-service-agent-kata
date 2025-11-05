import * as Effect from 'effect/Effect'

import { MessageMetadata } from '@event-service-agent/platform/context'
import type * as Messages from '@event-service-agent/schemas/messages'

import * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * Schedule a timer to fire at a specified future time
 *
 * **Command-triggered workflow**: Processes ScheduleTimer command from Orchestration module.
 * Handler provisions MessageMetadata Context (extracted from command envelope).
 *
 * **Context Requirements**:
 * - MessageMetadata: Provides correlationId (from envelope) and causationId (command envelope ID)
 * - ClockPort: For current timestamp (registeredAt)
 * - TimerPersistencePort: For saving timer aggregate
 *
 * **Pattern**: Workflow requires MessageMetadata via Context (symmetric with publishDueTimeReached).
 * This enables full metadata access (correlationId + causationId) for tracing/observability.
 *
 * @param command - ScheduleTimer command with tenantId, serviceCallId, dueAt
 * @returns Effect that succeeds when timer is persisted
 * @throws PersistenceError - When save fails
 * @requires MessageMetadata - Correlation/causation context from command envelope
 * @requires ClockPort - For current time
 * @requires TimerPersistencePort - For persistence
 *
 * @example
 * ```typescript
 * // Handler forwards metadata from envelope to workflow
 * yield* eventBus.subscribeToScheduleTimerCommands((command, metadata) =>
 *   scheduleTimerWorkflow(command).pipe(
 *     Effect.provideService(MessageMetadata, metadata)
 *   )
 * )
 * ```
 */
export const scheduleTimerWorkflow: (
	command: Messages.Orchestration.Commands.ScheduleTimer.Type,
) => Effect.Effect<void, Ports.PersistenceError, MessageMetadata | Ports.ClockPort | Ports.TimerPersistencePort> =
	Effect.fn('Timer.ScheduleTimer')(function* ({ dueAt, serviceCallId, tenantId }) {
		// Extract context dependencies
		const { causationId, correlationId } = yield* MessageMetadata
		const clock = yield* Ports.ClockPort
		const persistence = yield* Ports.TimerPersistencePort

		// Annotate span with full metadata (correlationId + causationId for tracing)
		yield* Effect.annotateCurrentSpan({
			causationId,
			correlationId,
			dueAt,
			serviceCallId,
			tenantId,
		})

		const registeredAt = yield* clock.now()

		const scheduledTimer = new Domain.ScheduledTimer({
			correlationId,
			dueAt,
			registeredAt,
			serviceCallId,
			tenantId,
		})

		yield* persistence.save(scheduledTimer)
	})
