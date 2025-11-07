/** biome-ignore-all lint/style/useNamingConvention: Exposes _tag for Tag registry */
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
	/**
	 * Decode from wire format to validated domain event
	 *
	 * @internal
	 */
	static readonly decode = Schema.decode(ServiceCallSubmitted)

	/**
	 * Encode from domain event to wire format DTO
	 *
	 * @internal
	 */
	static readonly encode = Schema.encode(ServiceCallSubmitted)

	/**
	 * Discriminator tag for pattern matching
	 *
	 * @internal
	 */
	static readonly Tag = ServiceCallSubmitted._tag
}

/**
 * Type aliases for ServiceCallSubmitted event
 */
export declare namespace ServiceCallSubmitted {
	/**
	 * Validated domain type
	 */
	type Type = typeof ServiceCallSubmitted.Type

	/**
	 * Wire format DTO type
	 */
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
	/**
	 * Decode from wire format to validated domain event
	 *
	 * @internal
	 */
	static readonly decode = Schema.decode(ServiceCallScheduled)

	/**
	 * Encode from domain event to wire format DTO
	 *
	 * @internal
	 */
	static readonly encode = Schema.encode(ServiceCallScheduled)

	/**
	 * Discriminator tag for pattern matching
	 *
	 * @internal
	 */
	static readonly Tag = ServiceCallScheduled._tag
}

/**
 * Type aliases for ServiceCallScheduled event
 */
export declare namespace ServiceCallScheduled {
	/**
	 * Validated domain type
	 */
	type Type = typeof ServiceCallScheduled.Type

	/**
	 * Wire format DTO type
	 */
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
	/**
	 * Decode from wire format to validated domain event
	 *
	 * @internal
	 */
	static readonly decode = Schema.decode(ServiceCallRunning)

	/**
	 * Encode from domain event to wire format DTO
	 *
	 * @internal
	 */
	static readonly encode = Schema.encode(ServiceCallRunning)

	/**
	 * Discriminator tag for pattern matching
	 *
	 * @internal
	 */
	static readonly Tag = ServiceCallRunning._tag
}

/**
 * Type aliases for ServiceCallRunning event
 */
export declare namespace ServiceCallRunning {
	/**
	 * Validated domain type
	 */
	type Type = typeof ServiceCallRunning.Type

	/**
	 * Wire format DTO type
	 */
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
	/**
	 * Decode from wire format to validated domain event
	 *
	 * @internal
	 */
	static readonly decode = Schema.decode(ServiceCallSucceeded)

	/**
	 * Encode from domain event to wire format DTO
	 *
	 * @internal
	 */
	static readonly encode = Schema.encode(ServiceCallSucceeded)

	/**
	 * Discriminator tag for pattern matching
	 *
	 * @internal
	 */
	static readonly Tag = ServiceCallSucceeded._tag
}

/**
 * Type aliases for ServiceCallSucceeded event
 */
export declare namespace ServiceCallSucceeded {
	/**
	 * Validated domain type
	 */
	type Type = typeof ServiceCallSucceeded.Type

	/**
	 * Wire format DTO type
	 */
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
	/**
	 * Decode from wire format to validated domain event
	 *
	 * @internal
	 */
	static readonly decode = Schema.decode(ServiceCallFailed)

	/**
	 * Encode from domain event to wire format DTO
	 *
	 * @internal
	 */
	static readonly encode = Schema.encode(ServiceCallFailed)

	/**
	 * Discriminator tag for pattern matching
	 *
	 * @internal
	 */
	static readonly Tag = ServiceCallFailed._tag
}

/**
 * Type aliases for ServiceCallFailed event
 */
export declare namespace ServiceCallFailed {
	/**
	 * Validated domain type
	 */
	type Type = typeof ServiceCallFailed.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof ServiceCallFailed.Encoded
}

/**
 * Schema union for runtime validation of any Orchestration event
 *
 * @internal
 */
export const Events = Schema.Union(
	ServiceCallSubmitted,
	ServiceCallScheduled,
	ServiceCallRunning,
	ServiceCallSucceeded,
	ServiceCallFailed,
)

/**
 * Union type of all Orchestration events
 */
export type Events = Schema.Schema.Type<typeof Events>

/**
 * Tag discriminator type for Orchestration events
 */
export type Tag = Events['_tag']
