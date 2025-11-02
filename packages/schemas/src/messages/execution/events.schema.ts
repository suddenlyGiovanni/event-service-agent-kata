import * as Schema from 'effect/Schema'

import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { X } from '../common/xxx.ts'
import { Tag } from '../tag.ts'

/**
 * ExecutionStarted - Execution attempt started
 *
 * Produced by: Execution
 * Consumed by: Orchestration
 */
export class ExecutionStarted extends Schema.TaggedClass<ExecutionStarted>()(Tag.Execution.Events.ExecutionStarted, {
	...X.fields,

	/** Timestamp when HTTP request execution began (ISO8601) */
	startedAt: Schema.DateTimeUtc,
}) {
	static readonly decode = Schema.decode(ExecutionStarted)

	static readonly encode = Schema.encode(ExecutionStarted)
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
export class ExecutionSucceeded extends Schema.TaggedClass<ExecutionSucceeded>()(
	Tag.Execution.Events.ExecutionSucceeded,
	{
		...X.fields,

		/**
		 * Timestamp when HTTP request completed successfully (ISO8601)
		 */
		finishedAt: Schema.DateTimeUtc,

		/**
		 * HTTP response metadata (status, headers, latency, body snippet)
		 */
		responseMeta: ResponseMeta,
	},
) {
	static readonly decode = Schema.decode(ExecutionSucceeded)

	static readonly encode = Schema.encode(ExecutionSucceeded)
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
export class ExecutionFailed extends Schema.TaggedClass<ExecutionFailed>()(Tag.Execution.Events.ExecutionFailed, {
	...X.fields,

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
}

export declare namespace ExecutionFailed {
	type Type = typeof ExecutionFailed.Type
	type Dto = typeof ExecutionFailed.Encoded
}

export const Events = Schema.Union(ExecutionStarted, ExecutionSucceeded, ExecutionFailed)

export type Events = Schema.Schema.Type<typeof Events>
