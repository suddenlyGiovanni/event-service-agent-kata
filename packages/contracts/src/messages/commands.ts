/**
 * Command Messages
 *
 * Commands trigger actions across module boundaries.
 * Based on docs/design/messages.md
 */

import type { RequestSpec, RequestSpecWithoutBody } from '#/types/http.ts'
import type { Iso8601DateTime, ServiceCallId, TenantId } from '#/types/shared.ts'

/**
 * SubmitServiceCall - Create and schedule a new ServiceCall
 *
 * Produced by: API
 * Consumed by: Orchestration
 */
export interface SubmitServiceCall {
	readonly type: 'SubmitServiceCall'
	readonly tenantId: TenantId.Type
	readonly name: string
	readonly dueAt: Iso8601DateTime.Type
	readonly requestSpec: RequestSpec
	readonly tags?: readonly string[]
	readonly idempotencyKey?: string
}

/**
 * StartExecution - Trigger HTTP execution for a scheduled ServiceCall
 *
 * Produced by: Orchestration
 * Consumed by: Execution
 *
 * Note: Uses RequestSpecWithoutBody for the command payload. The full request body
 * is stored separately in persistent storage (see storage contract definition) and retrieved by the Execution module using
 * the serviceCallId. This avoids transmitting large payloads in commands/events.
 */
export interface StartExecution {
	readonly type: 'StartExecution'
	readonly tenantId: TenantId.Type
	readonly serviceCallId: ServiceCallId.Type
	readonly requestSpec: RequestSpecWithoutBody
}

/**
 * ScheduleTimer - Request a due signal at/after dueAt
 *
 * Produced by: Orchestration
 * Consumed by: Timer
 */
export interface ScheduleTimer {
	readonly type: 'ScheduleTimer'
	readonly tenantId: TenantId.Type
	readonly serviceCallId: ServiceCallId.Type
	readonly dueAt: Iso8601DateTime.Type
}

/**
 * Command - Union of all command types
 */
export type Command = SubmitServiceCall | StartExecution | ScheduleTimer
