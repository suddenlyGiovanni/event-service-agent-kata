import * as PlatformBun from '@effect/platform-bun'
import * as Sql from '@effect/sql'
import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { SQL } from './sql.ts'

describe('SQL Platform Client', () => {
	const testLayer = SQL.Test.pipe(Layer.provide(PlatformBun.BunContext.layer))

	describe('Bootstrap Migration', () => {
		it.effect('should create bootstrap tables after migration', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Query sqlite_master to verify tables exist
				const tables = yield* sql<{
					name: string
				}>`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`

				const tableNames = tables.map(row => row.name)

				// Verify bootstrap migration created all expected tables
				expect(tableNames).toContain('service_calls')
				expect(tableNames).toContain('timer_schedules')
				expect(tableNames).toContain('http_execution_log')
				expect(tableNames).toContain('outbox')
				expect(tableNames).toContain('effect_sql_migrations')
			}).pipe(Effect.provide(testLayer)),
		)

		it.effect('should track migration execution', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const migrations = yield* sql<{
					migrationId: number
					name: string
				}>`SELECT migration_id AS migrationId, name FROM effect_sql_migrations ORDER BY migration_id`

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
			}).pipe(Effect.provide(testLayer)),
		)
	})

	describe('SQLite Pragma Configuration', () => {
		it.effect('should enable foreign key constraints (PRAGMA foreign_keys = ON)', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Verify PRAGMA foreign_keys is ON
				const pragmaResult = yield* sql<{
					foreignKeys: number
				}>`PRAGMA foreign_keys`

				expect(pragmaResult[0]).toBeDefined()
				expect(pragmaResult[0]?.foreignKeys).toBe(1) // 1 = ON
			}).pipe(Effect.provide(testLayer)),
		)

		it.effect('should enforce foreign key constraints', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Attempt to insert timer_schedule referencing non-existent service_call
				// This MUST fail if FK constraints are enforced
				const result = yield* sql`
					INSERT INTO timer_schedules (tenant_id, service_call_id)
					VALUES ('tenant-123', 'call-123')
				`.pipe(Effect.either) // Catch expected error

				// Verify FK constraint violation
				expect(result._tag).toBe('Left')
				if (result._tag === 'Left') {
					// Effect SQL wraps SQLiteError in SqlError
					// The actual FK error is in error.cause.message
					const causeMessage =
						result.left.cause instanceof Error ? result.left.cause.message : String(result.left.cause)
					const isConstraintError =
						causeMessage.includes('constraint') ||
						causeMessage.includes('FOREIGN KEY') ||
						causeMessage.includes('foreign key')
					expect(isConstraintError).toBe(true)
				}
			}).pipe(Effect.provide(testLayer)),
		)
	})
})
