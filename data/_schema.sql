CREATE TABLE IF NOT EXISTS "effect_sql_migrations" (
  migration_id integer PRIMARY KEY NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp,
  name VARCHAR(255) NOT NULL
);
CREATE TABLE service_calls (
					tenant_id TEXT NOT NULL,
					service_call_id TEXT NOT NULL,
					PRIMARY KEY (tenant_id, service_call_id)
				) STRICT
			;
CREATE TABLE timer_schedules (
					tenant_id TEXT NOT NULL,
					service_call_id TEXT NOT NULL,
					PRIMARY KEY (tenant_id, service_call_id),
					FOREIGN KEY (tenant_id, service_call_id) 
						REFERENCES service_calls(tenant_id, service_call_id)
						ON DELETE CASCADE
				) STRICT
			;
CREATE TABLE http_execution_log (
					tenant_id TEXT NOT NULL,
					service_call_id TEXT NOT NULL,
					execution_id TEXT NOT NULL,
					PRIMARY KEY (tenant_id, service_call_id, execution_id),
					FOREIGN KEY (tenant_id, service_call_id)
						REFERENCES service_calls(tenant_id, service_call_id)
						ON DELETE CASCADE
				) STRICT
			;
CREATE TABLE outbox (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					tenant_id TEXT NOT NULL,
					aggregate_id TEXT NOT NULL,
					event_type TEXT NOT NULL,
					event_payload TEXT NOT NULL,
					created_at TEXT NOT NULL,
					published_at TEXT
				) STRICT
			;

CREATE INDEX idx_outbox_unpublished
				ON outbox(published_at, created_at)
				WHERE published_at IS NULL
			;

INSERT INTO effect_sql_migrations VALUES(1,'2025-11-12 17:57:37','bootstrap_schema');