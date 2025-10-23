import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import type * as Messages from '@event-service-agent/contracts/messages'
import type { CorrelationId } from '@event-service-agent/contracts/types'

import { ScheduledTimer } from '../domain/timer-entry.domain.ts'
import { ClockPort } from '../ports/clock.port.ts'
import { type PersistenceError, TimerPersistencePort } from '../ports/timer-persistence.port.ts'

interface WorkflowInput {
	/**
	 * @see Messages.Orchestration.Commands.ScheduleTimer
	 * @todo This should be a valid command, but currently it's not.
	 */
	readonly command: Messages.Orchestration.Commands.ScheduleTimer
	readonly correlationId?: CorrelationId.Type
}

export const scheduleTimerWorkflow: ({
	command,
	correlationId,
}: WorkflowInput) => Effect.Effect<void, ParseResult.ParseError | PersistenceError, ClockPort | TimerPersistencePort> =
	Effect.fn('Timer.ScheduleTimer')(function* ({ command, correlationId }) {
		const clock = yield* ClockPort
		const persistence = yield* TimerPersistencePort

		yield* Effect.annotateCurrentSpan({
			correlationId: Option.fromNullable(correlationId),
			dueAt: command.dueAt,
			serviceCallId: command.serviceCallId,
			tenantId: command.tenantId,
		})

		// Get current time and format as ISO8601 for Schema decoding
		const registeredAt = yield* clock.now().pipe(Effect.map(DateTime.formatIso))

		// Decode command into validated ScheduledTimer using Schema
		const scheduledTimer = yield* Schema.decode(ScheduledTimer)({
			_tag: 'Scheduled' as const,
			...(correlationId ? { correlationId } : {}),
			dueAt: command.dueAt, // ISO8601 string → DateTime.Utc
			registeredAt, // ISO8601 string → DateTime.Utc
			serviceCallId: command.serviceCallId,
			tenantId: command.tenantId,
		})

		yield* persistence.save(scheduledTimer)
	})
