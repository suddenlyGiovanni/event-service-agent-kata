import { SqlClient, type SqlError } from '@effect/sql'
import * as Effect from 'effect/Effect'

/**
 * Migration 0003: Extend timer_schedules with timer domain columns, constraints, and indexes
 *
 * Steps:
 * 1. Add new nullable columns to the existing table
 * 2. Create timer_schedules_new with NOT NULL, CHECK, FK, and STRICT constraints
 * 3. Copy and normalize existing data into timer_schedules_new
 * 4. Drop the old timer_schedules and rename the new table
 * 5. Create polling and correlation_id indexes
 *
 * @see packages/timer/docs/schema.md for detailed schema documentation
 */
const migration: Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient> = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	// Step 1: Add new columns to existing table
	yield* sql`ALTER TABLE timer_schedules ADD COLUMN correlation_id TEXT`
	yield* sql`ALTER TABLE timer_schedules ADD COLUMN due_at TEXT`
	yield* sql`ALTER TABLE timer_schedules ADD COLUMN registered_at TEXT`
	yield* sql`ALTER TABLE timer_schedules ADD COLUMN reached_at TEXT`
	yield* sql`ALTER TABLE timer_schedules ADD COLUMN state TEXT DEFAULT 'Scheduled'`

	// Step 2: Create new table with all constraints
	yield* sql`CREATE TABLE timer_schedules_new
(
    tenant_id       TEXT NOT NULL,
    service_call_id TEXT NOT NULL,
    correlation_id  TEXT,
    due_at          TEXT NOT NULL
        CHECK (
            due_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'
                AND length(due_at) BETWEEN 20 AND 35
            ),
    registered_at   TEXT NOT NULL
        CHECK (
            registered_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'
                AND length(registered_at) BETWEEN 20 AND 35
            ),
    reached_at      TEXT
        CHECK (
            reached_at IS NULL
                OR (
                reached_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z'
                    AND length(reached_at) BETWEEN 20 AND 35
                )
            ),
    state           TEXT NOT NULL DEFAULT 'Scheduled'
        CHECK (state IN ('Scheduled', 'Reached')),
    CHECK (
        (state = 'Scheduled' AND reached_at IS NULL)
            OR (state = 'Reached' AND reached_at IS NOT NULL)
        ),
    PRIMARY KEY (tenant_id, service_call_id),
    FOREIGN KEY (tenant_id, service_call_id)
        REFERENCES service_calls (tenant_id, service_call_id)
        ON DELETE CASCADE
) STRICT;
	`

	// Step 3: Copy data from old table to new (if any exists)
	yield* sql`
		INSERT INTO timer_schedules_new 
			(tenant_id, service_call_id, correlation_id, due_at, registered_at, reached_at, state)
		SELECT 
			tenant_id,
			service_call_id,
			correlation_id,
			COALESCE(due_at, '1970-01-01T00:00:00.000Z') AS due_at,
			COALESCE(registered_at, '1970-01-01T00:00:00.000Z') AS registered_at,
			CASE
				WHEN COALESCE(state, 'Scheduled') = 'Reached' AND reached_at IS NOT NULL THEN reached_at
				ELSE NULL
			END AS reached_at,
			CASE
				WHEN COALESCE(state, 'Scheduled') = 'Reached' AND reached_at IS NULL THEN 'Scheduled'
				ELSE COALESCE(state, 'Scheduled')
			END AS state
		FROM timer_schedules
	`

	// Step 4: Drop old table
	yield* sql`DROP TABLE timer_schedules`

	// Step 5: Rename new table to original name
	yield* sql`ALTER TABLE timer_schedules_new RENAME TO timer_schedules`

	// Step 6: Create indexes
	yield* sql`
		CREATE INDEX idx_timer_schedules_due_at
		ON timer_schedules(tenant_id, state, due_at)
	`

	yield* sql`
		CREATE INDEX idx_timer_schedules_correlation_id
		ON timer_schedules(correlation_id)
	`
})

export default migration
