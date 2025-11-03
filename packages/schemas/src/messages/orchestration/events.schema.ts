import * as Schema from 'effect/Schema'

import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { ServiceCallEventBase } from '../common/service-call-event-base.schema.ts'
import { RequestSpecWithoutBody } from '../http/request-spec.schema.ts'

/**
 * ServiceCallSubmitted - Submission accepted
 *
 * Produced by: Orchestration
 */
export class ServiceCallSubmitted extends Schema.TaggedClass<ServiceCallSubmitted>()('ServiceCallSubmitted', {
	...ServiceCallEventBase.fields,

	/**
	 * Human-readable name for the service call
	 */
	name: Schema.String,

	/**
	 * HTTP request specification (body excluded - stored separately)
	 */
	requestSpec: RequestSpecWithoutBody,

	/**
	 * Timestamp when the service call was submitted (ISO8601)
	 */
	submittedAt: Schema.DateTimeUtc,

	/**
	 * Optional tags for categorization and filtering
	 */
	tags: Schema.optional(Schema.Array(Schema.String)),
}) {
	static readonly decode = Schema.decode(ServiceCallSubmitted)

	static readonly encode = Schema.encode(ServiceCallSubmitted)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ServiceCallSubmitted._tag
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
export class ServiceCallScheduled extends Schema.TaggedClass<ServiceCallScheduled>()('ServiceCallScheduled', {
	...ServiceCallEventBase.fields,

	/**
	 * Timestamp when execution should start (ISO8601)
	 */
	dueAt: Schema.DateTimeUtc,
}) {
	static readonly decode = Schema.decode(ServiceCallScheduled)

	static readonly encode = Schema.encode(ServiceCallScheduled)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ServiceCallScheduled._tag
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
export class ServiceCallRunning extends Schema.TaggedClass<ServiceCallRunning>()('ServiceCallRunning', {
	...ServiceCallEventBase.fields,

	/**
	 * Timestamp when execution began (ISO8601)
	 */
	startedAt: Schema.DateTimeUtc,
}) {
	static readonly decode = Schema.decode(ServiceCallRunning)

	static readonly encode = Schema.encode(ServiceCallRunning)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ServiceCallRunning._tag
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
export class ServiceCallSucceeded extends Schema.TaggedClass<ServiceCallSucceeded>()('ServiceCallSucceeded', {
	...ServiceCallEventBase.fields,

	/**
	 * Timestamp when execution completed successfully (ISO8601)
	 */

	finishedAt: Schema.DateTimeUtc,

	/**
	 * HTTP response metadata (status, headers, latency, body snippet)
	 */

	responseMeta: ResponseMeta,
}) {
	static readonly decode = Schema.decode(ServiceCallSucceeded)

	static readonly encode = Schema.encode(ServiceCallSucceeded)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ServiceCallSucceeded._tag
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
export class ServiceCallFailed extends Schema.TaggedClass<ServiceCallFailed>()('ServiceCallFailed', {
	...ServiceCallEventBase.fields,

	/**
	 *  Error details (kind, message, latency, additional context)
	 */
	errorMeta: ErrorMeta,

	/**
	 * Timestamp when execution failed (ISO8601)
	 */
	finishedAt: Schema.DateTimeUtc,
}) {
	static readonly decode = Schema.decode(ServiceCallFailed)

	static readonly encode = Schema.encode(ServiceCallFailed)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ServiceCallFailed._tag
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

export type Tag = Events['_tag']
