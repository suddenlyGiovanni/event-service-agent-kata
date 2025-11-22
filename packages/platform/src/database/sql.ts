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
 * Resolves the workspace root directory from this file's location. Used by DatabaseConfig and MigratorLayer to
 * consistently locate resources.
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
 *
 * - `DB_PATH`: Database file path (default: '<workspace>/data/db.sqlite')
 * - `DB_SCHEMA_DIR`: Schema dump directory (default: '<workspace>/data')
 *
 * Defaults use workspace root (not CWD), so paths are consistent regardless of where commands are executed (workspace
 * root, package dir, etc.).
 *
 * Local dev: No configuration needed, uses workspace-root 'data/' directory.
 *
 * - Production: Override via env vars (e.g., DB_PATH=/var/lib/myapp/db.sqlite)
 * - Testing: Override via Layer.mock (e.g., ':memory:' database, no schema dump)
 *
 * @internal Consumed by ClientLayer and MigratorLayer via dependency injection
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

		const config: {
			filename: string
			schemaDirectory: string | undefined
		} = yield* Config.all({
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
 * Migrator layer with automatic migration discovery and execution.
 *
 * Discovery strategy:
 *
 * - Finds all migration files across all packages in the monorepo
 * - Uses Bun.Glob with pattern to discover package migration directories
 * - Sorts by filename for deterministic execution order
 * - Tracks executed migrations in effect_sql_migrations table
 *
 * Migration Organization:
 *
 * - Bootstrap migration (0001) in platform package creates table skeletons
 * - Module migrations (0003+) add domain-specific columns and constraints
 * - Filename-based ordering ensures bootstrap runs before module migrations
 * - Each module owns its schema evolution via migrations in its src/database/migrations/
 *
 * Schema Dump Behavior:
 *
 * - Reads schemaDirectory from DatabaseConfig
 * - If schemaDirectory defined: dumps schema to _schema.sql after migrations
 * - If schemaDirectory undefined: skips schema dump (test environments)
 *
 * Dependencies:
 *
 * - DatabaseConfig: For schema dump directory configuration
 * - WorkspaceRoot: For migration file discovery base path
 * - Platform.Path.Path: For cross-platform path operations
 * - SqlClient: For executing migrations
 *
 * @internal Used by Live and Test layers via pure composition
 * @see ADR-0005 for schema design (bootstrap + module evolution pattern)
 * @see ADR-0012 for package structure (module ownership)
 */
const MigratorLayer: Layer.Layer<
	never,
	Platform.Error.SystemError | Sql.Migrator.MigrationError | Sql.SqlError.SqlError,
	WorkspaceRoot | Platform.Path.Path | DatabaseConfig | SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient
> = Effect.gen(function* () {
	const config = yield* DatabaseConfig
	const path = yield* Platform.Path.Path
	const workspaceRoot = yield* WorkspaceRoot

	yield* Effect.logInfo('Initializing database migrator', { schemaDirectory: config.schemaDirectory })

	yield* Effect.logDebug('Using workspace root for migration discovery', {
		workspaceRoot: workspaceRoot.path,
	})

	const migrationsRecord = yield* pipe(
		Stream.fromAsyncIterable(
			new Bun.Glob('packages/*/src/database/migrations/*.ts').scan({ cwd: workspaceRoot.path }),
			(error) =>
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

	const migrationFiles = Record.keys(migrationsRecord)
	const migrationCount = migrationFiles.length

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
		schemaDirectory: config.schemaDirectory ?? '<none>',
		table: 'effect_sql_migrations',
	})

	return SqliteBun.SqliteMigrator.layer({
		loader,
		...(config.schemaDirectory ? { schemaDirectory: config.schemaDirectory } : {}),
		table: 'effect_sql_migrations',
	}).pipe(Layer.provide(PlatformBun.BunContext.layer))
}).pipe(Effect.withSpan('SQL.MigratorLayer'), Layer.unwrapEffect)

/**
 * SQLite session pragma configuration layer.
 *
 * Configures session-level SQLite pragmas after client initialization. These pragmas apply per-connection and must be
 * set on each session.
 *
 * Configured pragmas:
 *
 * - `foreign_keys = ON`: Enable foreign key constraint enforcement (CRITICAL)
 * - `synchronous = NORMAL`: Balance durability vs performance (WAL mode)
 * - `temp_store = MEMORY`: Store temporary tables in RAM for speed
 * - `cache_size = -64000`: 64MB page cache for better performance
 *
 * @internal Used by ClientLayer to configure session on connection
 * @see ADR-0005 for pragma strategy (database-level vs session-level)
 */
const PragmaLayer: Layer.Layer<never, Sql.SqlError.SqlError, Sql.SqlClient.SqlClient> = Effect.gen(function* () {
	yield* Effect.logInfo('Configuring SQLite session pragmas')

	const sql = yield* Sql.SqlClient.SqlClient

	yield* Effect.logDebug('Setting PRAGMA foreign_keys = ON')
	/* CRITICAL: Enable FK constraints */
	yield* sql`
		PRAGMA foreign_keys = ON;
	`

	yield* Effect.logDebug('Setting PRAGMA synchronous = NORMAL')
	/* Balance safety/performance */
	yield* sql`
		PRAGMA synchronous = NORMAL;
	`

	yield* Effect.logDebug('Setting PRAGMA temp_store = MEMORY')
	/* Faster temp tables */
	yield* sql`
		PRAGMA temp_store = MEMORY;
	`

	yield* Effect.logDebug('Setting PRAGMA cache_size = -64000')
	/* 64MB cache */
	yield* sql`
		PRAGMA cache_size = -64000;
	`

	yield* Effect.logInfo('SQLite session pragmas configured successfully')
}).pipe(Effect.withSpan('SQL.PragmaLayer'), Layer.effectDiscard)

/**
 * SQLite client layer with automatic configuration from DatabaseConfig.
 *
 * - Reads database filename from DatabaseConfig service
 * - Consistent column name transformation (camelCase ↔ snake_case)
 * - WAL mode enabled for concurrency
 * - Session pragmas configured on initialization
 *
 * Dependencies:
 *
 * - DatabaseConfig: For database filename configuration
 *
 * @internal Used by Live and Test layers via pure composition
 */
const ClientLayer: Layer.Layer<
	SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
	ConfigError | Sql.SqlError.SqlError,
	DatabaseConfig
> = Effect.gen(function* () {
	const config = yield* DatabaseConfig

	yield* Effect.logInfo('Creating SQLite client', { filename: config.filename })

	const sqlClientLayer: Layer.Layer<SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient, ConfigError, never> =
		SqliteBun.SqliteClient.layer({
			disableWAL: false,
			filename: config.filename,
			transformQueryNames: StringModule.camelToSnake,
			transformResultNames: StringModule.snakeToCamel,
		})

	/*
	 * Sequential composition: Client → Pragma Setup → Export Client Only
	 * 1. sqlClientLayer creates the SQL connection and provides SqlClient service
	 * 2. Provide client to pragmaSetupLayer (runs PRAGMAs as side effect)
	 * 3. provideMerge runs pragma layer but only exports the client service
	 */
	return Layer.provideMerge(sqlClientLayer, Layer.provide(PragmaLayer, sqlClientLayer))
}).pipe(Effect.withSpan('SQL.ClientLayer'), Layer.unwrapEffect)

/**
 * Production SQLite client layer.
 *
 * - Database path: Workspace-root data/db.sqlite (configurable via DB_PATH env var)
 * - Runs migrations from platform/migrations directory
 * - Persistent storage
 * - Session pragmas configured (foreign_keys, synchronous, etc.)
 *
 * Environment configuration:
 *
 * - DB_PATH: Database file path (default: '<workspace>/data/db.sqlite')
 * - DB_SCHEMA_DIR: Schema dump directory (default: '<workspace>/data')
 *
 * Self-contained: Provides all dependencies internally (no external requirements)
 *
 * @example
 *
 * ```typescript
 * import * as Effect from 'effect/Effect'
 * import * as Sql from '@effect/sql'
 * import { SQL } from '@event-service-agent/platform/database'
 *
 * const program = Effect.gen(function* () {
 * 	const sql = yield* Sql.SqlClient.SqlClient
 * 	const result = yield* sql`SELECT * FROM service_calls`
 * 	return result
 * })
 *
 * // Production layer (self-contained, no dependencies)
 * Effect.provide(program, SQL.Live)
 * ```
 */
const Live: Layer.Layer<
	SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
	| Platform.Error.SystemError
	| Sql.Migrator.MigrationError
	| Sql.SqlError.SqlError
	| Platform.Error.BadArgument
	| ConfigError,
	never
> = MigratorLayer.pipe(
	Layer.provide(PlatformBun.BunPath.layer),
	Layer.provide(WorkspaceRoot.Default),
	Layer.provideMerge(ClientLayer),
	Layer.provide(DatabaseConfig.Default),
)

/**
 * Test SQLite client layer (in-memory).
 *
 * - Database: `:memory:` (destroyed when layer released)
 * - Runs same migrations as production
 * - Identical schema and pragma configuration to production
 * - No schema dump (schemaDirectory overridden to undefined)
 *
 * Architecture: Same composition as Live (MigratorLayer.pipe(provideMerge(ClientLayer))), differs only in
 * DatabaseConfig provision (Layer.succeed for test configuration).
 *
 * Self-contained: Provides all dependencies internally (no external requirements)
 *
 * @example
 *
 * ```typescript
 * import * as Effect from 'effect/Effect'
 * import * as Sql from '@effect/sql'
 * import { SQL } from '@event-service-agent/platform/database'
 *
 * const program = Effect.gen(function* () {
 * 	const sql = yield* Sql.SqlClient.SqlClient
 * 	const result = yield* sql`SELECT * FROM service_calls`
 * 	return result
 * })
 *
 * // Test layer (in-memory, self-contained)
 * Effect.provide(program, SQL.Test)
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
> = MigratorLayer.pipe(
	Layer.provide(PlatformBun.BunPath.layer),
	Layer.provide(WorkspaceRoot.Default),
	Layer.provideMerge(ClientLayer),
	Layer.provide(
		Layer.succeed(DatabaseConfig, {
			_tag: 'DatabaseConfig',
			filename: ':memory:',
			schemaDirectory: undefined,
		}),
	),
)

/**
 * SQLite client layers with automatic migration execution.
 *
 * Layer composition pattern (both Live and Test):
 *
 * 1. MigratorLayer requires: DatabaseConfig, WorkspaceRoot, Path, SqlClient
 * 2. Layer.provideMerge(ClientLayer) satisfies SqlClient requirement AND exports it
 * 3. Layer.provide(...) satisfies remaining dependencies (Config, WorkspaceRoot, Path)
 * 4. Live vs Test differ only in DatabaseConfig provision:
 *
 *    - Live: DatabaseConfig.Default (env vars + workspace defaults)
 *    - Test: Layer.succeed override (in-memory DB, no schema dump)
 *
 * Dependency flow:
 *
 * ```txt
 * Config + WorkspaceRoot + Path (provided at top level)
 *   └─> ClientLayer (uses Config)
 *         └─> MigratorLayer (uses all deps + SqlClient from ClientLayer)
 *
 * Exports: SqlClient (from ClientLayer via provideMerge)
 * ```
 *
 * SQLite Pragmas Strategy:
 *
 * - Database-level pragmas (journal_mode=WAL): Set in migration 0001_bootstrap_schema.ts
 * - Session-level pragmas (foreign_keys, synchronous, etc.): Set in ClientLayer on initialization
 *
 * Migrations:
 *
 * - Discovers migrations from: packages/_/src/database/migrations/_.ts (platform + modules)
 * - Runs migrations on layer initialization (before app code executes)
 * - Tracks executed migrations in effect_sql_migrations table
 *
 * @example
 *
 * ```typescript
 * import { SQL } from '@event-service-agent/platform/database'
 * import * as Effect from 'effect/Effect'
 * import * as Sql from '@effect/sql'
 *
 * const program = Effect.gen(function* () {
 * 	const sql = yield* Sql.SqlClient.SqlClient
 * 	const result = yield* sql`SELECT * FROM service_calls`
 * 	return result
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
