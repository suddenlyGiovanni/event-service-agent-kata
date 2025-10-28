import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'

/**
 * Orchestration Commands
 *
 * Effect Schema definitions for runtime-validated Orchestration commands.
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
 * ScheduleTimer - Request a due signal at/after dueAt
 *
 * **Produced by**: Orchestration
 * **Consumed by**: Timer
 *
 * This command instructs Timer to schedule a delayed signal that fires
 * when the specified `dueAt` timestamp is reached. Timer polls and publishes
 * `DueTimeReached` event to notify Orchestration.
 *
 * **Wire Format (DTO)**:
 * ```json
 * {
 *   "_tag": "ScheduleTimer",
 *   "tenantId": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0",
 *   "serviceCallId": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1",
 *   "dueAt": "2025-10-27T12:00:00.000Z"
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Decode from wire format (JSON → validated command)
 * const command = yield* ScheduleTimer.decode(rawJson)
 *
 * // Construct in domain code
 * const command = new ScheduleTimer({
 *   tenantId,
 *   serviceCallId,
 *   dueAt: Iso8601DateTime.make(DateTime.formatIso(scheduledTime)),
 * })
 *
 * // Encode to wire format (validated command → JSON DTO)
 * const dto = yield* ScheduleTimer.encode(command)
 * ```
 */
export class ScheduleTimer extends Schema.TaggedClass<ScheduleTimer>()('ScheduleTimer', {
	dueAt: Iso8601DateTime,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	/**
	 * Decode from unknown/wire format to validated command
	 *
	 * Returns `Effect<ScheduleTimer, ParseError>`:
	 * - **Success**: Validated ScheduleTimer instance
	 * - **Failure**: ParseError with detailed validation errors
	 */
	static readonly decode = Schema.decode(ScheduleTimer)

	/**
	 * Encode from validated command to wire format DTO
	 *
	 * Returns `Effect<ScheduleTimerDTO, ParseError>`:
	 * - Unbrands types (TenantId → string, ServiceCallId → string)
	 * - Preserves ISO8601 DateTime format
	 * - Ready for JSON serialization
	 */
	static readonly encode = Schema.encode(ScheduleTimer)
}
