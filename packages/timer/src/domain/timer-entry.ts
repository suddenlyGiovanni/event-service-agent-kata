import type * as Message from '@event-service-agent/contracts/messages'
import type { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

export declare namespace TimerEntry {
	type State = 'Scheduled' | 'Reached'

	interface Timer<S extends State> {
		readonly state: S
		readonly tenantId: TenantId
		readonly serviceCallId: ServiceCallId
		readonly dueAt: Iso8601DateTime
		readonly registeredAt: Iso8601DateTime
		readonly correlationId: undefined | CorrelationId
	}

	interface ScheduledTimer extends Timer<'Scheduled'> {}

	interface ReachedTimer extends Timer<'Reached'> {
		readonly reachedAt: Iso8601DateTime
	}

	type Any = ScheduledTimer | ReachedTimer
}

export class TimerEntry {
	/** Factory: Command → ScheduledTimer */
	static make(
		command: Message.ScheduleTimer,
		now: Iso8601DateTime,
		correlationId?: CorrelationId,
	): TimerEntry.ScheduledTimer {
		return {
			correlationId,
			dueAt: command.dueAt,
			registeredAt: now,
			serviceCallId: command.serviceCallId,
			state: 'Scheduled',
			tenantId: command.tenantId,
		}
	}

	/** Transition: ScheduledTimer → ReachedTimer */
	static readonly markReached: (entry: TimerEntry.ScheduledTimer, now: Iso8601DateTime) => TimerEntry.ReachedTimer

	/** Query: Is this timer ready to fire? */
	static readonly isDue: (entry: TimerEntry.ScheduledTimer, now: Iso8601DateTime) => boolean
}
