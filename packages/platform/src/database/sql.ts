/** biome-ignore-all lint/style/useNamingConvention: SQL is conventional abbreviation (matches Effect examples) */
import type * as Platform from '@effect/platform'
import * as PlatformBun from '@effect/platform-bun'
import * as Sql from '@effect/sql'
import * as SqliteBun from '@effect/sql-sqlite-bun'
import type { ConfigError } from 'effect/ConfigError'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
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
 * - Discovers migrations from: packages/platform/src/database/migrations/*.ts
 * - Future: Will discover from all modules when glob import.meta.glob is configured
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
	 * Shared migrator layer for both Live and Test environments.
	 *
	 * - Discovers migrations from: packages/platform/src/database/migrations/*.ts
	 * - Future: Will discover from all modules when glob import.meta.glob is configured
	 * - Tracks executed migrations in effect_sql_migrations table
	 *
	 * @internal Shared between Live and Test to ensure identical schema
	 */
	private static readonly Migrator = SqliteBun.SqliteMigrator.layer({
		loader: SqliteBun.SqliteMigrator.fromFileSystem(new URL('./migrations', import.meta.url).pathname),
		schemaDirectory: './data',
		table: 'effect_sql_migrations',
	}).pipe(Layer.provide(PlatformBun.BunContext.layer))

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
				const sql = yield* Sql.SqlClient.SqlClient
				yield* sql`PRAGMA foreign_keys = ON` // CRITICAL: Enable FK constraints
				yield* sql`PRAGMA synchronous = NORMAL` // Balance safety/performance
				yield* sql`PRAGMA temp_store = MEMORY` // Faster temp tables
				yield* sql`PRAGMA cache_size = -64000` // 64MB cache
			}),
		).pipe(Layer.provide(client))

		// Merge: export client + run pragma setup (both need client from baseClient)
		return Layer.merge(client, pragmaSetup)
	}

	/**
	 * Production SQLite client layer.
	 *
	 * - Database path: `./data/db.sqlite` (relative to workspace root)
	 * - Runs migrations from platform/migrations directory
	 * - Persistent storage
	 * - Session pragmas configured (foreign_keys, synchronous, etc.)
	 *
	 * Requires: `Platform.Path.Path` from context (provide `BunContext.layer`)
	 */
	static readonly Live: Layer.Layer<
		SqliteBun.SqliteClient.SqliteClient | Sql.SqlClient.SqlClient,
		Sql.Migrator.MigrationError | Sql.SqlError.SqlError | ConfigError | Platform.Error.BadArgument,
		Platform.Path.Path
	> = Layer.provideMerge(SQL.Migrator, SQL.makeClient('./data/db.sqlite'))

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
		Sql.Migrator.MigrationError | Sql.SqlError.SqlError | ConfigError | Platform.Error.BadArgument,
		Platform.Path.Path
	> = Layer.provideMerge(SQL.Migrator, SQL.makeClient(':memory:'))
}
