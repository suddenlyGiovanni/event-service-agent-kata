/**
 * TimerEntry Domain Model
 *
 * Core aggregate for timer state management. Implements a simple state machine:
 * - **Scheduled**: Timer registered, awaiting its due time
 * - **Reached**: Timer has fired at or after its due time
 *
 * The state machine enforces important business rules:
 * - Once a timer reaches Reached state, it cannot transition back to Scheduled
 * - This prevents duplicate firing and enables idempotent event processing
 * - The Reached state serves as a durable marker for "already processed"
 *
 * Multi-tenancy is enforced at the model level:
 * - Every timer is scoped to a tenantId (no cross-tenant visibility)
 * - Composite key (tenantId, serviceCallId) ensures uniqueness per tenant
 *
 * @see docs/design/modules/timer.md — Timer module design
 * @see docs/decisions/ADR-0003-timer.md — Timer implementation decisions
 */

import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'

import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

/**
 * Base timer fields shared between Scheduled and Reached states
 *
 * correlationId is optional because:
 * - Present for timers created via command (traces back to originating request)
 * - Absent for system-initiated timers (no user request to correlate to)
 * @internal
 */
export const Timer = Schema.Struct({
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
 * Scheduled state — Timer awaiting its due time
 *
 * Domain semantics:
 * - Timer is persisted and durable (survives crashes)
 * - Will fire when system clock reaches dueAt timestamp
 * - Returned by findDue() polling queries
 * - Can transition to Reached when fired
 *
 * Invariants:
 * - dueAt must be in the future at creation time (validated by workflow)
 * - tenantId + serviceCallId form unique composite key
 * - registeredAt <= dueAt (timer can't be due before it's registered)
 *
 * @remarks
 * Exported for adapter implementations and testing. Domain logic should prefer
 * using {@link TimerEntry} namespace helpers (isScheduled, markReached) for type-safe operations.
 */
export class ScheduledTimer extends Schema.TaggedClass<ScheduledTimer>()('Scheduled', Timer) {}

/**
 * Reached state — Timer has fired
 *
 * Domain semantics:
 * - Terminal state (no further transitions)
 * - Serves as idempotency marker (prevents duplicate event publishing)
 * - Not returned by findDue() queries (excluded from polling)
 * - Persisted for observability and debugging
 *
 * The reachedAt timestamp records when the timer was processed, enabling:
 * - Latency metrics (reachedAt - dueAt = processing delay)
 * - Audit trails (when did this timer fire?)
 * - Idempotency (ignore subsequent firing attempts)
 *
 * @remarks
 * Exported for adapter implementations and testing. Domain logic should prefer
 * using {@link TimerEntry} namespace helpers (isReached) for type-safe operations.
 */
export class ReachedTimer extends Schema.TaggedClass<ReachedTimer>()('Reached', {
	...Timer.fields,
	reachedAt: Schema.DateTimeUtc,
}) {}

/**
 * Schema for encoding/decoding TimerEntry unions
 *
 * Effect Schema automatically discriminates by _tag field, enabling type-safe
 * pattern matching and JSON serialization/deserialization.
 */
const TimerEntrySchema = Schema.Union(ScheduledTimer, ReachedTimer)

/**
 * TimerEntry — Domain aggregate for timer lifecycle management
 *
 * Provides functional operations for timer state machine:
 * - State queries (isDue, isScheduled, isReached)
 * - State transitions (markReached)
 * - Schema for persistence and serialization
 *
 * Design rationale:
 * - Pure functions (no side effects) enable easy testing and reasoning
 * - Namespace pattern groups related operations (better than class with methods)
 * - Type guards enable exhaustive pattern matching (compiler-checked)
 * - Schema ensures type safety across serialization boundaries
 *
 * @example Basic usage
 * ```typescript
 * // Check if timer is due
 * const timer: TimerEntry.ScheduledTimer = ...
 * if (TimerEntry.isDue(timer, now)) {
 *   // Transition to Reached
 *   const reached = TimerEntry.markReached(timer, now)
 * }
 * ```
 *
 * @example Pattern matching
 * ```typescript
 * const timer: TimerEntry.Type = ...
 * if (TimerEntry.isScheduled(timer)) {
 *   // TypeScript knows timer is ScheduledTimer here
 *   console.log(timer.dueAt)
 * } else if (TimerEntry.isReached(timer)) {
 *   // TypeScript knows timer is ReachedTimer here
 *   console.log(timer.reachedAt)
 * }
 * ```
 */
export const TimerEntry = {
	/**
	 * Query: Checks if a scheduled timer is due to fire
	 *
	 * Uses inclusive comparison (<=) to catch timers at exact millisecond boundary.
	 * Clock precision varies across systems, so inclusive comparison prevents missed timers.
	 */
	isDue: (entry: TimerEntry.ScheduledTimer, now: DateTime.Utc): boolean => DateTime.lessThanOrEqualTo(entry.dueAt, now),

	/** Type guard: Runtime check for ReachedTimer variant */
	isReached: (timerEntry: TimerEntry.Type): timerEntry is TimerEntry.ReachedTimer => timerEntry._tag === 'Reached',

	/** Type guard: Runtime check for ScheduledTimer variant */
	isScheduled: (timerEntry: TimerEntry.Type): timerEntry is TimerEntry.ScheduledTimer =>
		timerEntry._tag === 'Scheduled',

	/**
	 * State transition: Scheduled → Reached
	 *
	 * Records the timestamp when the timer fired. This enables:
	 * - Idempotency (subsequent calls are no-ops in persistence layer)
	 * - Latency metrics (how late was the firing?)
	 * - Audit trails (when did this happen?)
	 *
	 * Note: This is a pure function. Persistence layer handles idempotency
	 * (preserves original reachedAt if already Reached).
	 */
	markReached: (timerEntry: TimerEntry.ScheduledTimer, reachedAt: DateTime.Utc): TimerEntry.ReachedTimer =>
		new ReachedTimer({
			correlationId: timerEntry.correlationId,
			dueAt: timerEntry.dueAt,
			reachedAt,
			registeredAt: timerEntry.registeredAt,
			serviceCallId: timerEntry.serviceCallId,
			tenantId: timerEntry.tenantId,
		}),

	/** Schema for encoding/decoding TimerEntry unions (supports JSON, database, etc.) */
	schema: TimerEntrySchema,
} as const

/**
 * TimerEntry namespace — Types and utilities for timer domain model
 *
 * Provides type aliases and helper functions for working with timer states.
 */
export namespace TimerEntry {
	/**
	 * Union type of all timer states
	 *
	 * Use for variables that can be either Scheduled or Reached.
	 * Pattern match with type guards (isScheduled, isReached) for exhaustive handling.
	 */
	export type Type = typeof TimerEntrySchema.Type

	/** ScheduledTimer type alias (for cleaner signatures) */
	export type ScheduledTimer = typeof ScheduledTimer.Type

	/** ReachedTimer type alias (for cleaner signatures) */
	export type ReachedTimer = typeof ReachedTimer.Type
}
