#!/usr/bin/env bun

/**
 * Database reset script for local development.
 *
 * Drops all tables and re-runs migrations from scratch.
 * Useful for:
 * - Testing migrations on clean slate
 * - Fixing corrupted local database
 * - Starting fresh during development
 *
 * ⚠️  WARNING: This script DESTROYS ALL DATA in the database.
 *     Use only for local development, never in production.
 *
 * Usage:
 *   bun run db:reset                   # From workspace root
 *
 * Environment Variables (.env or shell):
 *   DB_PATH        - Database file path (default: <workspace>/data/db.sqlite)
 *   DB_SCHEMA_DIR  - Schema dump directory (default: <workspace>/data)
 *
 * Environment File:
 *   Scripts automatically load <workspace>/.env if present.
 *   See .env.example for available configuration options.
 *   Relative paths in .env work correctly when running from workspace root.
 *
 * Exit Codes:
 *   0 - Reset completed successfully
 *   1 - Reset failed (error details logged)
 *
 * @see packages/platform/src/database/sql.ts for migration configuration
 * @see packages/platform/src/database/migrations/ for migration files
 * @see .env.example for environment configuration options
 */

import * as PlatformBun from '@effect/platform-bun'
import * as Sql from '@effect/sql'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as LogLevel from 'effect/LogLevel'

import { SQL } from '../sql.ts'

/**
 * Reset program.
 *
 * Steps:
 * 1. Connect to database (SQL.Live runs migrations automatically on init)
 * 2. Query all tables from sqlite_master
 * 3. Drop each table including effect_sql_migrations (to clear migration state)
 * 4. Exit program (database is now empty)
 * 5. User must run "bun run db:migrate" to recreate schema from scratch
 */
const program = Effect.gen(function* () {
	yield* Effect.logInfo('Starting database reset')
	yield* Effect.logWarning('⚠️ This will DESTROY ALL DATA in the database')

	const sql = yield* Sql.SqlClient.SqlClient

	// 1. Get all user tables (exclude sqlite_* system tables)
	yield* Effect.logInfo('Discovering tables to drop')
	const tables = yield* sql<{
		name: string
	}>`SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name;
	`

	const tableNames = tables.map(t => t.name)
	yield* Effect.logInfo('Found tables', { tables: tableNames })

	// 2. Drop all tables (reverse order to handle FK dependencies)
	if (tableNames.length > 0) {
		yield* Effect.logInfo('Dropping tables')

		// Disable FK checks temporarily to avoid constraint errors
		yield* sql`PRAGMA foreign_keys = OFF`

		for (const tableName of tableNames) {
			yield* Effect.logDebug('Dropping table', { table: tableName })
			// Use unsafe template literal - tableName is from our own query
			yield* sql.unsafe(`DROP TABLE IF EXISTS "${tableName}"`)
		}

		// Re-enable FK checks
		yield* sql`PRAGMA foreign_keys = ON`

		yield* Effect.logInfo('All tables dropped', { count: tableNames.length })
	} else {
		yield* Effect.logInfo('No tables to drop (database already empty)')
	}

	yield* Effect.logInfo('Database reset complete')
	yield* Effect.logInfo('Run "bun run db:migrate" to recreate schema')
})

// Provide production database layer + platform dependencies
// Note: SQL.Live runs migrations on initialization (before we drop tables)
// This is acceptable - we drop everything including effect_sql_migrations table
// User must run "bun run db:migrate" after reset to recreate schema from scratch
const layer = SQL.Live.pipe(
	Layer.provide(PlatformBun.BunContext.layer),
	Layer.provide(Logger.minimumLogLevel(LogLevel.All)),
	Layer.provide(Logger.pretty),
)

// Execute program with error handling
Effect.runPromise(program.pipe(Effect.provide(layer)))
	.then(() => {
		console.log('\n✓ Database reset completed successfully')
		console.log('ℹ️  Run "bun run db:migrate" to recreate schema')
		process.exit(0)
	})
	.catch(error => {
		console.error('\n✗ Database reset failed:')
		console.error(error)
		process.exit(1)
	})
