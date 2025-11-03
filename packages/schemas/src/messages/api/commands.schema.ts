import * as Schema from 'effect/Schema'

import { TenantId } from '../../shared/index.ts'
import { RequestSpec } from '../http/request-spec.schema.ts'

/**
 * SubmitServiceCall - Create and schedule a new ServiceCall
 *
 * Produced by: API
 * Consumed by: Orchestration
 */
export class SubmitServiceCall extends Schema.TaggedClass<SubmitServiceCall>()('SubmitServiceCall', {
	/**
	 * Timestamp when execution should start
	 *
	 * Domain type: DateTime.Utc
	 * Wire format: epoch milliseconds
	 */
	dueAt: Schema.DateTimeUtc,

	/**
	 * Optional idempotency key for duplicate detection
	 *
	 * If provided, duplicate submissions with the same key will be deduplicated.
	 * See ADR-0006 for idempotency strategy details.
	 */
	idempotencyKey: Schema.optional(Schema.String),

	/** Human-readable name for the service call */
	name: Schema.String,

	/**
	 * Complete HTTP request specification (includes body)
	 *
	 * The body is stored separately in the database after submission.
	 * Subsequent commands/events use RequestSpecWithoutBody to keep payloads small.
	 */
	requestSpec: RequestSpec,

	/**
	 * Optional tags for categorization and filtering
	 */
	tags: Schema.optional(Schema.Array(Schema.String)),

	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(SubmitServiceCall)

	static readonly encode = Schema.encode(SubmitServiceCall)

	// biome-ignore lint/style/useNamingConvention: Exposes _tag for Tag registry
	static readonly Tag = SubmitServiceCall._tag
}

export declare namespace SubmitServiceCall {
	type Type = typeof SubmitServiceCall.Type
	type Dto = typeof SubmitServiceCall.Encoded
}

export const Commands = Schema.Union(SubmitServiceCall)

export type Commands = Schema.Schema.Type<typeof Commands>

export type Tag = Commands['_tag']
