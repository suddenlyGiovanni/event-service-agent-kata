import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { hole, pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import type { ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import type { TimerEntry } from '#/domain/timer-entry.domain.ts'
import { PersistenceError, TimerPersistencePort } from '#/ports/timer-persistence.port.ts'

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
 * import { TimerPersistence } from '#/adapters/timer-persistence.adapter.ts'
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
	 * Storage is keyed by `${tenantId}/${serviceCallId}` and scoped to the Layer's lifetime.
	 * Each Effect.provide call creates a fresh storage instance, ensuring test isolation.
	 * Uses immutable HashMap for efficient operations with structural sharing.
	 *
	 * **Characteristics:**
	 * - **Isolation**: Each test gets fresh storage (no state pollution between tests)
	 * - **Speed**: No I/O operations (microseconds vs milliseconds)
	 * - **Determinism**: No file system or network dependencies
	 * - **Simplicity**: No migrations, no connection management
	 *
	 * **Use cases:**
	 * - Unit tests for workflows
	 * - Fast feedback loops during development
	 * - CI/CD pipelines where speed matters
	 * - Integration tests without infrastructure dependencies
	 *
	 * @example
	 * ```typescript
	 * import { TimerPersistence } from '#/adapters/timer-persistence.adapter.ts'
	 *
	 * describe('scheduleTimerWorkflow', () => {
	 *   it.effect('saves timer successfully', () =>
	 *     Effect.gen(function* () {
	 *       const persistence = yield* TimerPersistencePort
	 *       yield* persistence.save(timer)
	 *
	 *       const found = yield* persistence.find(tenantId, serviceCallId)
	 *       expect(Option.isSome(found)).toBe(true)
	 *     }).pipe(
	 *       Effect.provide(TimerPersistence.inMemory)
	 *     )
	 *   )
	 * })
	 * ```
	 *
	 * @see {@link Layer.effect} for Layer creation pattern
	 * @see {@link Ref} for managed mutable state
	 * @see {@link HashMap} for immutable map operations
	 */
	static readonly inMemory: Layer.Layer<TimerPersistencePort> = Layer.effect(
		TimerPersistencePort,
		Effect.gen(function* () {
			const storage = yield* Ref.make(
				HashMap.empty<`${TenantId.Type}/${ServiceCallId.Type}`, TimerEntry.ScheduledTimer>(),
			)

			/**
			 * Helper to generate storage key from tenantId + serviceCallId
			 */
			const makeKey = (
				tenantId: TenantId.Type,
				serviceCallId: ServiceCallId.Type,
			): `${TenantId.Type}/${ServiceCallId.Type}` => `${tenantId}/${serviceCallId}`

			return TimerPersistencePort.of({
				/**
				 * Delete a timer entry by composite key
				 *
				 * Idempotent: deleting non-existent entry succeeds.
				 */
				delete: (_tenantId: TenantId.Type, _serviceCallId: ServiceCallId.Type) => hole(),

				/**
				 * Find a timer by composite key (tenantId, serviceCallId)
				 *
				 * Returns None if not found (not an error).
				 */
				find: (tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type) =>
					pipe(
						Ref.get(storage),
						Effect.map(map => HashMap.get(map, makeKey(tenantId, serviceCallId))),
						Effect.catchAll(error =>
							Effect.fail(
								new PersistenceError({
									cause: `Failed to find timer: ${error}`,
									operation: 'find',
								}),
							),
						),
					),

				/**
				 * Find all timers with dueAt <= now and status = 'Scheduled'
				 *
				 * Returns empty chunk if none found.
				 */
				findDue: (_now: DateTime.Utc) => hole(),

				/**
				 * Mark a timer as fired by deleting it from storage
				 *
				 * In-memory implementation removes fired timers (they're no longer needed).
				 * Idempotent: succeeds even if entry doesn't exist.
				 */
				markFired: (_tenantId: TenantId.Type, _serviceCallId: ServiceCallId.Type, _reachedAt: DateTime.Utc) => hole(),

				/**
				 * Save or update a timer entry (upsert semantics)
				 *
				 * Idempotent: calling multiple times with same key succeeds.
				 */
				save: (entry: TimerEntry.ScheduledTimer) =>
					pipe(
						storage,
						Ref.update(HashMap.set(makeKey(entry.tenantId, entry.serviceCallId), entry)),
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
