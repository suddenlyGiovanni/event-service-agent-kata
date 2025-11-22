#!/usr/bin/env bun

/**
 * Manual migration runner for local development.
 *
 * Runs pending database migrations without starting the full application. Useful for:
 *
 * - Updating local database schema after pulling new code
 * - Testing migrations before committing
 * - CI/CD pipelines (pre-deployment schema updates)
 *
 * Usage: `bun run db:migrate` # From workspace root
 *
 * Environment Variables (.env or shell):
 *
 * - `DB_PATH` - Database file path (default: <workspace>/data/db.sqlite)
 * - `DB_SCHEMA_DIR` - Schema dump directory (default: <workspace>/data)
 *
 * Environment File:
 *
 * - Scripts automatically load <workspace>/.env if present.
 * - See .env.example for available configuration options.
 * - Relative paths in .env work correctly when running from workspace root.
 *
 * Exit Codes:
 *
 * - 0 - Migrations completed successfully
 * - 1 - Migration failed (error details logged)
 *
 * @see packages/platform/src/database/sql.ts for migration configuration
 * @see packages/platform/src/database/migrations/ for migration files
 * @see .env.example for environment configuration options
 */

import console from 'node:console'

import * as PlatformBun from '@effect/platform-bun'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as LogLevel from 'effect/LogLevel'

import { SQL } from '../sql.ts'

/**
 * Migration program.
 *
 * Migrations run automatically when SQL.Live layer is provided. Effect SQL's migrator:
 *
 * - Discovers migrations from packages/platform/src/database/migrations/
 * - Tracks executed migrations in effect_sql_migrations table
 * - Skips already-executed migrations (idempotent)
 * - Dumps schema to DB_SCHEMA_DIR after successful execution
 */
const program = Effect.gen(function* () {
	yield* Effect.logInfo('Starting manual migration')
	yield* Effect.logInfo('Discovering migrations from packages/platform/src/database/migrations/')

	// Migrations execute automatically during layer initialization (SQL.Migrator layer)
	// No explicit migrate() call needed

	yield* Effect.logInfo('All pending migrations executed successfully')
	yield* Effect.logInfo('Schema dump written to DB_SCHEMA_DIR (if configured)')
})

// Provide production database layer + platform dependencies
const layer = SQL.Live.pipe(
	Layer.provide(PlatformBun.BunContext.layer),
	Layer.provide(Logger.minimumLogLevel(LogLevel.All)),
	Layer.provide(Logger.pretty),
)

// Execute program with error handling
Effect.runPromise(program.pipe(Effect.provide(layer)))
	.then(() => {
		console.log('\n✓', 'Migration completed successfully')
		process.exit(0)
	})
	.catch((error) => {
		console.error('\n', '✗ Migration failed:')
		console.error(error)
		process.exit(1)
	})
