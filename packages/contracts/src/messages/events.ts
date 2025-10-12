/**
 * Event Messages
 *
 * Domain events published after state transitions.
 * Based on docs/design/messages.md
 */

import type { RequestSpecWithoutBody } from '#/types/http.ts'
import type { Iso8601DateTime, ServiceCallId, TenantId } from '#/types/shared.ts'

/**
 * ResponseMeta - Metadata about a successful HTTP response
 */
export interface ResponseMeta {
	readonly status: number
	readonly headers?: Record<string, string>
	readonly bodySnippet?: string
	readonly latencyMs?: number
}

/**
 * ErrorMeta - Metadata about a failed execution
 */
export interface ErrorMeta {
	readonly kind: string
	readonly message?: string
	readonly details?: Record<string, unknown>
	readonly latencyMs?: number
}

/**
 * ServiceCallSubmitted - Submission accepted
 *
 * Produced by: Orchestration
 */
export interface ServiceCallSubmitted {
	readonly type: 'ServiceCallSubmitted'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly name: string
	readonly requestSpec: RequestSpecWithoutBody
	readonly submittedAt: Iso8601DateTime
	readonly tags?: readonly string[]
}

/**
 * ServiceCallScheduled - DueAt recorded/eligible
 *
 * Produced by: Orchestration
 */
export interface ServiceCallScheduled {
	readonly type: 'ServiceCallScheduled'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly dueAt: Iso8601DateTime
}

/**
 * ServiceCallRunning - Execution started at domain level
 *
 * Produced by: Orchestration
 */
export interface ServiceCallRunning {
	readonly type: 'ServiceCallRunning'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly startedAt: Iso8601DateTime
}

/**
 * ServiceCallSucceeded - Successful completion at domain level
 *
 * Produced by: Orchestration
 */
export interface ServiceCallSucceeded {
	readonly type: 'ServiceCallSucceeded'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly finishedAt: Iso8601DateTime
	readonly responseMeta: ResponseMeta
}

/**
 * ServiceCallFailed - Failed completion at domain level
 *
 * Produced by: Orchestration
 */
export interface ServiceCallFailed {
	readonly type: 'ServiceCallFailed'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly finishedAt: Iso8601DateTime
	readonly errorMeta: ErrorMeta
}

/**
 * DueTimeReached - Time to start execution has arrived
 *
 * Produced by: Timer (or Orchestration fast-path)
 * Consumed by: Orchestration
 */
export interface DueTimeReached {
	readonly type: 'DueTimeReached'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly reachedAt?: Iso8601DateTime
}

/**
 * ExecutionStarted - Execution attempt started
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export interface ExecutionStarted {
	readonly type: 'ExecutionStarted'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly startedAt: Iso8601DateTime
}

/**
 * ExecutionSucceeded - Call succeeded
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export interface ExecutionSucceeded {
	readonly type: 'ExecutionSucceeded'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly finishedAt: Iso8601DateTime
	readonly responseMeta: ResponseMeta
}

/**
 * ExecutionFailed - Call failed
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export interface ExecutionFailed {
	readonly type: 'ExecutionFailed'
	readonly tenantId: TenantId
	readonly serviceCallId: ServiceCallId
	readonly finishedAt: Iso8601DateTime
	readonly errorMeta: ErrorMeta
}

/**
 * Event - Union of all event types
 */
export type Event =
	| ServiceCallSubmitted
	| ServiceCallScheduled
	| ServiceCallRunning
	| ServiceCallSucceeded
	| ServiceCallFailed
	| DueTimeReached
	| ExecutionStarted
	| ExecutionSucceeded
	| ExecutionFailed
