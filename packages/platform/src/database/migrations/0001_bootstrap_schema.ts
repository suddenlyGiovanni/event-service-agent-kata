import { SqlClient } from '@effect/sql'
import * as Effect from 'effect/Effect'

/**
 * Bootstrap migration - Minimal database structure + FK relationships
 *
 * Philosophy:
 * - Platform owns table structure and FK constraints ONLY
 * - Modules own domain-specific columns (see module migrations)
 * - This migration creates minimal stubs to establish referential integrity
 *
 * Tables created:
 * - service_calls: Stub table (FK target for timer_schedules, http_execution_log)
 *   * Orchestration module adds domain fields in separate migration
 * - timer_schedules: Skeleton table (FK to service_calls)
 *   * Timer module adds domain fields (due_at, state, etc.) in 0003_timer_schedules_schema.ts
 * - http_execution_log: Skeleton table (FK to service_calls)
 *   * Execution module adds domain fields in separate migration
 * - outbox: Event publication queue (shared infrastructure)
 *   * Platform manages outbox schema (not module-specific)
 *
 * @see ADR-0004 for database structure decisions
 * @see ADR-0005 for schema design patterns
 * @see docs/plan/kanban.md for migration strategy (minimal bootstrap approach)
 */
export default Effect.flatMap(SqlClient.SqlClient, sql =>
	Effect.all(
		[
			/**
			 * service_calls: Stub table for FK target
			 * Orchestration module will add domain-specific columns (status, created_at, etc.)
			 */
			sql`
				CREATE TABLE IF NOT EXISTS service_calls (
					tenant_id TEXT NOT NULL,
					service_call_id TEXT NOT NULL,
					PRIMARY KEY (tenant_id, service_call_id)
				) STRICT
			`,

			/**
			 * timer_schedules: Skeleton table with FK to service_calls
			 * Timer module will add domain columns in 0003_timer_schedules_schema.ts
			 */
			sql`
				CREATE TABLE IF NOT EXISTS timer_schedules (
					tenant_id TEXT NOT NULL,
					service_call_id TEXT NOT NULL,
					PRIMARY KEY (tenant_id, service_call_id),
					FOREIGN KEY (tenant_id, service_call_id) 
						REFERENCES service_calls(tenant_id, service_call_id)
						ON DELETE CASCADE
				) STRICT
			`,
			/**
			 * http_execution_log: Skeleton table with FK to service_calls
			 * Execution module will add domain columns (request_url, response_status, etc.)
			 */
			sql`
				CREATE TABLE IF NOT EXISTS http_execution_log (
					tenant_id TEXT NOT NULL,
					service_call_id TEXT NOT NULL,
					execution_id TEXT NOT NULL,
					PRIMARY KEY (tenant_id, service_call_id, execution_id),
					FOREIGN KEY (tenant_id, service_call_id)
						REFERENCES service_calls(tenant_id, service_call_id)
						ON DELETE CASCADE
				) STRICT
			`,

			/**
			 * outbox: Event publication queue (shared infrastructure, not module-owned)
			 * Platform manages outbox schema (ADR-0008 outbox pattern)
			 */
			sql`
				CREATE TABLE IF NOT EXISTS outbox (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					tenant_id TEXT NOT NULL,
					aggregate_id TEXT NOT NULL,
					event_type TEXT NOT NULL,
					event_payload TEXT NOT NULL,
					created_at TEXT NOT NULL,
					published_at TEXT
				) STRICT
			`,

			/**
			 * Index for outbox polling (unpublished events)
			 */
			sql`
				CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
				ON outbox(published_at, created_at)
				WHERE published_at IS NULL
			`,
		],
		{ concurrency: 1 },
	),
)
