/** biome-ignore-all lint/style/useNamingConvention: Effect Schema TaggedClass requires PascalCase types and `_tag`
discriminators */
import * as Schema from 'effect/Schema'

import { ServiceCallEventBase } from '../common/service-call-event-base.schema.ts'
import { RequestSpecWithoutBody } from '../http/request-spec.schema.ts'

/**
 * Orchestration Commands
 *
 * Effect Schema definitions for runtime-validated Orchestration commands. These schemas provide:
 *
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
 * **Produced by**: Orchestration. **Consumed by**: Timer.
 *
 * This command instructs Timer to schedule a delayed signal that fires when the specified `dueAt` timestamp is reached.
 * Timer polls and publishes `DueTimeReached` event to notify Orchestration.
 *
 * **Wire Format (DTO)**:
 *
 * ```json
 * {
 * 	"_tag": "ScheduleTimer",
 * 	"tenantId": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0",
 * 	"serviceCallId": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1",
 * 	"dueAt": "2025-10-27T12:00:00.000Z"
 * }
 * ```
 *
 * @example
 *
 * ```typescript ignore
 * // Decode from wire format (JSON → validated command)
 * const command = yield* ScheduleTimer.decode(rawJson)
 *
 * // Construct in domain code
 * const command2 = new ScheduleTimer({
 * 	tenantId,
 * 	serviceCallId,
 * 	dueAt: scheduledTime, // DateTime.Utc directly
 * })
 *
 * // Encode to wire format (validated command → JSON DTO)
 * const dto = yield* ScheduleTimer.encode(command)
 * ```
 */
export class ScheduleTimer extends Schema.TaggedClass<ScheduleTimer>()('ScheduleTimer', {
	...ServiceCallEventBase.fields,

	dueAt: Schema.DateTimeUtc,
}) {
	/**
	 * Decode from unknown/wire format to validated command
	 *
	 * Returns `Effect<ScheduleTimer, ParseError>`:
	 *
	 * - **Success**: Validated ScheduleTimer instance
	 * - **Failure**: ParseError with detailed validation errors
	 */
	static readonly decode = Schema.decode(ScheduleTimer)

	/**
	 * Encode from validated command to wire format DTO
	 *
	 * Returns `Effect<ScheduleTimerDTO, ParseError>`:
	 *
	 * - Unbrands types (TenantId → string, ServiceCallId → string)
	 * - Preserves ISO8601 DateTime format
	 * - Ready for JSON serialization
	 */
	static readonly encode = Schema.encode(ScheduleTimer)

	/**
	 * Discriminator tag for pattern matching
	 */
	static readonly Tag = ScheduleTimer._tag
}

/**
 * Type aliases for ScheduleTimer command
 */
export declare namespace ScheduleTimer {
	/**
	 * Validated domain type
	 */
	type Type = typeof ScheduleTimer.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof ScheduleTimer.Encoded
}

/**
 * StartExecution - Trigger HTTP execution for a scheduled ServiceCall
 *
 * Produced by: Orchestration. Consumed by: Execution.
 *
 * Note: Uses RequestSpecWithoutBody for the command payload. The full request body is stored separately in persistent
 * storage (see storage contract definition) and retrieved by the Execution module using the serviceCallId. This avoids
 * transmitting large payloads in commands/events.
 */
export class StartExecution extends Schema.TaggedClass<StartExecution>()('StartExecution', {
	...ServiceCallEventBase.fields,

	/**
	 * HTTP request specification (body excluded)
	 *
	 * The full request body is stored in the database and retrieved by serviceCallId. This keeps command payloads small
	 * and avoids large messages in the broker.
	 */
	requestSpec: RequestSpecWithoutBody,
}) {
	/**
	 * Decode from wire format to validated command
	 */
	static readonly decode = Schema.decode(StartExecution)

	/**
	 * Encode from command to wire format DTO
	 */
	static readonly encode = Schema.encode(StartExecution)

	/**
	 * Discriminator tag for pattern matching
	 */
	static readonly Tag = StartExecution._tag
}

/**
 * Type aliases for StartExecution command
 */
export declare namespace StartExecution {
	/**
	 * Validated domain type
	 */
	type Type = typeof StartExecution.Type

	/**
	 * Wire format DTO type
	 */
	type Dto = typeof StartExecution.Encoded
}

/**
 * Schema union for runtime validation of any Orchestration command
 */
export const Commands = Schema.Union(StartExecution, ScheduleTimer)

/**
 * Union type of all Orchestration commands
 */
export type Commands = Schema.Schema.Type<typeof Commands>

/**
 * Tag discriminator type for Orchestration commands
 */
export type Tag = Commands['_tag']
