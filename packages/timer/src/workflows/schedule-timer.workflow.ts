import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import type * as Messages from '@event-service-agent/contracts/messages'
import type { CorrelationId } from '@event-service-agent/contracts/types'

import { TimerEntry } from '#/domain/timer-entry.domain.ts'
import { ClockPort } from '#/ports/clock.port.ts'
import { type PersistenceError, TimerPersistencePort } from '#/ports/timer-persistence.port.ts'

interface WorkflowInput {
	/**
	 * @see Messages.Orchestration.Commands.ScheduleTimer
	 * @todo This should be a valid command, but currently it's not.
	 */
	readonly command: Messages.Orchestration.Commands.ScheduleTimer
	readonly correlationId?: CorrelationId.Type
}

export const scheduleTimerWorkflow: (
	input: WorkflowInput,
) => Effect.Effect<void, PersistenceError, ClockPort | TimerPersistencePort> = Effect.fn('Timer.ScheduleTimer')(
	function* ({ command, correlationId }) {
		yield* Effect.annotateCurrentSpan({
			correlationId: Option.fromNullable(correlationId),
			dueAt: command.dueAt,
			serviceCallId: command.serviceCallId,
			tenantId: command.tenantId,
		})

		const clock = yield* ClockPort
		const persistence = yield* TimerPersistencePort

		// TODO: the `TimerEntry.make` goes through the `ScheduledTimer.make`, as such it may throw.
		// 	TimerEntry is a domain entity, where ScheduleTimer is a command.
		// 	the creation of `ScheduleTimer` should be validated before ending up in the domain.
		// 	BUT, I should consider refactoring the TimerEntry.make to use a `Schema.decodeUnknown` or `Schema.decodeEither`
		const scheduledTimer = TimerEntry.make(command, yield* clock.now(), correlationId)

		yield* persistence.save(scheduledTimer)
	},
)
