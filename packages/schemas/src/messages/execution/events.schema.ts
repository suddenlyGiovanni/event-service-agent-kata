/** biome-ignore-all lint/style/useNamingConvention: Effect Schema TaggedClass requires PascalCase types and `_tag`
discriminators */
import * as Schema from 'effect/Schema'

import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { ServiceCallEventBase } from '../common/service-call-event-base.schema.ts'

/**
 * ExecutionStarted - Execution attempt started
 *
 * Produced by: Execution Consumed by: Orchestration
 */
export class ExecutionStarted extends Schema.TaggedClass<ExecutionStarted>()('ExecutionStarted', {
	...ServiceCallEventBase.fields,

	/** Timestamp when HTTP request execution began (ISO8601) */
	startedAt: Schema.DateTimeUtc,
}) {
	/**
	 * Decode from wire format to validated domain event
	 */
	static readonly decode = Schema.decode(ExecutionStarted)

	/**
	 * Encode from domain event to wire format DTO
	 */
	static readonly encode = Schema.encode(ExecutionStarted)

	/**
	 * Discriminator tag for pattern matching
	 */
	static readonly Tag = ExecutionStarted._tag
}

/**
 * Type aliases for ExecutionStarted event
 */
export declare namespace ExecutionStarted {
	/**
	 * Validated domain type
	 */
	type Type = typeof ExecutionStarted.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof ExecutionStarted.Encoded
}

/**
 * ExecutionSucceeded - Call succeeded
 *
 * Produced by: Execution Consumed by: Orchestration
 */
export class ExecutionSucceeded extends Schema.TaggedClass<ExecutionSucceeded>()('ExecutionSucceeded', {
	...ServiceCallEventBase.fields,

	/**
	 * Timestamp when HTTP request completed successfully (ISO8601)
	 */
	finishedAt: Schema.DateTimeUtc,

	/**
	 * HTTP response metadata (status, headers, latency, body snippet)
	 */
	responseMeta: ResponseMeta,
}) {
	/**
	 * Decode from wire format to validated domain event
	 */
	static readonly decode = Schema.decode(ExecutionSucceeded)

	/**
	 * Encode from domain event to wire format DTO
	 */
	static readonly encode = Schema.encode(ExecutionSucceeded)

	/**
	 * Discriminator tag for pattern matching
	 */
	static readonly Tag = ExecutionSucceeded._tag
}

/** Type aliases for ExecutionSucceeded event */
export declare namespace ExecutionSucceeded {
	/**
	 * Validated domain type
	 */
	type Type = typeof ExecutionSucceeded.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof ExecutionSucceeded.Encoded
}

/**
 * ExecutionFailed - Call failed
 *
 * Produced by: Execution Consumed by: Orchestration
 */
export class ExecutionFailed extends Schema.TaggedClass<ExecutionFailed>()('ExecutionFailed', {
	...ServiceCallEventBase.fields,

	/**
	 * Error details (kind, message, latency, additional context)
	 */
	errorMeta: ErrorMeta,

	/**
	 * Timestamp when HTTP request failed (ISO8601)
	 */
	finishedAt: Schema.DateTimeUtc,
}) {
	/**
	 * Decode from wire format to validated domain event
	 */
	static readonly decode = Schema.decode(ExecutionFailed)

	/**
	 * Encode from domain event to wire format DTO
	 */
	static readonly encode = Schema.encode(ExecutionFailed)

	/**
	 * Discriminator tag for pattern matching
	 */
	static readonly Tag = ExecutionFailed._tag
}

/** Type aliases for ExecutionFailed event */
export declare namespace ExecutionFailed {
	/**
	 * Validated domain type
	 */
	type Type = typeof ExecutionFailed.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof ExecutionFailed.Encoded
}

/**
 * Schema union for runtime validation of any Execution event
 */
export const Events = Schema.Union(ExecutionStarted, ExecutionSucceeded, ExecutionFailed)

/**
 * Union type of all Execution events
 */
export type Events = Schema.Schema.Type<typeof Events>

/**
 * Tag discriminator type for Execution events
 */
export type Tag = Events['_tag']
