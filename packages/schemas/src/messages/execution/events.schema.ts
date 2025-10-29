import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'

/**
 * ExecutionStarted - Execution attempt started
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export class ExecutionStarted extends Schema.TaggedClass<ExecutionStarted>()('ExecutionStarted', {
	serviceCallId: ServiceCallId,
	/** Timestamp when HTTP request execution began (ISO8601) */
	startedAt: Iso8601DateTime,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

/**
 * ExecutionSucceeded - Call succeeded
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export class ExecutionSucceeded extends Schema.TaggedClass<ExecutionSucceeded>()('ExecutionSucceeded', {
	/** Timestamp when HTTP request completed successfully (ISO8601) */
	finishedAt: Iso8601DateTime,
	/** HTTP response metadata (status, headers, latency, body snippet) */
	responseMeta: ResponseMeta,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

/**
 * ExecutionFailed - Call failed
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export class ExecutionFailed extends Schema.TaggedClass<ExecutionFailed>()('ExecutionFailed', {
	/** Error details (kind, message, latency, additional context) */
	errorMeta: ErrorMeta,
	/** Timestamp when HTTP request failed (ISO8601) */
	finishedAt: Iso8601DateTime,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export const ExecutionEvents = Schema.Union(ExecutionStarted, ExecutionSucceeded, ExecutionFailed)

export type ExecutionEvents = Schema.Schema.Type<typeof ExecutionEvents>
