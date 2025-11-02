import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'

import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

const Timer = Schema.Struct({
	correlationId: Schema.optionalWith(CorrelationId, {
		as: 'Option',
		exact: true,
	}),
	dueAt: Schema.DateTimeUtc,
	registeredAt: Schema.DateTimeUtc,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
})

/**
 * ScheduledTimer represents a timer that has been registered and is waiting to fire.
 * State: Waiting for dueAt to be reached.
 *
 * @remarks
 * Exported for adapter implementations and testing. Domain logic should prefer
 * using {@link TimerEntry} namespace helpers (make, isScheduled, etc.) for type-safe operations.
 */
export class ScheduledTimer extends Schema.TaggedClass<ScheduledTimer>()('Scheduled', Timer) {}

/**
 * ReachedTimer represents a timer that has fired.
 * State: Timer reached its dueAt time and transitioned to reached state.
 *
 * @remarks
 * Exported for adapter implementations and testing. Domain logic should prefer
 * using {@link TimerEntry} namespace helpers (markReached, isReached, etc.) for type-safe operations.
 */
export class ReachedTimer extends Schema.TaggedClass<ReachedTimer>()('Reached', {
	...Timer.fields,
	reachedAt: Schema.DateTimeUtc,
}) {}

/** Schema for encoding/decoding TimerEntry unions (automatically discriminates by _tag) */
const TimerEntrySchema = Schema.Union(ScheduledTimer, ReachedTimer)

/**
 * TimerEntry - Domain aggregate for timer state management
 *
 * Provides operations for creating, querying, and transitioning timer states.
 * Usage:
 * ```typescript
 * import { TimerEntry } from './domain/timer-entry'
 *
 * const timer: TimerEntry.Type = TimerEntry.make(command, now)
 * if (TimerEntry.isDue(timer, now)) {
 *   const reached = TimerEntry.markReached(timer, now)
 * }
 * ```
 */
export const TimerEntry = {
	/** Query: Checks if a timer is due to fire */
	isDue: (entry: TimerEntry.ScheduledTimer, now: DateTime.Utc): boolean => DateTime.lessThanOrEqualTo(entry.dueAt, now),

	/** Type guard: Checks if entry is a ReachedTimer */
	isReached: (timerEntry: TimerEntry.Type): timerEntry is TimerEntry.ReachedTimer => timerEntry._tag === 'Reached',

	/** Type guard: Checks if entry is a ScheduledTimer */
	isScheduled: (timerEntry: TimerEntry.Type): timerEntry is TimerEntry.ScheduledTimer =>
		timerEntry._tag === 'Scheduled',

	/** Command: Transitions a ScheduledTimer to ReachedTimer */
	markReached: (timerEntry: TimerEntry.ScheduledTimer, reachedAt: DateTime.Utc): TimerEntry.ReachedTimer =>
		new ReachedTimer({
			correlationId: timerEntry.correlationId,
			dueAt: timerEntry.dueAt,
			reachedAt,
			registeredAt: timerEntry.registeredAt,
			serviceCallId: timerEntry.serviceCallId,
			tenantId: timerEntry.tenantId,
		}),

	/** Schema for encoding/decoding TimerEntry unions */
	schema: TimerEntrySchema,
} as const

export namespace TimerEntry {
	/** Union type derived from schema - for pattern matching and type guards */
	export type Type = typeof TimerEntrySchema.Type

	export type ScheduledTimer = typeof ScheduledTimer.Type
	export type ReachedTimer = typeof ReachedTimer.Type
}
