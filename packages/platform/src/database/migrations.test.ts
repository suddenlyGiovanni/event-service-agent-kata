/**
 * Platform database migration integration tests.
 *
 * Tests verify:
 * - Bootstrap migration (0001) executes successfully
 * - All expected tables are created with correct structure
 * - Foreign key relationships are established
 * - Indexes are created
 * - Schema dump is generated (persistent mode)
 */

import * as PlatformBun from '@effect/platform-bun'
import * as Sql from '@effect/sql'
import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { SQL } from './sql.ts'

describe('Platform Database Migrations', () => {
	/**
	 * Test layer: In-memory database with platform migrations
	 */
	const TestLayer = SQL.Test.pipe(Layer.provide(PlatformBun.BunContext.layer))

	describe('Bootstrap Migration (0001_bootstrap_schema.ts)', () => {
		it.effect('should execute without errors', () =>
			Effect.gen(function* () {
				// If we get here, migrations succeeded
				const sql = yield* Sql.SqlClient.SqlClient
				const result = yield* sql`SELECT 1 as test`
				expect(result).toHaveLength(1)
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should create service_calls table', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Query schema for table existence
				const tables = yield* sql`
					SELECT name, sql 
					FROM sqlite_master 
					WHERE type='table' AND name='service_calls'
				`

				expect(tables).toHaveLength(1)
				expect(tables[0]?.['name']).toBe('service_calls')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should create timer_schedules table', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const tables = yield* sql`
					SELECT name, sql 
					FROM sqlite_master 
					WHERE type='table' AND name='timer_schedules'
				`

				expect(tables).toHaveLength(1)
				expect(tables[0]?.['name']).toBe('timer_schedules')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should create http_execution_log table', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const tables = yield* sql`
					SELECT name, sql 
					FROM sqlite_master 
					WHERE type='table' AND name='http_execution_log'
				`

				expect(tables).toHaveLength(1)
				expect(tables[0]?.['name']).toBe('http_execution_log')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should create outbox table', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const tables = yield* sql`
					SELECT name, sql 
					FROM sqlite_master 
					WHERE type='table' AND name='outbox'
				`

				expect(tables).toHaveLength(1)
				expect(tables[0]?.['name']).toBe('outbox')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should create effect_sql_migrations tracking table', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const tables = yield* sql`
					SELECT name 
					FROM sqlite_master 
					WHERE type='table' AND name='effect_sql_migrations'
				`

				expect(tables).toHaveLength(1)
				expect(tables[0]?.['name']).toBe('effect_sql_migrations')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should track bootstrap migration as executed', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const migrations = yield* sql`
					SELECT migration_id, name 
					FROM effect_sql_migrations
					ORDER BY migration_id
				`

				// Should have at least the bootstrap migration
				expect(migrations.length).toBeGreaterThanOrEqual(1)

				const bootstrap = migrations[0]
				expect(bootstrap?.['migrationId']).toBe(1)
				expect(bootstrap?.['name']).toBe('bootstrap_schema')
			}).pipe(Effect.provide(TestLayer)),
		)
	})

	describe('Table Structure Validation', () => {
		it.effect('service_calls should have correct primary key', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Get table schema
				const columns = yield* sql`
					SELECT name, type, pk 
					FROM pragma_table_info('service_calls')
					WHERE pk > 0
					ORDER BY pk
				`

				// Primary key: (tenant_id, service_call_id)
				expect(columns).toHaveLength(2)
				expect(columns[0]?.['name']).toBe('tenant_id')
				expect(columns[1]?.['name']).toBe('service_call_id')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('timer_schedules should have foreign key to service_calls', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Composite FK returns multiple rows (one per column)
				const foreignKeys = yield* sql`
					SELECT "from", "table", "to"
					FROM pragma_foreign_key_list('timer_schedules')
				`

				// Bootstrap migration creates composite FK (tenant_id, service_call_id)
				expect(foreignKeys.length).toBe(2)

				// Verify both columns reference service_calls
				const fkTable = foreignKeys[0]?.['table']
				expect(fkTable).toBe('service_calls')
				expect(foreignKeys.every(fk => fk['table'] === 'service_calls')).toBe(true)

				// Verify FK columns (order matches definition)
				const fromColumns = foreignKeys.map(fk => fk['from'])
				const toColumns = foreignKeys.map(fk => fk['to'])
				expect(fromColumns).toContain('tenant_id')
				expect(fromColumns).toContain('service_call_id')
				expect(toColumns).toContain('tenant_id')
				expect(toColumns).toContain('service_call_id')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('outbox should have correct primary key and index', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Check primary key
				const pkColumns = yield* sql`
					SELECT name 
					FROM pragma_table_info('outbox')
					WHERE pk > 0
				`
				expect(pkColumns).toHaveLength(1)
				expect(pkColumns[0]?.['name']).toBe('id')

				// Check index exists for (published, created_at)
				const indexes = yield* sql`
					SELECT name 
					FROM sqlite_master 
					WHERE type='index' 
					AND tbl_name='outbox'
					AND name LIKE '%published%'
				`
				expect(indexes.length).toBeGreaterThanOrEqual(1)
			}).pipe(Effect.provide(TestLayer)),
		)
	})

	describe('SQLite Pragma Configuration', () => {
		it.effect('should enable foreign key constraints', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const result = yield* sql`PRAGMA foreign_keys`

				expect(result).toHaveLength(1)
				expect(result[0]?.['foreignKeys']).toBe(1) // 1 = ON
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should have MEMORY journal mode (in-memory database)', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const result = yield* sql`PRAGMA journal_mode`

				// In-memory databases always use 'memory' journal mode
				// WAL mode (set in bootstrap migration) only applies to persistent databases
				expect(result).toHaveLength(1)
				expect(result[0]?.['journalMode']?.toString().toLowerCase()).toBe('memory')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should have NORMAL synchronous mode', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const result = yield* sql`PRAGMA synchronous`

				expect(result).toHaveLength(1)
				expect(result[0]?.['synchronous']).toBe(1) // 1 = NORMAL
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should have MEMORY temp_store', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				const result = yield* sql`PRAGMA temp_store`

				expect(result).toHaveLength(1)
				expect(result[0]?.['tempStore']).toBe(2) // 2 = MEMORY
			}).pipe(Effect.provide(TestLayer)),
		)
	})

	describe('Data Integrity', () => {
		it.effect('should enforce foreign key constraints', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Try to insert timer without corresponding service_call
				const result = yield* Effect.either(
					sql`
						INSERT INTO timer_schedules (tenant_id, service_call_id)
						VALUES ('tenant-123', 'nonexistent-service-call-id')
					`,
				)

				// Should fail due to FK constraint
				expect(result._tag).toBe('Left')
			}).pipe(Effect.provide(TestLayer)),
		)

		it.effect('should allow valid insertions', () =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				// Insert service_call first (stub table only has PK columns)
				yield* sql`
					INSERT INTO service_calls (tenant_id, service_call_id)
					VALUES ('tenant-123', 'call-123')
				`

				// Then insert timer referencing it
				yield* sql`
					INSERT INTO timer_schedules (tenant_id, service_call_id)
					VALUES ('tenant-123', 'call-123')
				`

				// Verify insertion
				const timers = yield* sql`
					SELECT tenant_id, service_call_id 
					FROM timer_schedules
					WHERE tenant_id = 'tenant-123'
				`

				expect(timers).toHaveLength(1)
				expect(timers[0]?.['tenantId']).toBe('tenant-123')
				expect(timers[0]?.['serviceCallId']).toBe('call-123')
			}).pipe(Effect.provide(TestLayer)),
		)
	})
})
