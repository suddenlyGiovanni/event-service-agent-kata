import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { RequestSpecWithoutBody } from '../http/request-spec.schema.ts'

/**
 * ServiceCallSubmitted - Submission accepted
 *
 * Produced by: Orchestration
 */
export class ServiceCallSubmitted extends Schema.TaggedClass<ServiceCallSubmitted>()('ServiceCallSubmitted', {
	/** Human-readable name for the service call */
	name: Schema.String,
	/** HTTP request specification (body excluded - stored separately) */
	requestSpec: RequestSpecWithoutBody,
	serviceCallId: ServiceCallId,
	/** Timestamp when the service call was submitted (ISO8601) */
	submittedAt: Iso8601DateTime,
	/** Optional tags for categorization and filtering */
	tags: Schema.optional(Schema.Array(Schema.String)),
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

/**
 * ServiceCallScheduled - DueAt recorded/eligible
 *
 * Produced by: Orchestration
 */
export class ServiceCallScheduled extends Schema.TaggedClass<ServiceCallScheduled>()('ServiceCallScheduled', {
	/** Timestamp when execution should start (ISO8601) */
	dueAt: Iso8601DateTime,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

/**
 * ServiceCallRunning - Execution started at domain level
 *
 * Produced by: Orchestration
 */
export class ServiceCallRunning extends Schema.TaggedClass<ServiceCallRunning>()('ServiceCallRunning', {
	serviceCallId: ServiceCallId,
	/** Timestamp when execution began (ISO8601) */
	startedAt: Iso8601DateTime,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

/**
 * ServiceCallSucceeded - Successful completion at domain level
 *
 * Produced by: Orchestration
 */
export class ServiceCallSucceeded extends Schema.TaggedClass<ServiceCallSucceeded>()('ServiceCallSucceeded', {
	/** Timestamp when execution completed successfully (ISO8601) */
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
 * ServiceCallFailed - Failed completion at domain level
 *
 * Produced by: Orchestration
 */
export class ServiceCallFailed extends Schema.TaggedClass<ServiceCallFailed>()('ServiceCallFailed', {
	/** Error details (kind, message, latency, additional context) */
	errorMeta: ErrorMeta,
	/** Timestamp when execution failed (ISO8601) */
	finishedAt: Iso8601DateTime,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export const OrchestrationEvents = Schema.Union(
	ServiceCallSubmitted,
	ServiceCallScheduled,
	ServiceCallRunning,
	ServiceCallSucceeded,
	ServiceCallFailed,
)

export type OrchestrationEvents = Schema.Schema.Type<typeof OrchestrationEvents>
