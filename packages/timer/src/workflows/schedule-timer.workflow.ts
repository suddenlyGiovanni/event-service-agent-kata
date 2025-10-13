import type * as Effect from 'effect/Effect'

import type * as messages from '@event-service-agent/contracts/messages'
import type { CorrelationId } from '@event-service-agent/contracts/types'

import type { ClockPort } from '#/ports/clock.port.ts'
import type { PersistenceError, TimerPersistencePort } from '#/ports/timer-persistence.port.ts'

interface WorkflowInput {
	readonly command: messages.Orchestration.Commands.ScheduleTimer
	readonly correlationId?: CorrelationId.Type
}

export declare const scheduleTimerWorkflow: (
	input: WorkflowInput,
) => Effect.Effect<void, PersistenceError, ClockPort | TimerPersistencePort>
