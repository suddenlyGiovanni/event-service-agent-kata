import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as String from 'effect/String'

import type { ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { TimerEntry } from '../domain/timer-entry.domain.ts'
import { PersistenceError, TimerPersistencePort } from '../ports/timer-persistence.port.ts'

/**
 * TimerPersistence - Adapter implementations for TimerPersistencePort
 *
 * Provides different storage backends for timer persistence:
 * - {@link inMemory} - Fast, isolated, in-memory storage for testing
 * - `sqlite` (future) - Persistent local/production storage with file-backed database
 * - `postgres` (future) - Distributed production storage for scalability
 *
 * @remarks
 * This class follows the namespace pattern for organizing related Layer implementations.
 * Each static member provides a Layer that implements TimerPersistencePort with different
 * storage strategies. Layers are scoped to the Effect runtime lifetime, ensuring proper
 * resource management and test isolation.
 *
 * @example
 * ```typescript
 * // In tests - use in-memory storage
 * import { TimerPersistence } from '../adapters/timer-persistence.adapter.ts'
 *
 * Effect.gen(function* () {
 *   const persistence = yield* TimerPersistencePort
 *   yield* persistence.save(timer)
 * }).pipe(
 *   Effect.provide(TimerPersistence.inMemory)
 * )
 * ```
 *
 * @example
 * ```typescript
 * // In production (future) - use SQLite
 * Effect.provide(
 *   TimerPersistence.sqlite({ path: './data/timers.db' })
 * )
 * ```
 *
 * @see {@link TimerPersistencePort} for the port interface specification
 * @see {@link https://effect.website/docs/guides/context-management/layers | Effect Layers}
 */
export class TimerPersistence {
	/**
	 * In-memory implementation of TimerPersistencePort backed by Effect.Ref and HashMap
	 *
	 * @remarks
	 * Storage is keyed by `${tenantId}/${serviceCallId}` and uses Effect.acquireRelease
	 * for proper resource management. Each Effect.provide call creates a fresh storage
	 * instance, ensuring test isolation. Uses immutable HashMap for efficient operations
	 * with structural sharing.
	 *
	 * **Resource Lifecycle (acquireRelease pattern):**
	 * - **Acquire**: `Ref.make(HashMap.empty())` - Creates empty storage when layer builds
	 * - **Use**: Storage available for the duration of the enclosing Scope
	 * - **Release**: `Ref.set(ref, HashMap.empty())` - Resets storage when Scope closes
	 *
	 * This pattern ensures atomic pairing of acquisition and cleanup, guaranteeing that
	 * storage is always properly disposed even if errors occur during usage.
	 *
	 * **Characteristics:**
	 * - **Isolation**: Each test gets fresh storage (no state pollution between tests)
	 * - **Speed**: No I/O operations (microseconds vs milliseconds)
	 * - **Determinism**: No file system or network dependencies
	 * - **Simplicity**: No migrations, no connection management
	 * - **Safety**: Automatic cleanup via Effect.acquireRelease
	 *
	 * **Use cases:**
	 * - Unit tests for workflows
	 * - Fast feedback loops during development
	 * - CI/CD pipelines where speed matters
	 * - Integration tests without infrastructure dependencies
	 *
	 * @example
	 * Basic usage in tests with per-test isolation
	 * ```typescript
	 * it.effect('saves and retrieves timer', () =>
	 *   Effect.gen(function* () {
	 *     const persistence = yield* TimerPersistencePort
	 *     const timer = ScheduledTimer.make({ tenantId, serviceCallId, dueAt, registeredAt, correlationId })
	 *     yield* persistence.save(timer)
	 *     const found = yield* persistence.find(tenantId, serviceCallId)
	 *     expect(Option.isSome(found)).toBe(true)
	 *   }).pipe(Effect.provide(TimerPersistence.inMemory))
	 * )
	 * ```
	 */
	static readonly inMemory: Layer.Layer<TimerPersistencePort> = Layer.scoped(
		TimerPersistencePort,
		Effect.gen(function* () {
			type TimerEntryKey = `${TenantId.Type}/${ServiceCallId.Type}`

			/**
			 * Acquire storage Ref with automatic cleanup on Scope close
			 *
			 * acquireRelease ensures that:
			 * 1. Storage is created (acquire)
			 * 2. Storage is reset to empty when Scope closes (release)
			 * 3. Acquisition and release are atomically paired (safer than separate finalizer)
			 */
			const storage: Ref.Ref<HashMap.HashMap<TimerEntryKey, TimerEntry.Type>> = yield* Effect.acquireRelease(
				Ref.make(HashMap.empty<TimerEntryKey, TimerEntry.Type>()),
				ref => Ref.set(ref, HashMap.empty()),
			)

			/**
			 * Helper to generate storage key from tenantId + serviceCallId.
			 *
			 * Uses "/" as delimiter, which is safe because both IDs are UUID7 format
			 * (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) and cannot contain "/".
			 *
			 * @invariant TenantId and ServiceCallId must not contain "/" character
			 */
			const makeKey = (tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type): TimerEntryKey =>
				`${tenantId}/${serviceCallId}`

			return TimerPersistencePort.of({
				/**
				 * Delete a timer entry by composite key
				 *
				 * Idempotent: deleting non-existent entry succeeds.
				 */
				delete: (tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type): Effect.Effect<void, PersistenceError> =>
					Ref.update(storage, HashMap.remove(makeKey(tenantId, serviceCallId))),

				/**
				 * Find a timer in ANY state (Scheduled or Reached)
				 * Used for observability/debugging.
				 */
				find: (tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type) =>
					Ref.get(storage).pipe(Effect.map(HashMap.get(makeKey(tenantId, serviceCallId)))),

				/**
				 * Find all timers with dueAt <= now and status = 'Scheduled'
				 *
				 * Only returns Scheduled timers (Reached excluded).
				 * Returns sorted chunk containing due timers sorted by:
				 *   1. dueAt ASC (earliest first)
				 *   2. registeredAt ASC (first-come-first-served for same dueAt)
				 *   3. serviceCallId ASC (UUID7 has embedded timestamp, provides deterministic tiebreaker)
				 *
				 * Sorting matches SQL behavior: ORDER BY due_at ASC, registered_at ASC, service_call_id ASC
				 */
				findDue: (now: DateTime.Utc) =>
					Ref.get(storage).pipe(
						Effect.map(HashMap.filter(TimerEntry.isScheduled)),
						Effect.map(HashMap.filter(entry => TimerEntry.isDue(entry, now))),
						Effect.map(HashMap.values),
						Effect.map(Chunk.fromIterable),
						Effect.map(
							Chunk.sort((a: TimerEntry.ScheduledTimer, b: TimerEntry.ScheduledTimer): -1 | 0 | 1 => {
								// Primary sort: dueAt ascending (earliest due first)
								const dueCompare = DateTime.Order(a.dueAt, b.dueAt)
								if (dueCompare !== 0) return dueCompare

								// Secondary sort: registeredAt ascending (first-come-first-served)
								const registeredCompare = DateTime.Order(a.registeredAt, b.registeredAt)
								if (registeredCompare !== 0) return registeredCompare

								// Tertiary sort: serviceCallId ascending (UUID7 determinism)
								return String.Order(a.serviceCallId, b.serviceCallId)
							}),
						),
					),

				/**
				 * Find a timer only if it's in SCHEDULED state
				 * Returns Option<ScheduledTimer> - filters out Reached timers.
				 * This is the primary query for domain operations (workflows that need to check/update scheduled timers).
				 */
				findScheduledTimer: (tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type) =>
					Ref.get(storage).pipe(
						Effect.map(HashMap.get(makeKey(tenantId, serviceCallId))),
						Effect.map(Option.filter(TimerEntry.isScheduled)),
					),

				/**
				 * Mark a timer as fired by transitioning Scheduled → Reached
				 *
				 * State transitions:
				 * - ScheduledTimer → ReachedTimer (normal case)
				 * - ReachedTimer → ReachedTimer (idempotent no-op, preserves original reachedAt)
				 * - NotFound → Success (idempotent)
				 */
				markFired: (
					tenantId: TenantId.Type,
					serviceCallId: ServiceCallId.Type,
					reachedAt: DateTime.Utc,
				): Effect.Effect<void, PersistenceError> =>
					Ref.update(
						storage,
						HashMap.modify(
							makeKey(tenantId, serviceCallId),
							timerEntry =>
								TimerEntry.isReached(timerEntry)
									? timerEntry // Idempotent: if already Reached, return as-is (preserve original reachedAt)
									: TimerEntry.markReached(timerEntry, reachedAt), // Transition: Scheduled → Reached
						),
					),

				/**
				 * Save or update a timer entry (upsert semantics)
				 *
				 * Idempotent: calling multiple times with same key succeeds.
				 */
				save: (entry: TimerEntry.ScheduledTimer) =>
					Ref.update(
						storage,
						HashMap.set<TimerEntryKey, TimerEntry.Type>(makeKey(entry.tenantId, entry.serviceCallId), entry),
					).pipe(
						Effect.catchAll(error =>
							Effect.fail(
								new PersistenceError({
									cause: `Failed to save timer: ${error}`,
									operation: 'save',
								}),
							),
						),
					),
			})
		}),
	)
}
