import * as PlatformBun from '@effect/platform-bun'
import * as Sql from '@effect/sql'
import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { SQL } from './client.ts'

describe('SQL.Test (in-memory SQLite client)', () => {
	const testLayer = SQL.Test.pipe(Layer.provide(PlatformBun.BunContext.layer))

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

			// Verify bootstrap migration was executed
			expect(migrations).toHaveLength(1)

			const firstMigration = migrations[0]
			expect(firstMigration).toBeDefined()
			expect(firstMigration?.migrationId).toBe(1)
			expect(firstMigration?.name).toBe('bootstrap_schema')
		}).pipe(Effect.provide(testLayer)),
	)
})
