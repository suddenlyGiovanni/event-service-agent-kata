import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { RequestSpec } from '../http/request-spec.schema.ts'

/**
 * SubmitServiceCall - Create and schedule a new ServiceCall
 *
 * Produced by: API
 * Consumed by: Orchestration
 */
export class SubmitServiceCall extends Schema.TaggedClass<SubmitServiceCall>()('SubmitServiceCall', {
	/** Timestamp when execution should start (ISO8601) */
	dueAt: Iso8601DateTime,
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
	/** Optional tags for categorization and filtering */
	tags: Schema.optional(Schema.Array(Schema.String)),
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export const ApiCommands = Schema.Union(SubmitServiceCall)

export type ApiCommands = Schema.Schema.Type<typeof ApiCommands>
