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
CREATE TABLE IF NOT EXISTS "timer_schedules"
      (
          tenant_id       TEXT NOT NULL,
          service_call_id TEXT NOT NULL,
          correlation_id  TEXT,
          due_at          TEXT NOT NULL
              CHECK (
                  due_at GLOB
                  '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'
                      AND
                  length(due_at) BETWEEN 20 AND 35
                  ),
          registered_at   TEXT NOT NULL
              CHECK (
                  registered_at GLOB
                  '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'
                      AND
                  length(registered_at) BETWEEN 20 AND 35
                  ),
          reached_at      TEXT
              CHECK (
                  reached_at IS NULL
                      OR
                  (
                      reached_at GLOB
                      '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'
                          AND
                      length(reached_at) BETWEEN 20 AND 35
                      )
                  ),
          state           TEXT NOT NULL DEFAULT 'Scheduled'
              CHECK (state IN ('Scheduled', 'Reached')),
          CHECK (
              (state = 'Scheduled' AND reached_at IS NULL)
                  OR
              (state = 'Reached' AND reached_at IS NOT NULL)
              ),
          PRIMARY KEY (tenant_id, service_call_id),
          FOREIGN KEY (tenant_id, service_call_id)
              REFERENCES service_calls (tenant_id, service_call_id)
              ON DELETE CASCADE
      ) STRICT;
CREATE INDEX idx_timer_schedules_due_at
          ON timer_schedules (state, due_at, tenant_id);
CREATE INDEX idx_timer_schedules_correlation_id
          ON timer_schedules (correlation_id);

INSERT INTO effect_sql_migrations VALUES(1,'2025-11-19 12:33:24','bootstrap_schema');
INSERT INTO effect_sql_migrations VALUES(3,'2025-11-19 12:33:24','timer_schedules_schema');