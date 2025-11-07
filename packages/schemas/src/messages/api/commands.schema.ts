/** biome-ignore-all lint/style/useNamingConvention: Effect Schema TaggedClass requires PascalCase types and `_tag` discriminators */
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
	/**
	 * Decode from wire format to validated command
	 *
	 * @internal
	 */
	static readonly decode = Schema.decode(SubmitServiceCall)

	/**
	 * Encode from command to wire format DTO
	 *
	 * @internal
	 */
	static readonly encode = Schema.encode(SubmitServiceCall)

	/**
	 * Discriminator tag for pattern matching
	 *
	 * @internal
	 */
	static readonly Tag = SubmitServiceCall._tag
}

/**
 * Type aliases for SubmitServiceCall command
 */
export declare namespace SubmitServiceCall {
	/**
	 * Validated domain type
	 */
	type Type = typeof SubmitServiceCall.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof SubmitServiceCall.Encoded
}

/**
 * Schema union for runtime validation of any API command
 *
 * @internal
 */
export const Commands = Schema.Union(SubmitServiceCall)

/**
 * Union type of all API commands
 */
export type Commands = Schema.Schema.Type<typeof Commands>

/**
 * Tag discriminator type for API commands
 */
export type Tag = Commands['_tag']
