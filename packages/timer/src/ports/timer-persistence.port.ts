/**
 * TimerPersistencePort - Timer storage abstraction
 *
 * Provides persistence operations for TimerEntry entities. The adapter handles all storage-specific details (SQL
 * queries, connection pooling, transactions).
 *
 * Used by: Timer module (command handlers, polling worker)
 *
 * Design principles:
 *
 * - Storage-agnostic: works with SQLite, PostgreSQL, or in-memory
 * - Effect-based: all operations return Effect for composability
 * - Idempotent: safe to call operations multiple times
 * - Query optimization: findDue() should be fast (indexed on dueAt, status)
 *
 * Based on {@link ../../../../docs/design/modules/timer.md timer} and
 * {@link ../../../../docs/decisions/ADR-0003-timer.md ADR-0003}
 */

import type * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'
import type * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import type { TimerEntry } from '../domain/timer-entry.domain.ts'

/**
 * PersistenceError - Storage operation failure
 *
 * Preserves full diagnostic context from underlying storage layer. The `cause` field contains the raw error (with stack
 * trace, nested errors, etc.) for debugging and observability. The `message` field provides a human-readable summary
 * extracted from the cause.
 *
 * Follows Effect Platform error pattern (see @effect/platform/Error).
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()('PersistenceError', {
	/** Raw error from storage layer (preserves stack, message, code, etc.) */
	cause: Schema.optional(Schema.Defect),
	/** Human-readable description of what failed */
	message: Schema.optional(Schema.String),
	/** Which persistence operation failed */
	operation: Schema.Literal('save', 'find', 'findScheduledTimer', 'findDue', 'markFired', 'delete'),
}) {
	/** Format error for logs/debugging */
	get formattedMessage(): string {
		return `PersistenceError.${this.operation}${this.message ? `: ${this.message}` : ''}`
	}
}

/**
 * TimerNotFoundError - Thrown when a timer cannot be found
 */
export class TimerNotFoundError extends Schema.TaggedError<TimerNotFoundError>()('TimerNotFoundError', {
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {}

/**
 * TimerScheduleKey - Composite identity for timer persistence operations
 *
 * All persistence queries use (tenantId, serviceCallId) as the idempotent key. Keeping the Schema definition in the
 * port layer ensures adapters/tests share the same structural contract without depending on adapter internals.
 */
export const TimerScheduleKey: Schema.Struct<{
	serviceCallId: typeof ServiceCallId
	tenantId: typeof TenantId
}> = Schema.Struct({
	/**
	 * Service call identifier - unique per timer
	 */
	serviceCallId: ServiceCallId,

	/**
	 * Tenant identifier - supports multi-tenant isolation
	 */
	tenantId: TenantId,
})

/** Namespace for the branded payload type of `TimerScheduleKey` schema. */
export declare namespace TimerScheduleKey {
	/** Branded payload type for `TimerScheduleKey` schema. */
	type Type = typeof TimerScheduleKey.Type
}

/**
 * TimerPersistencePort - Timer storage port interface
 *
 * Responsibilities:
 *
 * - Store and retrieve TimerEntry entities
 * - Query for due timers efficiently
 * - Update timer status atomically
 * - Handle errors generically (adapter logs details)
 *
 * Adapter responsibilities (hidden from domain):
 *
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
	 *
	 * **State transition semantics:**
	 *
	 * - If timer doesn't exist: insert new Scheduled timer
	 * - If Scheduled timer exists: update with new values (e.g., reschedule with new dueAt)
	 * - If Reached timer exists: NO-OP (all columns preserved, no database write)
	 *
	 * **Terminal state enforcement:** Reached is a terminal state per ADR-0003. Once a timer fires and transitions to
	 * Reached, subsequent save() calls will NOT modify ANY columns. The entire row becomes immutable, preserving both the
	 * idempotency marker (reached_at) and all other metadata (due_at, correlation_id, etc.).
	 *
	 * The adapter handles:
	 *
	 * - Encoding TimerEntry to storage format
	 * - UPSERT/INSERT ON CONFLICT logic with conditional UPDATE clause
	 * - Full immutability enforcement for Reached timers (WHERE state != 'Reached')
	 * - Constraint validation (unique key, not null)
	 * - Transaction management
	 *
	 * If genuine re-scheduling is needed after firing, use delete() + save().
	 *
	 * @param entry - Timer entry to save (ScheduledTimer only)
	 *
	 * @returns Effect that succeeds when timer is persisted (or preserved if already Reached)
	 * @throws PersistenceError - When save operation fails
	 * @see ADR-0003 for timer state machine and terminal state semantics
	 */
	readonly save: (entry: TimerEntry.ScheduledTimer) => Effect.Effect<void, PersistenceError>

	/**
	 * Find a specific scheduled timer by key (primary domain operation)
	 *
	 * Returns the timer only if it's in Scheduled state (active/waiting to fire). Returns None if:
	 *
	 * - Timer doesn't exist
	 * - Timer exists but is in Reached state (already fired)
	 *
	 * Use this for workflow logic and idempotency checks where you only care about active timers. This is the operation
	 * workflows should use for business logic decisions.
	 *
	 * @example Workflow idempotency check
	 *
	 * ```typescript
	 * import * as Effect from "effect/Effect"
	 * import * as Option from "effect/Option"
	 * import type { ServiceCallId, TenantId } from "@event-service-agent/schemas/shared"
	 * import * as Adapters from "../adapters/index.ts"
	 *
	 * declare const tenantId: TenantId.Type
	 * declare const serviceCallId: ServiceCallId.Type
	 * declare const newTimer: never
	 *
	 * const idempotentSchedule: Effect.Effect<void, PersistenceError, TimerPersistencePort> =
	 *   Effect.gen(function* () {
	 *     const persistence = yield* TimerPersistencePort
	 *     const existing = yield* persistence.findScheduledTimer({ serviceCallId, tenantId })
	 *
	 *     return yield* Option.match(existing, {
	 *       onNone: () => persistence.save(newTimer),
	 *       onSome: (timer) => persistence.save(timer),
	 *     })
	 *   })
	 *
	 * void idempotentSchedule.pipe(Effect.provide(Adapters.TimerPersistence.Test))
	 * ```
	 *
	 * @param key - Composite key identifying the timer (tenantId + serviceCallId)
	 *
	 * @returns Effect with Some(ScheduledTimer) if active timer found, None otherwise
	 * @throws PersistenceError - When query fails (connection, etc.)
	 */
	readonly findScheduledTimer: (
		key: TimerScheduleKey.Type,
	) => Effect.Effect<Option.Option<TimerEntry.ScheduledTimer>, PersistenceError>

	/**
	 * Find a timer by key in any state (observability/debugging operation)
	 *
	 * Returns the raw storage state regardless of whether the timer is Scheduled or Reached. This is primarily for
	 * testing, debugging, reconciliation, and observability purposes.
	 *
	 * For domain logic, prefer {@link findScheduledTimer} which returns only active timers that workflows can act upon.
	 *
	 * @param key - Composite key identifying the timer (tenantId + serviceCallId)
	 *
	 * @returns Effect with Some(timer) in any state if found, None if not found
	 * @throws PersistenceError - When query fails (connection, etc.)
	 */
	readonly find: (key: TimerScheduleKey.Type) => Effect.Effect<Option.Option<TimerEntry.Type>, PersistenceError>

	/**
	 * Find all timers that are due for firing (scheduled timers only)
	 *
	 * Query: WHERE dueAt <= now AND status = 'Scheduled' Returns empty chunk if no timers are due.
	 *
	 * Only returns Scheduled timers (Reached timers are excluded). This ensures timers are only processed once even if
	 * the system crashes after markFired but before event publishing completes.
	 *
	 * The adapter should:
	 *
	 * - Use index on (status, dueAt) for performance
	 * - Limit batch size to prevent memory issues (e.g., LIMIT 100)
	 * - Order by dueAt ASC (fire oldest first)
	 * - Decode storage format to TimerEntry domain type
	 *
	 * @example Polling worker pattern
	 *
	 * ```typescript
	 * import type * as DateTime from "effect/DateTime"
	 * import * as Effect from "effect/Effect"
	 * import * as Adapters from "../adapters/index.ts"
	 *
	 * declare const now: DateTime.Utc
	 *
	 * // Query for timers that are due for firing
	 * const findDueTimers: Effect.Effect<void, PersistenceError, TimerPersistencePort> = Effect.gen(function* () {
	 *   const persistence = yield* TimerPersistencePort
	 *   const dueTimers = yield* persistence.findDue(now)
	 *   // dueTimers is Chunk<ScheduledTimer> - only Scheduled timers, excludes Reached
	 *   yield* Effect.log(`Found ${dueTimers.length} due timers`)
	 * })
	 *
	 * // Resolve dependencies via Effect.provide
	 * void findDueTimers.pipe(Effect.provide(Adapters.TimerPersistence.Test))
	 * ```
	 *
	 * @param now - Current time to compare against dueAt
	 *
	 * @returns Effect with chunk of due ScheduledTimers (may be empty)
	 * @throws PersistenceError - When query fails
	 */
	readonly findDue: (now: DateTime.Utc) => Effect.Effect<Chunk.Chunk<TimerEntry.ScheduledTimer>, PersistenceError>

	/**
	 * Mark a timer as fired by transitioning Scheduled → Reached
	 *
	 * Transitions the timer's state and records when it was fired. The Reached state serves as an idempotency marker to
	 * prevent duplicate event publishing in case of failures between state transition and event publishing.
	 *
	 * State transitions:
	 *
	 * - ScheduledTimer → ReachedTimer (normal case, records reachedAt)
	 * - ReachedTimer → ReachedTimer (idempotent no-op, keeps original reachedAt)
	 * - NotFound → Success (already cleaned up or never existed)
	 *
	 * The adapter handles:
	 *
	 * - Atomic state transition using storage-specific operations (e.g., SQL UPDATE)
	 * - Recording reachedAt timestamp on first transition
	 * - Preserving original reachedAt on subsequent calls (idempotency)
	 * - Transaction management when required by the storage backend
	 *
	 * After marking as fired, the timer will no longer be returned by `findDue()` or `findScheduledTimer()`, but can
	 * still be queried via `find()` for debugging/reconciliation purposes.
	 *
	 * @example Mark timer as fired
	 *
	 * ```typescript
	 * import type * as DateTime from "effect/DateTime"
	 * import * as Effect from "effect/Effect"
	 *
	 * import { ServiceCallId, TenantId } from "@event-service-agent/schemas/shared"
	 *
	 * import * as Adapters from "../adapters/index.ts"
	 * import { type PersistenceError, TimerPersistencePort, TimerScheduleKey } from "./timer-persistence.port.ts"
	 *
	 * declare const now: DateTime.Utc
	 * declare const tenantId: TenantId.Type
	 * declare const serviceCallId: ServiceCallId.Type
	 *
	 * // Mark a timer as fired (idempotent state transition)
	 * const markTimerFired: Effect.Effect<void, PersistenceError, TimerPersistencePort> = Effect.gen(function* () {
	 *   const persistence = yield* TimerPersistencePort
	 *
	 *   yield* persistence.markFired({
	 *     key: TimerScheduleKey.make({ tenantId, serviceCallId }),
	 *     reachedAt: now,
	 *   })
	 *   // Timer is now Reached, won't appear in next findDue()
	 *   yield* Effect.log("Timer marked as fired")
	 * })
	 *
	 * // Resolve dependencies via Effect.provide
	 * void markTimerFired.pipe(Effect.provide(Adapters.TimerPersistence.Test))
	 * ```
	 *
	 * @param params - Mark fired parameters
	 * @param params.key - Composite key identifying the timer (tenantId + serviceCallId)
	 * @param params.reachedAt - Timestamp when timer was fired (ignored if already Reached)
	 *
	 * @returns Effect that succeeds when state transition completes
	 * @throws PersistenceError - When update fails
	 */
	readonly markFired: (params: {
		readonly key: TimerScheduleKey.Type
		readonly reachedAt: DateTime.Utc
	}) => Effect.Effect<void, PersistenceError>

	/**
	 * Delete a timer entry
	 *
	 * Removes timer from storage. Idempotent: doesn't error if timer doesn't exist. Primarily for testing and cleanup.
	 * May be used by adapter for markFired().
	 *
	 * @param key - Composite key identifying the timer (tenantId + serviceCallId)
	 *
	 * @returns Effect that succeeds when timer is deleted (or already gone)
	 * @throws PersistenceError - When delete fails
	 */
	readonly delete: (key: TimerScheduleKey.Type) => Effect.Effect<void, PersistenceError>
}

/**
 * TimerPersistencePort service tag
 *
 * Use this to access the TimerPersistencePort from the Effect context.
 */
export const TimerPersistencePort = Context.GenericTag<TimerPersistencePort>(
	'@event-service-agent/timer/TimerPersistencePort',
)
