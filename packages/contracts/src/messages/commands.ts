/**
 * Command Messages
 *
 * Commands trigger actions across module boundaries.
 * Based on docs/design/messages.md
 */

import type { Iso8601DateTime, ServiceCallId, TenantId } from '../types/shared.ts'

/**
 * HTTP methods supported by the system
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * RequestSpec - Specification for an HTTP request
 */
export interface RequestSpec {
	readonly method: HttpMethod
	readonly url: string
	readonly headers?: Record<string, string>
	readonly body?: string
}

/**
 * RequestSpecWithoutBody - RequestSpec for logging/tracing without full body
 */
export type RequestSpecWithoutBody = Omit<RequestSpec, 'body'> & {
	readonly bodySnippet?: string
}

/**
 * SubmitServiceCall - Create and schedule a new ServiceCall
 *
 * Produced by: API
 * Consumed by: Orchestration
 */
export interface SubmitServiceCall {
	readonly type: 'SubmitServiceCall'
	readonly tenantId: TenantId
	readonly name: string
	readonly dueAt: Iso8601DateTime
	readonly requestSpec: RequestSpec
	readonly tags?: readonly string[]
	readonly idempotencyKey?: string
}

/**
 * StartExecution - Trigger HTTP execution for a scheduled ServiceCall
 *
 * Produced by: Orchestration
 * Consumed by: Execution
 */
export interface StartExecution {
	readonly type: 'StartExecution'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
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
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly dueAt: Iso8601DateTime
}

/**
 * Command - Union of all command types
 */
export type Command = SubmitServiceCall | StartExecution | ScheduleTimer
