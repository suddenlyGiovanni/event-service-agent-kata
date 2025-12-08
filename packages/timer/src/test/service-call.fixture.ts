import * as Sql from '@effect/sql'
import * as Effect from 'effect/Effect'

import { SQL } from '@event-service-agent/platform/database'

import * as Ports from '../ports/index.ts'

/**
 * Test fixture service for managing ServiceCall records.
 *
 * Required for integration tests using SQLite (Live or Test adapters) because
 * the `timer_schedules` table has a foreign key constraint on `service_calls`.
 *
 * This service provides a way to insert a ServiceCall record before creating a timer,
 * ensuring the FK constraint is satisfied.
 */
export class ServiceCallFixture extends Effect.Service<ServiceCallFixture>()('Timer/Test/ServiceCallFixture', {
	dependencies: [SQL.Test],
	effect: Effect.gen(function* () {
		const sql = yield* Sql.SqlClient.SqlClient

		/**
		 * Insert a service call record into the database.
		 *
		 * **Idempotency**: Uses `INSERT OR IGNORE` to skip insertion if the record already exists.
		 * This ensures tests can safely call this helper multiple times with the same keys
		 * without causing UNIQUE constraint violations.
		 *
		 * @param key - The timer schedule key containing tenantId and serviceCallId
		 */
		const make = Sql.SqlSchema.void({
			execute: ({ serviceCallId, tenantId }) =>
				sql`
						INSERT OR IGNORE
							INTO service_calls (tenant_id, service_call_id)
						VALUES
							(
								${tenantId},
								${serviceCallId}
							);
					`,
			Request: Ports.TimerScheduleKey,
		})

		return { make } as const
	}),
}) {}
