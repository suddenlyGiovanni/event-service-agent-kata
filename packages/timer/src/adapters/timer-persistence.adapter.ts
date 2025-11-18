/** biome-ignore-all lint/style/useNamingConvention:  explanation: Capitalized identifiers follow Effect service conventions */
import * as PlatformBun from '@effect/platform-bun'
import { Model, SqlClient, SqlSchema } from '@effect/sql'
import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as EffString from 'effect/String'

import { SQL } from '@event-service-agent/platform/database'
import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import { ReachedTimer, ScheduledTimer, TimerEntry } from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * FIXME: find a more correct name
 */
class TimerModel extends Model.Class<TimerModel>('TimerModel')({
	correlationId: Model.FieldOption(CorrelationId),
	dueAt: Schema.DateTimeUtc,
	reachedAt: Model.FieldOption(Schema.DateTimeUtc),
	registeredAt: Schema.DateTimeUtc,

	/**
	 * Service Call ID associated with this timer
	 * Primary key component
	 */
	serviceCallId: Model.GeneratedByApp(ServiceCallId),

	state: Schema.propertySignature(Schema.Literal('Scheduled', 'Reached')).pipe(
		Schema.withConstructorDefault(() => 'Scheduled' as const),
	),

	/**
	 * Tenant ID for multi-tenant isolation
	 * Primary key component
	 */
	tenantId: Model.GeneratedByApp(TenantId),
}) {}

/**
 * Helper: Convert Timer DB row to TimerEntry domain type
 * Handles both Scheduled and Reached states based on state column.
 */
const timerRecordToTimerEntry: (timer: TimerModel) => TimerEntry.Type = Match.type<TimerModel>().pipe(
	Match.withReturnType<TimerEntry.Type>(),
	Match.when(
		row => row.state === 'Scheduled',
		timerRow =>
			new ScheduledTimer({
				correlationId: timerRow.correlationId,
				dueAt: timerRow.dueAt,
				registeredAt: timerRow.registeredAt,
				serviceCallId: timerRow.serviceCallId,
				tenantId: timerRow.tenantId,
			}),
	),
	Match.when(
		row => row.state === 'Reached',
		timerRow =>
			new ReachedTimer({
				correlationId: timerRow.correlationId,
				dueAt: timerRow.dueAt,
				reachedAt: Option.getOrThrow(timerRow.reachedAt),
				registeredAt: timerRow.registeredAt,
				serviceCallId: timerRow.serviceCallId,
				tenantId: timerRow.tenantId,
			}),
	),
	Match.orElseAbsurd,
)

/**
 * Helper: Convert ScheduledTimer domain type to Timer DB row
 */
const scheduledTimerToTimerRecord = (scheduledTimer: TimerEntry.ScheduledTimer): TimerModel =>
	new TimerModel({
		correlationId: scheduledTimer.correlationId,
		dueAt: scheduledTimer.dueAt,
		reachedAt: Option.none(),
		registeredAt: scheduledTimer.registeredAt,
		serviceCallId: scheduledTimer.serviceCallId,
		state: scheduledTimer._tag,
		tenantId: scheduledTimer.tenantId,
	})

const make: Effect.Effect<Ports.TimerPersistencePort, never, SqlClient.SqlClient> = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	/**
	 * Helper: Map SQL errors to domain PersistenceError
	 *
	 * Provides consistent error handling across all SQL operations.
	 * Only SQL-level errors (connection, syntax, constraint violations) become PersistenceError.
	 * Application-level errors (like validation) should fail with their specific error types.
	 */
	const mapSqlError = (operation: keyof Ports.TimerPersistencePort) =>
		Effect.mapError(
			(error: unknown) =>
				new Ports.PersistenceError({
					cause: error as string, // FIXME: PersistenceError.cause should be of type Schema.Defect?
					operation,
				}),
		)

	/**
	 * Delete a timer entry by composite key
	 *
	 * Idempotent: deleting non-existent entry succeeds.
	 */
	const delete_ = Effect.fn('TimerPersistence.Live.delete')(
		(tenantId: TenantId.Type, serviceCallId: ServiceCallId.Type): Effect.Effect<void, Ports.PersistenceError> => {
			return pipe(
				Ports.TimerScheduleKey.make({
					serviceCallId,
					tenantId,
				}),
				SqlSchema.void({
					execute: ({ tenantId, serviceCallId }) =>
						sql`DELETE
                      FROM timer_schedules
                      WHERE ${sql.and([sql`tenant_id = ${tenantId}`, sql`service_call_id = ${serviceCallId}`])};
									`,
					Request: Ports.TimerScheduleKey,
				}),
				mapSqlError('delete'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId,
						tenantId,
					}),
				),
			)
		},
	)

	/**
	 * Find a timer in ANY state (Scheduled or Reached)
	 * Used for observability/debugging.
	 */
	const find = Effect.fn('TimerPersistence.Live.find')(
		(
			tenantId: TenantId.Type,
			serviceCallId: ServiceCallId.Type,
		): Effect.Effect<Option.Option<TimerEntry.Type>, Ports.PersistenceError> =>
			pipe(
				Ports.TimerScheduleKey.make({
					serviceCallId,
					tenantId,
				}),
				SqlSchema.findOne({
					execute: ({ tenantId, serviceCallId }) =>
						sql`
                        SELECT *
                        FROM timer_schedules
                        WHERE ${sql.and([sql`tenant_id = ${tenantId}`, sql`service_call_id = ${serviceCallId}`])};
										`,
					Request: Ports.TimerScheduleKey,
					Result: TimerModel,
				}),
				mapSqlError('find'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId,
						tenantId,
					}),
				),
				Effect.map(Option.map(timerRecordToTimerEntry)),
			),
	)

	/**
	 * Find all timers with dueAt <= now and status = 'Scheduled'
	 *
	 * Only returns Scheduled timers (Reached excluded).
	 * Returns sorted chunk containing due timers sorted by:
	 *   1. dueAt ASC (earliest first)
	 *   2. registeredAt ASC (first-come-first-served for same dueAt)
	 *   3. serviceCallId ASC (UUID7 has embedded timestamp, provides deterministic tiebreaker)
	 */
	const findDue = Effect.fn('TimerPersistence.Live.findDue')(
		(now: DateTime.Utc): Effect.Effect<Chunk.Chunk<TimerEntry.ScheduledTimer>, Ports.PersistenceError> =>
			pipe(
				now,
				SqlSchema.findAll({
					execute: now =>
						sql`
                        SELECT *
                        FROM timer_schedules
                        WHERE ${sql.and([sql`state = 'Scheduled'`, sql`due_at <= ${now}`])}
                        ORDER BY due_at
                            ASC,
                                 registered_at
                            ASC,
                                 service_call_id
                            ASC;
										`,
					Request: Schema.DateTimeUtc,
					Result: TimerModel,
				}),
				mapSqlError('findDue'),
				Effect.tap(Effect.annotateCurrentSpan({ now })),
				Effect.map(Chunk.fromIterable),
				Effect.map(
					Chunk.filterMap(timerRow =>
						timerRow.state === 'Scheduled'
							? Option.some(
									new ScheduledTimer({
										correlationId: timerRow.correlationId,
										dueAt: timerRow.dueAt,
										registeredAt: timerRow.registeredAt,
										serviceCallId: timerRow.serviceCallId,
										tenantId: timerRow.tenantId,
									}),
								)
							: Option.none(),
					),
				),
			),
	)

	/**
	 * Find only Scheduled timers (filters by state = 'Scheduled')
	 * Returns Option<ScheduledTimer>
	 */
	const findScheduledTimer = Effect.fn('TimerPersistence.Live.findScheduledTimer')(
		(
			tenantId: TenantId.Type,
			serviceCallId: ServiceCallId.Type,
		): Effect.Effect<Option.Option<TimerEntry.ScheduledTimer>, Ports.PersistenceError> =>
			pipe(
				Ports.TimerScheduleKey.make({
					serviceCallId,
					tenantId,
				}),
				SqlSchema.findOne({
					execute: ({ tenantId, serviceCallId }) =>
						sql`
                        SELECT *
                        FROM timer_schedules
                        WHERE ${sql.and([
													sql`tenant_id = ${tenantId}`,
													sql`service_call_id = ${serviceCallId}`,
													sql`state = 'Scheduled'`,
												])};
										`,
					Request: Ports.TimerScheduleKey,
					Result: TimerModel,
				}),
				mapSqlError('findScheduledTimer'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId,
						tenantId,
					}),
				),
				Effect.map(Option.map(timerRecordToTimerEntry)),
				Effect.map(Option.filter(TimerEntry.isScheduled)),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId,
						tenantId,
					}),
				),
			),
	)

	/**
	 * Mark a timer as fired by transitioning Scheduled → Reached
	 *
	 * State transitions:
	 * - ScheduledTimer → ReachedTimer (normal case)
	 * - ReachedTimer → ReachedTimer (idempotent no-op, preserves original reachedAt)
	 * - NotFound → Success (idempotent)
	 */
	const markFired = Effect.fn('TimerPersistence.Live.markFired')(
		(
			tenantId: TenantId.Type,
			serviceCallId: ServiceCallId.Type,
			reachedAt: DateTime.Utc,
		): Effect.Effect<void, Ports.PersistenceError> =>
			pipe(
				{
					reachedAt,
					serviceCallId,
					tenantId,
				},
				SqlSchema.void({
					execute: ({ reachedAt, tenantId, serviceCallId }) =>
						sql`
                        UPDATE timer_schedules
                        SET state      = 'Reached',
                            reached_at = ${reachedAt}
                        WHERE ${sql.and([
													sql`tenant_id = ${tenantId}`,
													sql`service_call_id = ${serviceCallId}`,
													sql`state = 'Scheduled'`,
												])};
										`,
					Request: Schema.Struct({
						...Ports.TimerScheduleKey.fields,
						reachedAt: Schema.DateTimeUtc,
					}),
				}),
				mapSqlError('markFired'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						reachedAt: reachedAt,
						serviceCallId,
						tenantId,
					}),
				),
			),
	)

	/**
	 * Save or update a timer entry (upsert semantics)
	 *
	 * Idempotent: calling multiple times with same key succeeds.
	 */
	const save = Effect.fn('TimerPersistence.Live.save')(
		(entry: TimerEntry.ScheduledTimer): Effect.Effect<void, Ports.PersistenceError> =>
			pipe(
				entry,
				scheduledTimerToTimerRecord,
				SqlSchema.void({
					execute: timerRecord =>
						sql`
-- Upsert timer: insert new or update existing on conflict
INSERT INTO timer_schedules (tenant_id,
                             service_call_id,
                             correlation_id,
                             due_at,
                             registered_at,
                             reached_at,
                             state)
VALUES (${timerRecord.tenantId},
        ${timerRecord.serviceCallId},
        ${timerRecord.correlationId},
        ${timerRecord.dueAt},
        ${timerRecord.registeredAt},
        ${timerRecord.reachedAt},
        ${timerRecord.state})
ON CONFLICT (tenant_id, service_call_id)
    DO UPDATE SET correlation_id = EXCLUDED.correlation_id,
                  due_at         = EXCLUDED.due_at,
                  registered_at  = EXCLUDED.registered_at,
                  reached_at     = EXCLUDED.reached_at,
                  state          = EXCLUDED.state;
								`,
					Request: TimerModel.insert,
				}),
				mapSqlError('save'),
				Effect.tap(Effect.annotateCurrentSpan({ ...entry })),
			),
	)

	return Ports.TimerPersistencePort.of({
		delete: delete_,
		find,
		findDue,
		findScheduledTimer,
		markFired,
		save,
	})
})

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
	static readonly inMemory: Layer.Layer<Ports.TimerPersistencePort> = Layer.scoped(
		Ports.TimerPersistencePort,
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

			return Ports.TimerPersistencePort.of({
				/**
				 * Delete a timer entry by composite key
				 *
				 * Idempotent: deleting non-existent entry succeeds.
				 */
				delete: (
					tenantId: TenantId.Type,
					serviceCallId: ServiceCallId.Type,
				): Effect.Effect<void, Ports.PersistenceError> =>
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
								return EffString.Order(a.serviceCallId, b.serviceCallId)
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
				): Effect.Effect<void, Ports.PersistenceError> =>
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
								new Ports.PersistenceError({
									cause: `Failed to save timer: ${error}`,
									operation: 'save',
								}),
							),
						),
					),
			})
		}),
	)

	/**
	 * Live Layer using SQLite with file-backed database
	 */
	static readonly Live = Layer.provide(
		Layer.effect(Ports.TimerPersistencePort, make),
		Layer.provide(SQL.Live, PlatformBun.BunPath.layer),
	)

	/**
	 * Test Layer using SQLite with in-memory database
	 *
	 * Provides realistic persistence behavior without external dependencies.
	 * Uses SQLite in-memory mode for fast, isolated tests.
	 */
	static readonly Test = Layer.provide(
		Layer.effect(Ports.TimerPersistencePort, make),
		Layer.provide(SQL.Test, PlatformBun.BunPath.layer),
	)
}
