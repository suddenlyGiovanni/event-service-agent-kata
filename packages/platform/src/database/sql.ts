/** biome-ignore-all lint/style/useNamingConvention: SQL is conventional abbreviation (matches Effect examples) */

import * as Platform from '@effect/platform'
import * as PlatformBun from '@effect/platform-bun'
import * as Sql from '@effect/sql'
import * as SqliteBun from '@effect/sql-sqlite-bun'
import * as Config from 'effect/Config'
import type { ConfigError } from 'effect/ConfigError'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Record from 'effect/Record'
import * as Stream from 'effect/Stream'
import * as StringModule from 'effect/String'

/**
 * Workspace root path service.
 *
 * Resolves the workspace root directory from this file's location.
 * Used by DatabaseConfig and makeMigrator to consistently locate resources.
 *
 * @internal Shared service for workspace-relative path resolution
 */
class WorkspaceRoot extends Effect.Service<WorkspaceRoot>()('WorkspaceRoot', {
	dependencies: [PlatformBun.BunPath.layer],
	effect: Effect.gen(function* () {
		yield* Effect.logDebug('Resolving workspace root from file location')

		const path = yield* Platform.Path.Path
		const workspaceRootURL = new URL('../../../../', import.meta.url)
		const workspaceRootPath = yield* path.fromFileUrl(workspaceRootURL)

		yield* Effect.logInfo('Workspace root resolved', { workspaceRoot: workspaceRootPath })

		return { path: workspaceRootPath }
	}),
}) {}

/**
 * Database configuration with environment variable overrides.
 *
 * Environment variables:
 * - `DB_PATH`: Database file path (default: '<workspace>/data/db.sqlite')
 * - `DB_SCHEMA_DIR`: Schema dump directory (default: '<workspace>/data')
 *
 * Defaults use workspace root (not CWD), so paths are consistent regardless
 * of where commands are executed (workspace root, package dir, etc.).
 *
 * Local dev: No configuration needed, uses workspace-root 'data/' directory
 * Production: Override via env vars (e.g., DB_PATH=/var/lib/myapp/db.sqlite)
 * Testing: Override to ':memory:' or temp paths
 *
 * @internal Used by makeMigrator and Live layer
 */
class DatabaseConfig extends Effect.Service<DatabaseConfig>()('DatabaseConfig', {
	dependencies: [PlatformBun.BunPath.layer, WorkspaceRoot.Default],
	effect: Effect.gen(function* () {
		yield* Effect.logInfo('Initializing database configuration')

		const path = yield* Platform.Path.Path
		const workspaceRoot = yield* WorkspaceRoot

		// Use Effect Path.join for cross-platform path concatenation
		const dataDirectory = path.join(workspaceRoot.path, 'data')
		yield* Effect.logDebug('Data directory computed', { dataDirectory })

		const config = yield* Config.all({
			filename: Config.string('DB_PATH').pipe(Config.withDefault(path.join(dataDirectory, 'db.sqlite'))),
			schemaDirectory: Config.string('DB_SCHEMA_DIR').pipe(Config.withDefault(dataDirectory)),
		})

		yield* Effect.logInfo('Database configuration loaded', {
			filename: config.filename,
			schemaDirectory: config.schemaDirectory,
		})

		return config
	}).pipe(Effect.withSpan('DatabaseConfig')),
}) {}

/**
 * Creates a migrator layer with optional schema dump directory.
 *
 * Discovery strategy:
 * - Finds all migration files across all packages in the monorepo
 * - Uses Bun.Glob with pattern to discover package migration directories
 * - Sorts by filename for deterministic execution order
 * - Tracks executed migrations in effect_sql_migrations table
 *
 * Migration Organization:
 * - Bootstrap migration (0001) in platform package creates table skeletons
 * - Module migrations (0003+) add domain-specific columns and constraints
 * - Filename-based ordering ensures bootstrap runs before module migrations
 * - Each module owns its schema evolution via migrations in its src/database/migrations/
 *
 * Schema Dump Behavior:
 * - If schemaDirectory provided: dumps schema to _schema.sql after migrations
 * - If schemaDirectory undefined: skips schema dump (test environments)
 *
 * @param schemaDirectory - Optional directory path for schema dump file
 * @returns Migrator layer with migration execution + optional schema dump
 *
 * @see ADR-0005 for schema design (bootstrap + module evolution pattern)
 * @see ADR-0012 for package structure (module ownership)
 * @internal Factory for Live (with dump) and Test (no dump) migrators
 */
const makeMigrator = (
	schemaDirectory?: string,
): Layer.Layer<
	never,
	| ConfigError
	| Platform.Error.BadArgument
	| Platform.Error.SystemError
	| Sql.Migrator.MigrationError
	| Sql.SqlError.SqlError,
	SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient
> =>
	Effect.gen(function* () {
		yield* Effect.logInfo('Initializing database migrator', { schemaDirectory })

		const path = yield* Platform.Path.Path
		const workspaceRoot = yield* WorkspaceRoot

		yield* Effect.logDebug('Using workspace root for migration discovery', {
			workspaceRoot: workspaceRoot.path,
		})

		const migrationsRecord = yield* pipe(
			Stream.fromAsyncIterable(
				new Bun.Glob('packages/*/src/database/migrations/*.ts').scan({ cwd: workspaceRoot.path }),
				error =>
					new Platform.Error.SystemError({
						cause: error,
						description: String(error),
						method: 'glob.scan',
						module: 'FileSystem',
						pathOrDescriptor: workspaceRoot.path,
						reason: 'Unknown',
					}),
			),
			Stream.runCollect,
			Effect.map(
				Record.fromIterableWith((relativePath: string) => {
					const absolutePath = path.join(workspaceRoot.path, relativePath)
					return [absolutePath, () => import(absolutePath)] as const
				}),
			),
		)

		const migrationCount = Object.keys(migrationsRecord).length
		const migrationFiles = Object.keys(migrationsRecord)

		yield* Effect.logInfo('Discovered migrations', {
			count: migrationCount,
			files: migrationFiles,
		})

		// Fail fast if no migrations found (likely path misconfiguration)
		if (migrationCount === 0) {
			return yield* Effect.fail(
				new Platform.Error.SystemError({
					cause: new Error('No migration files discovered'),
					description: `Expected to find migration files matching 'packages/*/src/database/migrations/*.ts' in workspace root '${workspaceRoot.path}', but found none. This likely indicates a path misconfiguration.`,
					method: 'glob.scan',
					module: 'FileSystem',
					pathOrDescriptor: workspaceRoot.path,
					reason: 'Unknown',
				}),
			)
		}

		const loader = SqliteBun.SqliteMigrator.fromGlob(migrationsRecord)

		yield* Effect.logInfo('Creating migrator layer', {
			schemaDirectory: schemaDirectory ?? '<none>',
			table: 'effect_sql_migrations',
		})

		return SqliteBun.SqliteMigrator.layer({
			loader,
			// Cast required due to exactOptionalPropertyTypes: true in tsconfig
			// schemaDirectory is optional but cannot be explicitly undefined
			schemaDirectory: schemaDirectory ?? (undefined as never),
			table: 'effect_sql_migrations',
		}).pipe(Layer.provide(PlatformBun.BunContext.layer))
	}).pipe(
		Effect.withSpan('SQL.makeMigrator'),
		Effect.provide(Layer.merge(PlatformBun.BunPath.layer, WorkspaceRoot.Default)),
		Layer.unwrapEffect,
	)

/**
 * Creates a SQLite client layer with the specified database filename.
 *
 * - Consistent column name transformation (camelCase ↔ snake_case)
 * - WAL mode enabled for concurrency
 * - Session pragmas configured on initialization
 *
 * @param filename - Database path ('./data/db.sqlite' for persistent, ':memory:' for in-memory)
 * @internal Factory for Live and Test client layers (migrations composed separately)
 */
const makeClient = (
	filename: (string & {}) | ':memory:',
): Layer.Layer<
	SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
	Sql.SqlError.SqlError | ConfigError,
	never
> => {
	const sqlClientLayer: Layer.Layer<SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient, ConfigError, never> =
		SqliteBun.SqliteClient.layer({
			disableWAL: false,
			filename,
			transformQueryNames: StringModule.camelToSnake,
			transformResultNames: StringModule.snakeToCamel,
		})

	// Execute session pragmas after client creation
	const pragmaSetup: Layer.Layer<never, ConfigError | Sql.SqlError.SqlError, never> = Layer.effectDiscard(
		Effect.gen(function* () {
			yield* Effect.logInfo('Configuring SQLite session pragmas', { filename })

			const sql = yield* Sql.SqlClient.SqlClient

			yield* Effect.logDebug('Setting PRAGMA foreign_keys = ON')
			yield* sql`PRAGMA foreign_keys = ON` // CRITICAL: Enable FK constraints

			yield* Effect.logDebug('Setting PRAGMA synchronous = NORMAL')
			yield* sql`PRAGMA synchronous = NORMAL` // Balance safety/performance

			yield* Effect.logDebug('Setting PRAGMA temp_store = MEMORY')
			yield* sql`PRAGMA temp_store = MEMORY` // Faster temp tables

			yield* Effect.logDebug('Setting PRAGMA cache_size = -64000')
			yield* sql`PRAGMA cache_size = -64000` // 64MB cache

			yield* Effect.logInfo('SQLite session pragmas configured successfully')
		}).pipe(Effect.withSpan('SQL.pragmaSetup', { attributes: { filename } })),
	).pipe(Layer.provide(sqlClientLayer))

	// Merge: export client + run pragma setup (both need client from baseClient)
	return Layer.merge(sqlClientLayer, pragmaSetup)
}

/**
 * Production SQLite client layer.
 *
 * - Database path: Workspace-root data/db.sqlite (configurable via DB_PATH env var)
 * - Runs migrations from platform/migrations directory
 * - Persistent storage
 * - Session pragmas configured (foreign_keys, synchronous, etc.)
 *
 * Environment configuration:
 * - DB_PATH: Database file path (default: '<workspace>/data/db.sqlite')
 * - DB_SCHEMA_DIR: Schema dump directory (default: '<workspace>/data')
 *
 * Self-contained: Provides all dependencies internally (no external requirements)
 *
 * @example
 * ```typescript ignore
 * import { Live } from '@event-service-agent/platform/database'
 * import * as Effect from 'effect/Effect'
 * import * as Sql from '@effect/sql'
 *
 * const program = Effect.gen(function* () {
 *   const sql = yield* Sql.SqlClient.SqlClient
 *   const result = yield* sql`SELECT * FROM service_calls`
 *   return result
 * })
 *
 * // Production layer (self-contained, no dependencies)
 * Effect.provide(program, Live)
 * ```
 */
const Live: Layer.Layer<
	SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
	| Sql.Migrator.MigrationError
	| Sql.SqlError.SqlError
	| ConfigError
	| Platform.Error.BadArgument
	| Platform.Error.SystemError,
	never
> = Effect.gen(function* () {
	yield* Effect.logInfo('Initializing production SQLite client')

	const config = yield* DatabaseConfig

	yield* Effect.logInfo('Creating production database layer', {
		filename: config.filename,
		mode: 'persistent',
		schemaDirectory: config.schemaDirectory,
	})

	/*
	 * Layer composition strategy:
	 * 1. makeClient creates SqlClient (with pragma setup)
	 * 2. makeMigrator requires SqlClient (runs migrations)
	 * 3. Layer.provide: give migrator the client it needs
	 * 4. Layer.merge: export both client and migrator services
	 *
	 * Scope nesting:
	 *   Application Scope
	 *     └─ makeClient Scope (SqlClient connection + pragmas)
	 *         └─ makeMigrator Scope (runs migrations using SqlClient)
	 */
	const clientLayer = makeClient(config.filename)
	const migratorLayer = makeMigrator(config.schemaDirectory).pipe(Layer.provide(clientLayer))

	return Layer.merge(clientLayer, migratorLayer)
}).pipe(Effect.withSpan('SQL.Live'), Effect.provide(DatabaseConfig.Default), Layer.unwrapEffect)

/**
 * Test SQLite client layer (in-memory).
 *
 * - Database: `:memory:` (destroyed when layer released)
 * - Runs same migrations as production (platform migrations)
 * - Identical schema and pragma configuration to production
 *
 * Self-contained: Provides all dependencies internally (no external requirements)
 *
 * @example
 * ```typescript ignore
 * import { Test } from '@event-service-agent/platform/database'
 * import * as Effect from 'effect/Effect'
 * import * as Sql from '@effect/sql'
 *
 * const program = Effect.gen(function* () {
 *   const sql = yield* Sql.SqlClient.SqlClient
 *   const result = yield* sql`SELECT * FROM service_calls`
 *   return result
 * })
 *
 * // Test layer (in-memory, self-contained)
 * Effect.provide(program, Test)
 * ```
 */
const Test: Layer.Layer<
	SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
	| Sql.Migrator.MigrationError
	| Sql.SqlError.SqlError
	| ConfigError
	| Platform.Error.BadArgument
	| Platform.Error.SystemError,
	never
> = Effect.gen(function* () {
	yield* Effect.logInfo('Initializing test SQLite client (in-memory)')

	yield* Effect.logInfo('Creating test database layer', {
		filename: ':memory:',
		mode: 'in-memory',
		schemaDirectory: '<none>',
	})

	/*
	 * Layer composition strategy:
	 * 1. makeClient creates SqlClient (with pragma setup)
	 * 2. makeMigrator requires SqlClient (runs migrations)
	 * 3. Layer.provide: give migrator the client it needs
	 * 4. Layer.merge: export both client and migrator services
	 *
	 * Scope nesting:
	 *   Test Scope
	 *     └─ makeClient Scope (SqlClient :memory: + pragmas)
	 *         └─ makeMigrator Scope (runs migrations using SqlClient)
	 */
	const clientLayer = makeClient(':memory:')
	const migratorLayer = makeMigrator().pipe(Layer.provide(clientLayer))

	return Layer.merge(clientLayer, migratorLayer)
}).pipe(Effect.withSpan('SQL.Test'), Layer.unwrapEffect)

/**
 * SQLite client layers with automatic migration execution.
 *
 * Layer composition:
 * 1. SqliteClient.layer provides SqliteClient + SqlClient tags
 * 2. Custom setup executes session-level PRAGMAs (foreign_keys, etc.)
 * 3. SqliteMigrator.layer runs migrations from ALL modules via glob import
 * 4. provideMerge ensures sequential execution: Client → Migrator → Export both
 *
 * SQLite Pragmas Strategy:
 * - Database-level pragmas (journal_mode=WAL): Set in migration 0001_bootstrap_schema.ts
 * - Session-level pragmas (foreign_keys, synchronous, etc.): Set here on client initialization
 *
 * Migrations:
 * - Discovers migrations from: packages/*\/src/database/migrations/*.ts (platform + modules)
 * - Runs migrations on layer initialization (before app code executes)
 * - Tracks executed migrations in effect_sql_migrations table
 *
 * @example
 * ```typescript ignore
 * import { SQL } from '@event-service-agent/platform/database'
 * import * as Effect from 'effect/Effect'
 * import * as Sql from '@effect/sql'
 *
 * const program = Effect.gen(function* () {
 *   const sql = yield* Sql.SqlClient.SqlClient
 *   const result = yield* sql`SELECT * FROM service_calls`
 *   return result
 * })
 *
 * // Production layer (self-contained, no dependencies)
 * Effect.provide(program, SQL.Live)
 *
 * // Test layer (in-memory, self-contained)
 * Effect.provide(program, SQL.Test)
 * ```
 *
 * @see ADR-0004 for database structure decisions
 * @see ADR-0005 for schema design patterns
 */
export const SQL = {
	Live,
	Test,
} as const
