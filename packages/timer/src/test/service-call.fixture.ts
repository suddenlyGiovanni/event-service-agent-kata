import * as Sql from '@effect/sql'
import { Effect, pipe } from 'effect'

import * as Ports from '../ports/index.ts'

/**
 * Test helper: Inserts a service call record into the database.
 *
 * This is required before saving timers in the Live (SQLite) adapter tests,
 * as timers have a foreign key constraint to the service_calls table.
 *
 * **Idempotency**: Uses `INSERT OR IGNORE` to skip insertion if the record
 * already exists. This ensures tests can safely call this helper multiple times
 * with the same keys without causing UNIQUE constraint violations.
 *
 * @param tenantId - The tenant identifier for the service call
 * @param serviceCallId - The service call identifier to insert
 * @returns An Effect that inserts the service call record (or no-op if exists)
 */
export const withServiceCall = (key: Ports.TimerScheduleKey.Type) =>
	Effect.gen(function* () {
		const sql = yield* Sql.SqlClient.SqlClient

		return yield* pipe(
			key,
			Sql.SqlSchema.void({
				execute: request =>
					sql`
                  INSERT OR IGNORE INTO service_calls (tenant_id, service_call_id)
                  VALUES (${request.tenantId},
                          ${request.serviceCallId});
                            `,
				Request: Ports.TimerScheduleKey,
			}),
		)
	})
