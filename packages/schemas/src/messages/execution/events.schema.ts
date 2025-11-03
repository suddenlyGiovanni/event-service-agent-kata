import * as Schema from 'effect/Schema'

import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { ServiceCallEventBase } from '../common/service-call-event-base.schema.ts'

/**
 * ExecutionStarted - Execution attempt started
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export class ExecutionStarted extends Schema.TaggedClass<ExecutionStarted>()('ExecutionStarted', {
	...ServiceCallEventBase.fields,

	/** Timestamp when HTTP request execution began (ISO8601) */
	startedAt: Schema.DateTimeUtc,
}) {
	static readonly decode = Schema.decode(ExecutionStarted)

	static readonly encode = Schema.encode(ExecutionStarted)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ExecutionStarted._tag
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
	static readonly decode = Schema.decode(ExecutionSucceeded)

	static readonly encode = Schema.encode(ExecutionSucceeded)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ExecutionSucceeded._tag
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
	static readonly decode = Schema.decode(ExecutionFailed)

	static readonly encode = Schema.encode(ExecutionFailed)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = ExecutionFailed._tag
}

export declare namespace ExecutionFailed {
	type Type = typeof ExecutionFailed.Type
	type Dto = typeof ExecutionFailed.Encoded
}

export const Events = Schema.Union(ExecutionStarted, ExecutionSucceeded, ExecutionFailed)

export type Events = Schema.Schema.Type<typeof Events>
