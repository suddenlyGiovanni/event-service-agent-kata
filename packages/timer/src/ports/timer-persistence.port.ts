/**
 * TimerPersistencePort - Timer storage abstraction
 *
 * Provides persistence operations for TimerEntry entities. The adapter handles
 * all storage-specific details (SQL queries, connection pooling, transactions).
 *
 * Used by: Timer module (command handlers, polling worker)
 *
 * Design principles:
 * - Storage-agnostic: works with SQLite, PostgreSQL, or in-memory
 * - Effect-based: all operations return Effect for composability
 * - Idempotent: safe to call operations multiple times
 * - Query optimization: findDue() should be fast (indexed on dueAt, status)
 *
 * Based on {@link ../../../../docs/design/modules/timer.md timer} and {@link ../../../../docs/decisions/ADR-0003-timer.md ADR-0003}
 */

import type { ServiceCallId, TenantId } from '@event-service-agent/contracts/types'
import type * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'
import type * as Option from 'effect/Option'

import type { TimerEntry } from '#/domain/timer-entry.domain.ts'

/**
 * PersistenceError - Generic error when storage operations fail
 *
 * Adapter maps storage-specific errors (connection failure, constraint
 * violations, query errors, etc.) to this generic error. Specific details
 * are logged by the adapter for observability.
 */
export class PersistenceError extends Data.TaggedError('PersistenceError')<{
	readonly cause: string
	readonly operation: keyof TimerPersistencePort
}> {}

/**
 * TimerNotFoundError - Thrown when a timer cannot be found
 */
export class TimerNotFoundError extends Data.TaggedError('TimerNotFoundError')<{
	readonly tenantId: TenantId.Type
	readonly serviceCallId: ServiceCallId.Type
}> {}

/**
 * TimerPersistencePort - Timer storage port interface
 *
 * Responsibilities:
 * - Store and retrieve TimerEntry entities
 * - Query for due timers efficiently
 * - Update timer status atomically
 * - Handle errors generically (adapter logs details)
 *
 * Adapter responsibilities (hidden from domain):
 * - SQL query construction and optimization
 * - Index management (dueAt, status, composite key)
 * - Connection pooling and transaction management
 * - Constraint enforcement (unique tenantId+serviceCallId)
 * - Schema migrations
 * - Encoding/decoding between domain types and storage format
 *
 * Storage key: (tenantId, serviceCallId) - ensures idempotency
 *
 * @example handleScheduleTimer
 * ```typescript
 * const handleScheduleTimer: Effect.Effect<void, PersistenceError, TimerPersistencePort> = pipe(
 *    TimerPersistencePort,
 *    Effect.flatMap(persistence => persistence.save(TimerEntry.make(command, now))),
 * )
 * ```
 *
 * @example  Polling worker: find and process due timers
 * ```typescript
 * // Polling worker: find and process due timers
 * const pollForDueTimers: Effect.Effect<
 * 	void,
 * 	PersistenceError | PublishError,
 * 	TimerPersistencePort | EventBusPort | ClockPort
 * > = Effect.gen(function* () {
 * 	const persistence = yield* TimerPersistencePort
 * 	const eventBus = yield* EventBusPort
 * 	const clock = yield* ClockPort
 * 	const now = yield* clock.now()
 * 	const dueTimers = yield* persistence.findDue(now)
 *
 * 	yield* Effect.forEach(dueTimers, timer =>
 * 		// this should be done in a done as a single transaction
 * 		Effect.andThen(
 * 			// Publish DueTimeReached event
 * 			eventBus.publish(),
 * 			// Mark as fired
 * 			() => persistence.markFired(timer.tenantId, timer.serviceCallId, now),
 * 		),
 * 	)
 * })
 * ```
 */
export interface TimerPersistencePort {
	/**
	 * Save or update a timer entry
	 *
	 * Idempotent upsert operation keyed by (tenantId, serviceCallId).
	 * - If timer doesn't exist: insert new record
	 * - If timer exists: update with new values (dueAt, registeredAt, status)
	 *
	 * The adapter handles:
	 * - Encoding TimerEntry to storage format
	 * - UPSERT/INSERT ON CONFLICT logic
	 * - Constraint validation (unique key, not null)
	 * - Transaction management
	 *
	 * @param entry - Timer entry to save (ScheduledTimer only)
	 * @returns Effect that succeeds when timer is persisted
	 * @throws PersistenceError - When save operation fails
	 */
	readonly save: (entry: TimerEntry.ScheduledTimer) => Effect.Effect<void, PersistenceError>

	/**
	 * Find a specific timer by key
	 *
	 * Returns None if timer doesn't exist.
	 * Only returns ScheduledTimer (Reached timers are filtered out).
	 *
	 * @param tenantId - Tenant identifier
	 * @param serviceCallId - Service call identifier
	 * @returns Effect with Some(timer) if found, None if not found
	 * @throws PersistenceError - When query fails (connection, etc.)
	 */
	readonly find: (
		tenantId: TenantId.Type,
		serviceCallId: ServiceCallId.Type,
	) => Effect.Effect<Option.Option<TimerEntry.ScheduledTimer>, PersistenceError>

	/**
	 * Find all timers that are due for firing
	 *
	 * Query: WHERE dueAt <= now AND status = 'Scheduled'
	 * Returns empty array if no timers are due.
	 *
	 * The adapter should:
	 * - Use index on (status, dueAt) for performance
	 * - Limit batch size to prevent memory issues (e.g., LIMIT 100)
	 * - Order by dueAt ASC (fire oldest first)
	 * - Decode storage format to TimerEntry domain type
	 *
	 * @param now - Current time to compare against dueAt
	 * @returns Effect with chunk of due timers (may be empty)
	 * @throws PersistenceError - When query fails
	 */
	readonly findDue: (now: DateTime.Utc) => Effect.Effect<Chunk.Chunk<TimerEntry.ScheduledTimer>, PersistenceError>

	/**
	 * Mark a timer as fired (reached)
	 *
	 * Updates the timer status and records when it was reached.
	 * Idempotent: safe to call multiple times (won't error if already fired).
	 *
	 * The adapter handles:
	 * - Atomic status transition: Scheduled → Reached
	 * - Recording reachedAt timestamp
	 * - Transaction management
	 * - Idempotent update (WHERE status = 'Scheduled' for safety)
	 *
	 * Note: The adapter may choose to delete the record instead of updating
	 * (since fired timers are no longer needed). This is an implementation detail.
	 *
	 * @param tenantId - Tenant identifier
	 * @param serviceCallId - Service call identifier
	 * @param reachedAt - Timestamp when timer was fired
	 * @returns Effect that succeeds when status is updated
	 * @throws PersistenceError - When update fails
	 */
	readonly markFired: (
		tenantId: TenantId.Type,
		serviceCallId: ServiceCallId.Type,
		reachedAt: DateTime.Utc,
	) => Effect.Effect<void, PersistenceError>

	/**
	 * Delete a timer entry
	 *
	 * Removes timer from storage. Idempotent: doesn't error if timer doesn't exist.
	 * Primarily for testing and cleanup. May be used by adapter for markFired().
	 *
	 * @param tenantId - Tenant identifier
	 * @param serviceCallId - Service call identifier
	 * @returns Effect that succeeds when timer is deleted (or already gone)
	 * @throws PersistenceError - When delete fails
	 */
	readonly delete: (tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type) => Effect.Effect<void, PersistenceError>
}

/**
 * TimerPersistencePort service tag
 *
 * Use this to access the TimerPersistencePort from the Effect context.
 *
 */
export const TimerPersistencePort = Context.GenericTag<TimerPersistencePort>(
	'@event-service-agent/timer/TimerPersistencePort',
)
