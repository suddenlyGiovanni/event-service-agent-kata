import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import type * as Messages from '@event-service-agent/schemas/messages'
import type { CorrelationId } from '@event-service-agent/schemas/shared'

import * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

interface WorkflowInput {
	/**
	 * @see Messages.Orchestration.Commands.ScheduleTimer.Type
	 */
	readonly command: Messages.Orchestration.Commands.ScheduleTimer.Type
	readonly correlationId?: CorrelationId.Type
}

export const scheduleTimerWorkflow: ({
	command,
	correlationId,
}: WorkflowInput) => Effect.Effect<void, Ports.PersistenceError, Ports.ClockPort | Ports.TimerPersistencePort> =
	Effect.fn('Timer.ScheduleTimer')(function* ({ command, correlationId }) {
		const clock = yield* Ports.ClockPort
		const persistence = yield* Ports.TimerPersistencePort

		yield* Effect.annotateCurrentSpan({
			correlationId: Option.fromNullable(correlationId),
			dueAt: command.dueAt,
			serviceCallId: command.serviceCallId,
			tenantId: command.tenantId,
		})

		// Get current time
		const registeredAt = yield* clock.now()

		// Create ScheduledTimer domain object directly (already have domain types)
		const scheduledTimer = new Domain.ScheduledTimer({
			correlationId: Option.fromNullable(correlationId),
			dueAt: command.dueAt, // DateTime.Utc
			registeredAt, // DateTime.Utc
			serviceCallId: command.serviceCallId,
			tenantId: command.tenantId,
		})

		yield* persistence.save(scheduledTimer)
	})
