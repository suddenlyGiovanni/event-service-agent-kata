import * as Schema from 'effect/Schema'

import { ServiceCallEventBase } from '../common/service-call-event-base.schema.ts'
import { Tag } from '../tag.ts'

/**
 * Timer Domain Events
 *
 * Effect Schema definitions for runtime-validated Timer events.
 * These schemas provide:
 * - Compile-time type safety (TypeScript types)
 * - Runtime validation (parse/decode from wire format)
 * - Encoding/decoding (domain <-> DTO transformations)
 * - Branded type support (TenantId, ServiceCallId, etc.)
 *
 * @see ADR-0011 for schema migration strategy
 * @see ADR-0012 for package structure (schemas package)
 */

/**
 * DueTimeReached - Time to start execution has arrived
 *
 * **Produced by**: Timer (or Orchestration fast-path)
 * **Consumed by**: Orchestration
 *
 * This event signals that a scheduled timer has reached its due time
 * and execution should begin. The `reachedAt` timestamp indicates when
 * the polling worker detected the timer was due.
 *
 * **Wire Format (DTO)**:
 * ```json
 * {
 *   "_tag": "DueTimeReached",
 *   "tenantId": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0",
 *   "serviceCallId": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1",
 *   "reachedAt": "2025-10-27T12:00:00.000Z"
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Decode from wire format (JSON → validated domain event)
 * const event = yield* DueTimeReached.decode(rawJson)
 *
 * // Construct in domain code
 * const event = new DueTimeReached({
 *   tenantId,
 *   serviceCallId,
 *   reachedAt: firedAt, // DateTime.Utc directly (or undefined)
 * })
 *
 * // Encode to wire format (validated domain → JSON DTO)
 * const dto = yield* DueTimeReached.encode(event)
 * ```
 */
export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(Tag.Timer.Events.DueTimeReached, {
	...ServiceCallEventBase.fields,

	/**
	 * Optional timestamp when the due time was detected
	 *
	 * - **Present**: Indicates polling worker detected the timer was due
	 * - **Absent**: May indicate fast-path (timer was immediately eligible)
	 *
	 * Domain type: `DateTime.Utc` (Effect's immutable datetime)
	 * Wire format: ISO8601 string (e.g., "2025-10-27T12:00:00.000Z")
	 */
	reachedAt: Schema.optional(Schema.DateTimeUtc),
}) {
	/**
	 * Decode from unknown/wire format to validated domain event
	 *
	 * Returns `Effect<DueTimeReached, ParseError>`:
	 * - **Success**: Validated DueTimeReached instance
	 * - **Failure**: ParseError with detailed validation errors
	 *
	 * @example
	 * ```typescript
	 * const event = yield* DueTimeReached.decode({
	 *   type: 'DueTimeReached',
	 *   tenantId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0',
	 *   serviceCallId: '018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1',
	 *   reachedAt: '2025-10-27T12:00:00.000Z',
	 * })
	 * ```
	 */
	static readonly decode = Schema.decode(DueTimeReached)

	/**
	 * Encode from validated domain event to wire format DTO
	 *
	 * Returns `Effect<DueTimeReachedDTO, ParseError>`:
	 * - Unbrands types (TenantId → string, ServiceCallId → string)
	 * - Preserves ISO8601 DateTime format
	 * - Ready for JSON serialization
	 *
	 * @example
	 * ```typescript
	 * const dto = yield* DueTimeReached.encode(event)
	 * // dto: { type: 'DueTimeReached', tenantId: string, ... }
	 * await broker.publish(JSON.stringify(dto))
	 * ```
	 */
	static readonly encode = Schema.encode(DueTimeReached)
}

export declare namespace DueTimeReached {
	/**
	 * Validated domain type (branded types preserved)
	 *
	 * Used within domain logic where type safety is paramount.
	 */
	type Type = typeof DueTimeReached.Type

	/**
	 * DTO type for wire format (encoded representation)
	 *
	 * Used at adapter boundaries when encoding events for the broker.
	 * All branded types are converted to their primitive representations.
	 */
	type Dto = typeof DueTimeReached.Encoded
}

/**
 * Schema union for runtime validation of any Timer event
 */
export const Events = Schema.Union(DueTimeReached)

/**
 * Union type of all Timer events (extensible for future events)
 */
export type Events = Schema.Schema.Type<typeof Events>
