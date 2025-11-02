import * as Schema from 'effect/Schema'

import { Iso8601DateTime, ServiceCallId, TenantId } from '../../shared/index.ts'
import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { RequestSpecWithoutBody } from '../http/request-spec.schema.ts'
import { Tag } from '../tag.ts'

/**
 * ServiceCallSubmitted - Submission accepted
 *
 * Produced by: Orchestration
 */
export class ServiceCallSubmitted extends Schema.TaggedClass<ServiceCallSubmitted>()(
	Tag.Orchestration.Events.ServiceCallSubmitted,
	{
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
	},
) {
	static readonly decode = Schema.decode(ServiceCallSubmitted)

	static readonly encode = Schema.encode(ServiceCallSubmitted)
}

export declare namespace ServiceCallSubmitted {
	type Type = typeof ServiceCallSubmitted.Type
	type Dto = typeof ServiceCallSubmitted.Encoded
}

/**
 * ServiceCallScheduled - DueAt recorded/eligible
 *
 * Produced by: Orchestration
 */
export class ServiceCallScheduled extends Schema.TaggedClass<ServiceCallScheduled>()(
	Tag.Orchestration.Events.ServiceCallScheduled,
	{
		/** Timestamp when execution should start (ISO8601) */
		dueAt: Iso8601DateTime,
		serviceCallId: ServiceCallId,
		tenantId: TenantId,
	},
) {
	static readonly decode = Schema.decode(ServiceCallScheduled)

	static readonly encode = Schema.encode(ServiceCallScheduled)
}

export declare namespace ServiceCallScheduled {
	type Type = typeof ServiceCallScheduled.Type
	type Dto = typeof ServiceCallScheduled.Encoded
}

/**
 * ServiceCallRunning - Execution started at domain level
 *
 * Produced by: Orchestration
 */
export class ServiceCallRunning extends Schema.TaggedClass<ServiceCallRunning>()(
	Tag.Orchestration.Events.ServiceCallRunning,
	{
		serviceCallId: ServiceCallId,
		/** Timestamp when execution began (ISO8601) */
		startedAt: Iso8601DateTime,
		tenantId: TenantId,
	},
) {
	static readonly decode = Schema.decode(ServiceCallRunning)

	static readonly encode = Schema.encode(ServiceCallRunning)
}

export declare namespace ServiceCallRunning {
	type Type = typeof ServiceCallRunning.Type
	type Dto = typeof ServiceCallRunning.Encoded
}

/**
 * ServiceCallSucceeded - Successful completion at domain level
 *
 * Produced by: Orchestration
 */
export class ServiceCallSucceeded extends Schema.TaggedClass<ServiceCallSucceeded>()(
	Tag.Orchestration.Events.ServiceCallSucceeded,
	{
		/** Timestamp when execution completed successfully (ISO8601) */
		finishedAt: Iso8601DateTime,
		/** HTTP response metadata (status, headers, latency, body snippet) */
		responseMeta: ResponseMeta,
		serviceCallId: ServiceCallId,
		tenantId: TenantId,
	},
) {
	static readonly decode = Schema.decode(ServiceCallSucceeded)

	static readonly encode = Schema.encode(ServiceCallSucceeded)
}

export declare namespace ServiceCallSucceeded {
	type Type = typeof ServiceCallSucceeded.Type
	type Dto = typeof ServiceCallSucceeded.Encoded
}

/**
 * ServiceCallFailed - Failed completion at domain level
 *
 * Produced by: Orchestration
 */
export class ServiceCallFailed extends Schema.TaggedClass<ServiceCallFailed>()(
	Tag.Orchestration.Events.ServiceCallFailed,
	{
		/** Error details (kind, message, latency, additional context) */
		errorMeta: ErrorMeta,
		/** Timestamp when execution failed (ISO8601) */
		finishedAt: Iso8601DateTime,
		serviceCallId: ServiceCallId,
		tenantId: TenantId,
	},
) {
	static readonly decode = Schema.decode(ServiceCallFailed)

	static readonly encode = Schema.encode(ServiceCallFailed)
}

export declare namespace ServiceCallFailed {
	type Type = typeof ServiceCallFailed.Type
	type Dto = typeof ServiceCallFailed.Encoded
}

export const Events = Schema.Union(
	ServiceCallSubmitted,
	ServiceCallScheduled,
	ServiceCallRunning,
	ServiceCallSucceeded,
	ServiceCallFailed,
)

export type Events = Schema.Schema.Type<typeof Events>
