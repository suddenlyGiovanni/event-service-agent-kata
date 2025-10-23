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

import type * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'
import type * as Option from 'effect/Option'

import type { ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import type { TimerEntry } from '../domain/timer-entry.domain.ts'

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
	 * Find a specific scheduled timer by key (primary domain operation)
	 *
	 * Returns the timer only if it's in Scheduled state (active/waiting to fire).
	 * Returns None if:
	 * - Timer doesn't exist
	 * - Timer exists but is in Reached state (already fired)
	 *
	 * Use this for workflow logic and idempotency checks where you only care
	 * about active timers. This is the operation workflows should use for
	 * business logic decisions.
	 *
	 * @param tenantId - Tenant identifier
	 * @param serviceCallId - Service call identifier
	 * @returns Effect with Some(ScheduledTimer) if active timer found, None otherwise
	 * @throws PersistenceError - When query fails (connection, etc.)
	 *
	 * @example Workflow idempotency check
	 * ```typescript
	 * const program = pipe(
	 * 	persistence.findScheduledTimer(tenantId, serviceCallId),
	 * 	Effect.flatMap(
	 * 		Option.match({
	 * 			onNone: () => persistence.save(newTimer), // Create new (doesn't exist OR already reached)
	 * 			onSome: existing => {
	 * 				const updatedTimer = existing // Update existing scheduled timer
	 * 				return persistence.save(updatedTimer)
	 * 			}
	 * 		}),
	 * 	),
	 * )
	 * ```
	 */
	readonly findScheduledTimer: (
		tenantId: TenantId.Type,
		serviceCallId: ServiceCallId.Type,
	) => Effect.Effect<Option.Option<TimerEntry.ScheduledTimer>, PersistenceError>

	/**
	 * Find a timer by key in any state (observability/debugging operation)
	 *
	 * Returns the raw storage state regardless of whether the timer is
	 * Scheduled or Reached. This is primarily for testing, debugging,
	 * reconciliation, and observability purposes.
	 *
	 * For domain logic, prefer {@link findScheduledTimer} which returns only
	 * active timers that workflows can act upon.
	 *
	 * @param tenantId - Tenant identifier
	 * @param serviceCallId - Service call identifier
	 * @returns Effect with Some(timer) in any state if found, None if not found
	 * @throws PersistenceError - When query fails (connection, etc.)
	 *
	 * @example Testing state transitions
	 * ```typescript
	 * yield* persistence.markFired(tenantId, serviceCallId, now)
	 *
	 * // Verify state transition happened (testing concern)
	 * const result = yield* persistence.find(tenantId, serviceCallId)
	 * expect(Option.getOrThrow(result)._tag).toBe('Reached')
	 *
	 * // Verify domain behavior (no longer active)
	 * const scheduled = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
	 * expect(Option.isNone(scheduled)).toBe(true)
	 * ```
	 */
	readonly find: (
		tenantId: TenantId.Type,
		serviceCallId: ServiceCallId.Type,
	) => Effect.Effect<Option.Option<TimerEntry.Type>, PersistenceError>

	/**
	 * Find all timers that are due for firing (scheduled timers only)
	 *
	 * Query: WHERE dueAt <= now AND status = 'Scheduled'
	 * Returns empty chunk if no timers are due.
	 *
	 * Only returns Scheduled timers (Reached timers are excluded).
	 * This ensures timers are only processed once even if the system
	 * crashes after markFired but before event publishing completes.
	 *
	 * The adapter should:
	 * - Use index on (status, dueAt) for performance
	 * - Limit batch size to prevent memory issues (e.g., LIMIT 100)
	 * - Order by dueAt ASC (fire oldest first)
	 * - Decode storage format to TimerEntry domain type
	 *
	 * @param now - Current time to compare against dueAt
	 * @returns Effect with chunk of due ScheduledTimers (may be empty)
	 * @throws PersistenceError - When query fails
	 *
	 * @example Polling worker pattern
	 * ```typescript
	 * const dueTimers = yield* persistence.findDue(now)
	 * // Only ScheduledTimers returned (Reached excluded)
	 *
	 * yield* Effect.forEach(dueTimers, timer => {
	 *   // Mark as fired FIRST (idempotency marker)
	 *   yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now)
	 *   // Then publish event (safe to retry)
	 *   yield* eventBus.publish(DueTimeReached.make(timer))
	 * })
	 * ```
	 */
	readonly findDue: (now: DateTime.Utc) => Effect.Effect<Chunk.Chunk<TimerEntry.ScheduledTimer>, PersistenceError>

	/**
	 * Mark a timer as fired by transitioning Scheduled → Reached
	 *
	 * Transitions the timer's state and records when it was fired.
	 * The Reached state serves as an idempotency marker to prevent
	 * duplicate event publishing in case of failures between state
	 * transition and event publishing.
	 *
	 * State transitions:
	 * - ScheduledTimer → ReachedTimer (normal case, records reachedAt)
	 * - ReachedTimer → ReachedTimer (idempotent no-op, keeps original reachedAt)
	 * - NotFound → Success (already cleaned up or never existed)
	 *
	 * The adapter handles:
	 * - Atomic state transition using HashMap.modify or SQL UPDATE
	 * - Recording reachedAt timestamp on first transition
	 * - Preserving original reachedAt on subsequent calls (idempotency)
	 * - Transaction management (for SQL adapters)
	 *
	 * After marking as fired, the timer will no longer be returned by
	 * `findDue()` or `findScheduledTimer()`, but can still be queried via
	 * `find()` for debugging/reconciliation purposes.
	 *
	 * @param tenantId - Tenant identifier
	 * @param serviceCallId - Service call identifier
	 * @param reachedAt - Timestamp when timer was fired (ignored if already Reached)
	 * @returns Effect that succeeds when state transition completes
	 * @throws PersistenceError - When update fails
	 *
	 * @example Idempotent polling worker
	 * ```typescript
	 * // Mark as fired FIRST (before publishing event)
	 * yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now)
	 * // Timer is now Reached, won't appear in next findDue()
	 *
	 * // Even if this crashes, timer won't be re-processed
	 * yield* eventBus.publish(DueTimeReached.make(timer))
	 * ```
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
