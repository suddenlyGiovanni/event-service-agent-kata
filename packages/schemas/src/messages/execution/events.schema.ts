import * as Schema from 'effect/Schema'

import { Iso8601DateTime, ServiceCallId, TenantId } from '../../shared/index.ts'
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

export declare namespace ExecutionStarted {
	type Type = typeof ExecutionStarted.Type
	type Dto = typeof ExecutionStarted.Encoded
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

export declare namespace ExecutionSucceeded {
	type Type = typeof ExecutionSucceeded.Type
	type Dto = typeof ExecutionSucceeded.Encoded
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

export declare namespace ExecutionFailed {
	type Type = typeof ExecutionFailed.Type
	type Dto = typeof ExecutionFailed.Encoded
}

export const Events = Schema.Union(ExecutionStarted, ExecutionSucceeded, ExecutionFailed)

export type Events = Schema.Schema.Type<typeof Events>
