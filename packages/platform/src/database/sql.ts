/** biome-ignore-all lint/style/useNamingConvention: SQL is conventional abbreviation (matches Effect examples) */

import * as Platform from '@effect/platform'
import * as Path from '@effect/platform/Path'
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
 * ```typescript
 * import { SQL } from '@event-service-agent/platform/database'
 * import * as Effect from 'effect/Effect'
 * import * as Layer from 'effect/Layer'
 * import * as Sql from '@effect/sql'
 * import * as PlatformBun from '@effect/platform-bun'
 *
 * const program = Effect.gen(function* () {
 *   const sql = yield* Sql.SqlClient.SqlClient
 *   const result = yield* sql`SELECT * FROM service_calls`
 *   return result
 * })
 *
 * // Production layer
 * const layer = SQL.Live.pipe(Layer.provide(PlatformBun.BunContext.layer))
 * Effect.provide(program, layer)
 *
 * // Test layer (in-memory)
 * const testLayer = SQL.Test.pipe(Layer.provide(PlatformBun.BunContext.layer))
 * Effect.provide(program, testLayer)
 * ```
 *
 * @see ADR-0004 for database structure decisions
 * @see ADR-0005 for schema design patterns
 */
export class SQL {
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
	 * @internal Used by Migrator and Live layers
	 */
	private static readonly DatabaseConfig: Effect.Effect<
		{ readonly filename: string; readonly schemaDirectory: string },
		ConfigError | Platform.Error.BadArgument,
		Platform.Path.Path
	> = Effect.gen(function* () {
		yield* Effect.logInfo('Initializing database configuration')

		const path = yield* Path.Path

		// 1. Calculate workspace root URL (4 levels up from this file)
		// packages/platform/src/database/sql.ts → workspace root
		const workspaceRootURL = new URL('../../../../', import.meta.url)
		yield* Effect.logTrace('Workspace root URL created', { url: workspaceRootURL.href })

		// 2. Convert file:// URL to platform-specific path string
		// Effect-based: handles errors and cross-platform differences
		const workspaceRoot = yield* path.fromFileUrl(workspaceRootURL)
		yield* Effect.logDebug('Workspace root resolved', { workspaceRoot })

		// 3. Use Effect Path.join for cross-platform path concatenation
		const dataDirectory = path.join(workspaceRoot, 'data')
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
	}).pipe(Effect.withSpan('SQL.DatabaseConfig'))

	/**
	 * Shared migrator layer for both Live and Test environments.
	 *
	 * Discovery strategy:
	 * - Finds all migration files across all packages in the monorepo
	 * - Uses Bun.Glob with pattern to discover package migration directories
	 * - Sorts by filename for deterministic execution order
	 * - Tracks executed migrations in effect_sql_migrations table
	 * - Schema directory: Workspace-root data/ (configurable via DB_SCHEMA_DIR env var)
	 *
	 * Migration Organization:
	 * - Bootstrap migration (0001) in platform package creates table skeletons
	 * - Module migrations (0003+) add domain-specific columns and constraints
	 * - Filename-based ordering ensures bootstrap runs before module migrations
	 * - Each module owns its schema evolution via migrations in its src/database/migrations/
	 *
	 * @see ADR-0005 for schema design (bootstrap + module evolution pattern)
	 * @see ADR-0012 for package structure (module ownership)
	 * @internal Shared between Live and Test to ensure identical schema
	 */
	private static readonly Migrator: Layer.Layer<
		never,
		| ConfigError
		| Platform.Error.BadArgument
		| Platform.Error.SystemError
		| Sql.Migrator.MigrationError
		| Sql.SqlError.SqlError,
		SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient
	> = Layer.unwrapEffect(
		Effect.gen(function* () {
			yield* Effect.logInfo('Initializing database migrator')

			const config = yield* SQL.DatabaseConfig
			const path = yield* Path.Path

			// Resolve workspace root from package.json location
			const workspaceRoot = yield* path.fromFileUrl(new URL('../../../..', import.meta.url))

			yield* Effect.logDebug('Workspace root resolved', { workspaceRoot })

			const migrationsRecord = yield* pipe(
				Stream.fromAsyncIterable(
					new Bun.Glob('packages/*/src/database/migrations/*.ts').scan({ cwd: workspaceRoot }),
					error =>
						new Platform.Error.SystemError({
							cause: error,
							description: String(error),
							method: 'glob.scan',
							module: 'FileSystem',
							pathOrDescriptor: workspaceRoot,
							reason: 'Unknown',
						}),
				),
				Stream.runCollect,
				Effect.map(
					Record.fromIterableWith((relativePath: string) => {
						const absolutePath = `${workspaceRoot}/${relativePath}`
						return [absolutePath, () => import(absolutePath)] as const
					}),
				),
			)

			yield* Effect.logInfo('Discovered migrations', {
				count: Object.keys(migrationsRecord).length,
				files: Object.keys(migrationsRecord),
			})

			const loader = SqliteBun.SqliteMigrator.fromGlob(migrationsRecord)

			yield* Effect.logInfo('Creating migrator layer', {
				schemaDirectory: config.schemaDirectory,
				table: 'effect_sql_migrations',
			})

			return SqliteBun.SqliteMigrator.layer({
				loader,
				schemaDirectory: config.schemaDirectory,
				table: 'effect_sql_migrations',
			}).pipe(Layer.provide(PlatformBun.BunContext.layer))
		}).pipe(Effect.withSpan('SQL.Migrator'), Effect.provide(PlatformBun.BunPath.layer)),
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
	private static readonly makeClient: (
		filename: (string & {}) | ':memory:',
	) => Layer.Layer<
		SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
		Sql.SqlError.SqlError | ConfigError,
		never
	> = filename => {
		const client = SqliteBun.SqliteClient.layer({
			disableWAL: false,
			filename,
			transformQueryNames: StringModule.camelToSnake,
			transformResultNames: StringModule.snakeToCamel,
		})

		// Execute session pragmas after client creation
		const pragmaSetup = Layer.effectDiscard(
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
		).pipe(Layer.provide(client))

		// Merge: export client + run pragma setup (both need client from baseClient)
		return Layer.merge(client, pragmaSetup)
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
	 * Requires: `Platform.Path.Path` from context (provide `BunContext.layer`)
	 */
	static readonly Live: Layer.Layer<
		SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
		| Sql.Migrator.MigrationError
		| Sql.SqlError.SqlError
		| ConfigError
		| Platform.Error.BadArgument
		| Platform.Error.SystemError,
		Platform.Path.Path
	> = Layer.unwrapEffect(
		Effect.gen(function* () {
			yield* Effect.logInfo('Initializing production SQLite client')

			const config = yield* SQL.DatabaseConfig

			yield* Effect.logInfo('Creating production database layer', {
				filename: config.filename,
				mode: 'persistent',
			})

			return Layer.provideMerge(SQL.Migrator, SQL.makeClient(config.filename))
		}).pipe(Effect.withSpan('SQL.Live')),
	)

	/**
	 * Test SQLite client layer (in-memory).
	 *
	 * - Database: `:memory:` (destroyed when layer released)
	 * - Runs same migrations as production (platform migrations)
	 * - Identical schema and pragma configuration to production
	 *
	 * Requires: `Platform.Path.Path` from context (provide `BunContext.layer`)
	 */
	static readonly Test: Layer.Layer<
		SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
		| Sql.Migrator.MigrationError
		| Sql.SqlError.SqlError
		| ConfigError
		| Platform.Error.BadArgument
		| Platform.Error.SystemError,
		Platform.Path.Path
	> = Layer.unwrapEffect(
		Effect.gen(function* () {
			yield* Effect.logInfo('Initializing test SQLite client (in-memory)')

			yield* Effect.logInfo('Creating test database layer', {
				filename: ':memory:',
				mode: 'in-memory',
			})

			return Layer.provideMerge(SQL.Migrator, SQL.makeClient(':memory:'))
		}).pipe(Effect.withSpan('SQL.Test')),
	)
}
