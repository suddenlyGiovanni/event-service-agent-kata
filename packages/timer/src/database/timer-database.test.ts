import * as Sql from '@effect/sql'
import { expect, layer } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'

import { SQL } from '@event-service-agent/platform/database'
import { UUID7 } from '@event-service-agent/platform/uuid7'

const TestLayer = Layer.merge(SQL.Test, UUID7.Default)

const insertServiceCall = (tenantId: string, serviceCallId: string) =>
	Effect.gen(function* () {
		const sql = yield* Sql.SqlClient.SqlClient
		yield* sql`
          INSERT INTO service_calls (tenant_id, service_call_id)
          VALUES (${tenantId},
                  ${serviceCallId})
			`
	})

layer(TestLayer)('Timer database invariants', (it) => {
	it.scoped('allows inserting a well-formed timer', () =>
		Effect.gen(function* () {
			const sql = yield* Sql.SqlClient.SqlClient
			const uuid = yield* UUID7

			const serviceCallId = yield* uuid.randomUUIDv7()
			const tenantId = yield* uuid.randomUUIDv7()

			yield* insertServiceCall(tenantId, serviceCallId)

			const now = yield* DateTime.now
			const registeredAt = DateTime.formatIso(now)
			const dueAt = DateTime.formatIso(DateTime.add(now, { hours: 1 }))

			yield* sql`
            INSERT INTO timer_schedules (tenant_id,
                                         service_call_id,
                                         correlation_id,
                                         due_at,
                                         registered_at,
                                         state)
            VALUES (${tenantId},
                    ${serviceCallId},
                    'corr-123',
                    ${dueAt},
                    ${registeredAt},
                    'Scheduled')
				`

			const rows = yield* sql<{
				correlationId: string
			}>`
          SELECT correlation_id
          FROM timer_schedules
          WHERE tenant_id = ${tenantId}
            AND service_call_id = ${serviceCallId}
			`

			expect(rows).toHaveLength(1)
		}),
	)

	it.scoped('rejects timers with non ISO8601 due_at', () =>
		Effect.gen(function* () {
			const sql = yield* Sql.SqlClient.SqlClient
			const uuid = yield* UUID7

			const serviceCallId = yield* uuid.randomUUIDv7()
			const tenantId = yield* uuid.randomUUIDv7()

			const now = yield* DateTime.now
			const registeredAt = DateTime.formatIso(now)

			yield* insertServiceCall(tenantId, serviceCallId)

			const exit = yield* Effect.exit(
				sql`
            INSERT INTO timer_schedules (tenant_id,
                                         service_call_id,
                                         correlation_id,
                                         due_at,
                                         registered_at,
                                         state)
            VALUES (${tenantId},
                    ${serviceCallId},
                    'corr-456',
                    '2025/01/01 00:00:00',
                    ${registeredAt},
                    'Scheduled')
				`,
			)

			expect(Exit.isFailure(exit)).toBe(true)
		}),
	)

	it.scoped('rejects timers with reached_at/state mismatch', () =>
		Effect.gen(function* () {
			const sql = yield* Sql.SqlClient.SqlClient
			const uuid = yield* UUID7

			const serviceCallId = yield* uuid.randomUUIDv7()
			const tenantId = yield* uuid.randomUUIDv7()

			const now = yield* DateTime.now
			const registeredAt = DateTime.formatIso(now)
			const dueAt = DateTime.formatIso(DateTime.add(now, { hours: 1 }))
			const reachedAt = DateTime.formatIso(DateTime.add(now, { hours: 2 }))

			yield* insertServiceCall(tenantId, serviceCallId)

			const exit = yield* Effect.exit(
				sql`
            INSERT INTO timer_schedules (tenant_id,
                                         service_call_id,
                                         correlation_id,
                                         due_at,
                                         registered_at,
                                         reached_at,
                                         state)
            VALUES (${tenantId},
                    ${serviceCallId},
                    'corr-789',
                    ${dueAt},
                    ${registeredAt},
                    ${reachedAt},
                    'Scheduled')
				`,
			)

			expect(Exit.isFailure(exit)).toBe(true)
		}),
	)
})
