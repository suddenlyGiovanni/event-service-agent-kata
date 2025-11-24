import * as Sql from '@effect/sql'
import { describe, expect, it } from '@effect/vitest'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { flow, pipe } from 'effect/Function'
import * as Option from 'effect/Option'

import { SQL } from './sql.ts'

describe('SQL Platform Client', () => {
	describe('Bootstrap Migration', () => {
		it.scoped('should create bootstrap tables after migration', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Query service_calls table schema to verify it exists
				const serviceCallsSchema = yield* sql<{
					name: string
					type: string
				}>`
              SELECT name, type
              FROM sqlite_master
              WHERE type = 'table'
                AND name = 'service_calls';
					`

				expect(serviceCallsSchema).toHaveLength(1)
				expect(serviceCallsSchema[0]).toMatchObject({
					name: 'service_calls',
					type: 'table',
				})

				// Query timer_schedules table schema to verify it exists
				const timerSchedulesSchema = yield* sql<{
					name: string
					type: string
				}>`
              SELECT name, type
              FROM sqlite_master
              WHERE type = 'table'
                AND name = 'timer_schedules';
					`

				expect(timerSchedulesSchema).toHaveLength(1)
				expect(timerSchedulesSchema[0]).toMatchObject({
					name: 'timer_schedules',
					type: 'table',
				})

				// Verify foreign key constraint exists (service_call_id references service_calls)
				const foreignKeys = yield* sql`PRAGMA foreign_key_list(timer_schedules);`

				expect(foreignKeys.length).toBeGreaterThan(0)
				const serviceCallFk = foreignKeys.find(
					(fk: { table?: string; from?: string }) => fk.table === 'service_calls' && fk.from === 'service_call_id',
				)
				expect(serviceCallFk).toBeDefined()
			}).pipe(Effect.provide(SQL.Test)),
		)

		it.scoped('should track migration execution', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const migrations = yield* sql<{
					migrationId: number
					name: string
				}>`
              SELECT migration_id AS migrationId, name
              FROM effect_sql_migrations
              ORDER BY migration_id;
					`

				// Verify all migrations were executed (bootstrap + timer)
				expect(migrations.length).toBeGreaterThanOrEqual(2)

				const bootstrap = migrations[0]
				expect(bootstrap).toBeDefined()
				expect(bootstrap?.migrationId).toBe(1)
				expect(bootstrap?.name).toBe('bootstrap_schema')

				const timer = migrations[1]
				expect(timer).toBeDefined()
				expect(timer?.migrationId).toBe(3)
				expect(timer?.name).toBe('timer_schedules_schema')
			}).pipe(Effect.provide(SQL.Test)),
		)
	})

	describe('SQLite Pragma Configuration', () => {
		it.scoped('should enable foreign key constraints (PRAGMA foreign_keys = ON)', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Verify PRAGMA foreign_keys is ON
				const pragmaResult = yield* sql<{
					foreignKeys: number
				}>`PRAGMA foreign_keys;`

				expect(pragmaResult[0]).toBeDefined()
				expect(pragmaResult[0]?.foreignKeys).toBe(1) // 1 = ON
			}).pipe(Effect.provide(SQL.Test)),
		)

		it.scoped('should enforce foreign key constraints (Test layer)', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Attempt to insert timer_schedule referencing non-existent service_call
				// This MUST fail if FK constraints are enforced
				const exit = yield* sql`
              INSERT INTO timer_schedules (tenant_id, service_call_id, due_at, state)
              VALUES ('tenant-fk-test', 'nonexistent-call', datetime('now', '+5 minutes'), 'Scheduled');
					`.pipe(Effect.exit)

				// Verify FK constraint violation using Exit.match
				const errorMessage: string = pipe(
					exit,
					Exit.match({
						onFailure: flow(
							Cause.failureOption,
							Option.match({
								onNone: () => '',
								onSome: (error) => (error.cause instanceof Error ? error.cause.message : String(error.cause)),
							}),
						),
						onSuccess: () => {
							throw new Error('Expected FK constraint violation, but INSERT succeeded')
						},
					}),
				)

				// Verify the error is related to foreign key constraints
				const isConstraintError =
					errorMessage.includes('constraint') ||
					errorMessage.includes('FOREIGN KEY') ||
					errorMessage.includes('foreign key')
				expect(isConstraintError).toBe(true)
			}).pipe(Effect.provide(SQL.Test)),
		)
	})
})
