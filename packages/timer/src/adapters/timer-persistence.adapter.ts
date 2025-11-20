/** biome-ignore-all lint/style/useNamingConvention:  explanation: Capitalized identifiers follow Effect service conventions */

import type * as Platform from '@effect/platform'
import * as Sql from '@effect/sql'
import * as Chunk from 'effect/Chunk'
import type { ConfigError } from 'effect/ConfigError'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { SQL } from '@event-service-agent/platform/database'
import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import { ReachedTimer, ScheduledTimer, TimerEntry } from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * Database row representation for timer_schedules table.
 * Maps to both Scheduled and Reached timer states via the state column.
 */
class TimerScheduleRow extends Sql.Model.Class<TimerScheduleRow>('TimerScheduleRow')({
	correlationId: Sql.Model.FieldOption(CorrelationId),
	dueAt: Schema.DateTimeUtc,
	reachedAt: Sql.Model.FieldOption(Schema.DateTimeUtc),
	registeredAt: Schema.DateTimeUtc,

	/**
	 * Service Call ID associated with this timer
	 * Primary key component
	 */
	serviceCallId: Sql.Model.GeneratedByApp(ServiceCallId),

	state: Schema.propertySignature(Schema.Literal('Scheduled', 'Reached')).pipe(
		Schema.withConstructorDefault(() => 'Scheduled' as const),
	),

	/**
	 * Tenant ID for multi-tenant isolation
	 * Primary key component
	 */
	tenantId: Sql.Model.GeneratedByApp(TenantId),
}) {}

/**
 * Helper: Convert Timer DB row to TimerEntry domain type
 * Handles both Scheduled and Reached states based on state column.
 */
const timerRecordToTimerEntry: (timer: TimerScheduleRow) => TimerEntry.Type = Match.type<TimerScheduleRow>().pipe(
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
const scheduledTimerToTimerRecord = (scheduledTimer: TimerEntry.ScheduledTimer): TimerScheduleRow =>
	new TimerScheduleRow({
		correlationId: scheduledTimer.correlationId,
		dueAt: scheduledTimer.dueAt,
		reachedAt: Option.none(),
		registeredAt: scheduledTimer.registeredAt,
		serviceCallId: scheduledTimer.serviceCallId,
		state: scheduledTimer._tag,
		tenantId: scheduledTimer.tenantId,
	})

const make: Effect.Effect<Ports.TimerPersistencePort, never, Sql.SqlClient.SqlClient> = Effect.gen(function* () {
	const sql = yield* Sql.SqlClient.SqlClient

	/**
	 * Helper: Map SQL errors to domain PersistenceError
	 *
	 * Provides consistent error handling across all SQL operations.
	 * Preserves full error context (stack traces, nested errors) via Schema.Defect.
	 * Extracts human-readable message from Error objects for observability.
	 *
	 * Only SQL-level errors (connection, syntax, constraint violations) become PersistenceError.
	 * Application-level errors (like validation) should fail with their specific error types.
	 */
	const mapSqlError = (operation: keyof Ports.TimerPersistencePort) =>
		Effect.mapError(
			(error: unknown) =>
				new Ports.PersistenceError({
					cause: error,
					message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
					operation,
				}),
		)

	/**
	 * Delete a timer entry by composite key
	 *
	 * Idempotent: deleting non-existent entry succeeds.
	 */
	const delete_ = Effect.fn('TimerPersistence.Live.delete')(
		(key: Ports.TimerScheduleKey.Type): Effect.Effect<void, Ports.PersistenceError> => {
			return pipe(
				key,
				Sql.SqlSchema.void({
					execute: ({ tenantId, serviceCallId }) =>
						sql`
                DELETE
                FROM timer_schedules
                WHERE ${sql.and([sql`tenant_id = ${tenantId}`, sql`service_call_id = ${serviceCallId}`])};
						`,
					Request: Ports.TimerScheduleKey,
				}),
				mapSqlError('delete'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId: key.serviceCallId,
						tenantId: key.tenantId,
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
		(key: Ports.TimerScheduleKey.Type): Effect.Effect<Option.Option<TimerEntry.Type>, Ports.PersistenceError> =>
			pipe(
				key,
				Sql.SqlSchema.findOne({
					execute: ({ tenantId, serviceCallId }) =>
						sql`
                SELECT *
                FROM timer_schedules
                WHERE ${sql.and([sql`tenant_id = ${tenantId}`, sql`service_call_id = ${serviceCallId}`])};
						`,
					Request: Ports.TimerScheduleKey,
					Result: TimerScheduleRow,
				}),
				mapSqlError('find'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId: key.serviceCallId,
						tenantId: key.tenantId,
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
	 *
	 * Performance: Query is optimized by idx_timer_schedules_due_at (state, due_at, tenant_id)
	 * which provides efficient filtering and range scan for polling worker.
	 * @see 0003_timer_schedules_schema.ts - Index definition
	 */
	const findDue = Effect.fn('TimerPersistence.Live.findDue')(
		(now: DateTime.Utc): Effect.Effect<Chunk.Chunk<TimerEntry.ScheduledTimer>, Ports.PersistenceError> =>
			pipe(
				now,
				Sql.SqlSchema.findAll({
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
					Result: TimerScheduleRow,
				}),
				mapSqlError('findDue'),
				Effect.tap(Effect.annotateCurrentSpan({ now })),
				Effect.map(Chunk.fromIterable),
				Effect.map(Chunk.map(timerRecordToTimerEntry)),
				Effect.map(Chunk.filter(TimerEntry.isScheduled)),
			),
	)

	/**
	 * Find only Scheduled timers (filters by state = 'Scheduled')
	 * Returns Option<ScheduledTimer>
	 */
	const findScheduledTimer = Effect.fn('TimerPersistence.Live.findScheduledTimer')(
		(
			key: Ports.TimerScheduleKey.Type,
		): Effect.Effect<Option.Option<TimerEntry.ScheduledTimer>, Ports.PersistenceError> =>
			pipe(
				key,
				Sql.SqlSchema.findOne({
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
					Result: TimerScheduleRow,
				}),
				mapSqlError('findScheduledTimer'),
				Effect.tap(
					Effect.annotateCurrentSpan({
						serviceCallId: key.serviceCallId,
						tenantId: key.tenantId,
					}),
				),
				Effect.map(Option.map(timerRecordToTimerEntry)),
				Effect.map(Option.filter(TimerEntry.isScheduled)),
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
		(params: {
			readonly key: Ports.TimerScheduleKey.Type
			readonly reachedAt: DateTime.Utc
		}): Effect.Effect<void, Ports.PersistenceError> =>
			pipe(
				{
					reachedAt: params.reachedAt,
					serviceCallId: params.key.serviceCallId,
					tenantId: params.key.tenantId,
				},
				Sql.SqlSchema.void({
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
						reachedAt: params.reachedAt,
						serviceCallId: params.key.serviceCallId,
						tenantId: params.key.tenantId,
					}),
				),
			),
	)

	/**
	 * Save or update a timer entry (upsert semantics)
	 *
	 * Idempotent: calling multiple times with same key succeeds.
	 *
	 * **State transition semantics:**
	 * - If no timer exists: creates new Scheduled timer
	 * - If Scheduled timer exists: updates fields (e.g., new dueAt for rescheduling)
	 * - If Reached timer exists: NO-OP (all columns preserved, no UPDATE performed)
	 *
	 * @remarks
	 * Reached is a terminal state per ADR-0003. Once a timer fires and
	 * transitions to Reached, subsequent save() calls will NOT modify ANY
	 * columns. This prevents accidental resurrection, preserves the idempotency
	 * marker (reached_at), and ensures fired timers remain immutable.
	 *
	 * The SQL uses a conditional UPDATE clause to enforce full NO-OP:
	 * - `WHERE timer_schedules.state != 'Reached'`: Blocks UPDATE entirely if
	 *   existing row is Reached, preserving all columns (state, reached_at, due_at, etc.)
	 * - Performance: No row writes when timer already fired (early exit)
	 *
	 * If genuine re-scheduling is needed after firing, use delete() + save().
	 *
	 * @see ADR-0003 for timer state machine and terminal state semantics
	 */
	const save = Effect.fn('TimerPersistence.Live.save')(
		(entry: TimerEntry.ScheduledTimer): Effect.Effect<void, Ports.PersistenceError> =>
			pipe(
				entry,
				scheduledTimerToTimerRecord,
				Sql.SqlSchema.void({
					execute: timerRecord =>
						sql`-- Upsert timer: insert new or update existing on conflict
-- Enforces full NO-OP for Reached timers (immutability after firing)
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
                  state          = EXCLUDED.state
-- Block UPDATE entirely if existing timer already Reached (terminal state)
WHERE timer_schedules.state != 'Reached';
								`,
					Request: TimerScheduleRow.insert,
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
 * - {@link Test} - Fast, isolated, SQLite in-memory storage for testing
 * - {@link Live} - Persistent file-backed SQLite database for production
 *
 * @remarks
 * This class follows the namespace pattern for organizing related Layer implementations.
 * Each static member provides a Layer that implements TimerPersistencePort with different
 * storage strategies. Both implementations use the same SQL adapter with different
 * database configurations (`:memory:` vs file-backed).
 *
 * @example
 * ```typescript ignore
 * // In tests - use in-memory SQLite
 * import { TimerPersistence } from '../adapters/timer-persistence.adapter.ts'
 *
 * Effect.gen(function* () {
 *   const persistence = yield* TimerPersistencePort
 *   yield* persistence.save(timer)
 * }).pipe(
 *   Effect.provide(TimerPersistence.Test)
 * )
 * ```
 *
 * @example
 * ```typescript ignore
 * // In production - use file-backed SQLite
 * Effect.provide(
 *   TimerPersistence.Live
 * )
 * ```
 *
 * @see {@link TimerPersistencePort} for the port interface specification
 * @see {@link https://effect.website/docs/guides/context-management/layers | Effect Layers}
 */
export class TimerPersistence {
	/**
	 * Live Layer using SQLite with file-backed database
	 */
	static readonly Live: Layer.Layer<
		Ports.TimerPersistencePort,
		| Sql.SqlError.SqlError
		| Sql.Migrator.MigrationError
		| ConfigError
		| Platform.Error.BadArgument
		| Platform.Error.SystemError,
		never
	> = Layer.provide(Layer.effect(Ports.TimerPersistencePort, make), SQL.Live)

	/**
	 * Test Layer using SQLite with in-memory database
	 *
	 * Provides realistic persistence behavior without external dependencies.
	 * Uses SQLite in-memory mode for fast, isolated tests.
	 *
	 * **Characteristics:**
	 * - **Isolation**: Each test gets fresh database (`:memory:` per test run)
	 * - **Speed**: In-memory operations (faster than file I/O)
	 * - **Realistic**: Uses actual SQL queries (validates production SQL path)
	 * - **Migrations**: Runs same migrations as production
	 * - **No cleanup needed**: Database disposed when scope closes
	 *
	 * @example
	 * Basic usage in tests with SQLite in-memory
	 * ```typescript ignore
	 * it.effect('saves and retrieves timer', () =>
	 *   Effect.gen(function* () {
	 *     const persistence = yield* TimerPersistencePort
	 *     const timer = ScheduledTimer.make({ tenantId, serviceCallId, dueAt, registeredAt, correlationId })
	 *     yield* persistence.save(timer)
	 *     const found = yield* persistence.find({ tenantId, serviceCallId })
	 *     expect(Option.isSome(found)).toBe(true)
	 *   }).pipe(Effect.provide(TimerPersistence.Test))
	 * )
	 * ```
	 */
	static readonly Test: Layer.Layer<
		Ports.TimerPersistencePort,
		| Sql.SqlError.SqlError
		| Sql.Migrator.MigrationError
		| ConfigError
		| Platform.Error.BadArgument
		| Platform.Error.SystemError,
		never
	> = Layer.provide(Layer.effect(Ports.TimerPersistencePort, make), SQL.Test)
}
