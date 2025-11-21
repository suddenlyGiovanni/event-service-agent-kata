/**
 * CorrelationId Schema
 *
 * Branded UUID7 type for distributed request tracing across module boundaries.
 *
 * **Purpose — Distributed Tracing**:
 * CorrelationId links causally-related messages across asynchronous workflows,
 * enabling end-to-end request tracing even when:
 *
 * - Messages cross module boundaries (API → Orchestration → Timer → Execution)
 * - Processing is async (events published to broker, consumed later)
 * - Time delays occur (timers fire hours after scheduling)
 *
 * **Correlation vs Causation**:
 *
 * - **CorrelationId**: "Which user request started this entire workflow?"
 *
 *   - Set once at API entry point, carried throughout
 *   - Never changes across message chain
 *   - Enables tracing: "Show me all events for user request X"
 *
 * - **CausationId (EnvelopeId)**: "Which specific message triggered this event?"
 *
 *   - Changes at each step (parent envelope → child envelope)
 *   - Enables causality chain: "What triggered what?"
 *   - Forms parent-child tree structure
 *
 * **Example Flow**:
 *
 * ```txt
 * 1. User HTTP Request → correlationId = uuid1 (generated here)
 * 2. SubmitServiceCall command → correlationId = uuid1, causationId = None
 * 3. ServiceCallSubmitted event → correlationId = uuid1, causationId = command.envelopeId
 * 4. ScheduleTimer command → correlationId = uuid1, causationId = event.envelopeId
 * 5. Timer aggregate persisted → correlationId = uuid1 (stored in domain)
 * 6. DueTimeReached event → correlationId = uuid1, causationId = None (time-driven)
 * 7. ExecuteServiceCall command → correlationId = uuid1, causationId = event.envelopeId
 * ```
 *
 * All messages share correlationId=uuid1, enabling query:
 * "Show me all events where correlationId = uuid1" → full request trace
 *
 * **Why Optional**:
 * CorrelationId is `Option<CorrelationId>` because:
 * - User-initiated requests have correlation (from HTTP headers or generated)
 * - System-initiated events may lack correlation (background jobs, cron tasks)
 * - Tests often omit correlation for simplicity
 *
 * Type Structure: `string & Brand<UUID7Brand> & Brand<CorrelationIdBrand>`
 *
 * - Cannot be confused with ServiceCallId, TenantId, or EnvelopeId
 * - Runtime validation via Effect Schema
 *
 * @see docs/design/ports.md#event-publishing-pattern — Correlation propagation
 * @see docs/decisions/ADR-0013-correlation-propagation.md — Design rationale (if exists)
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import * as Service from '@event-service-agent/platform/uuid7'

import { UUID7 } from './uuid7.schema.ts'

/**
 * CorrelationId brand for internal use
 */
export const CorrelationIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/CorrelationId')

/**
 * CorrelationId — Branded UUID7 for distributed request tracing
 *
 * Identifies a logical request spanning multiple messages/events. All messages related to the same user request share
 * the same CorrelationId.
 */
export class CorrelationId extends UUID7.pipe(Schema.brand(CorrelationIdBrand)) {
	/**
	 * Generate a new CorrelationId using UUID version 7
	 *
	 * Creates time-ordered identifier for tracing a new request. UUID7's timestamp enables chronological sorting of
	 * traces.
	 *
	 * **When to use**:
	 *
	 * - API receives HTTP request without `X-Correlation-Id` header (generate new)
	 * - Starting a new logical workflow (not triggered by existing message)
	 * - Testing with deterministic correlation IDs
	 *
	 * **Propagation Strategy**:
	 *
	 * 1. API extracts from HTTP header `X-Correlation-Id` or generates new
	 * 2. API adds to SubmitServiceCall command
	 * 3. Orchestration extracts from command, stores in aggregate
	 * 4. All subsequent events/commands carry same CorrelationId
	 *
	 * @example API generates correlation ID for new request
	 *
	 * ```typescript
	 * import * as Effect from 'effect/Effect'
	 * import * as Option from 'effect/Option'
	 * import { CorrelationId } from '@event-service-agent/schemas/shared'
	 *
	 * // Example: Extract from HTTP header or generate new
	 * const handleRequest = (headers: Record<string, string>) =>
	 * 	Effect.gen(function* () {
	 * 		const correlationId = headers['x-correlation-id']
	 * 			? yield* CorrelationId.decode(headers['x-correlation-id'])
	 * 			: yield* CorrelationId.makeUUID7()
	 *
	 * 		// Use correlationId in your workflow
	 * 		return correlationId
	 * 	})
	 *
	 * // Usage with missing header (generates new)
	 * const result1 = handleRequest({})
	 *
	 * // Usage with existing header (uses provided)
	 * const result2 = handleRequest({
	 * 	'x-correlation-id': '01234567-89ab-7cde-89ab-0123456789ab',
	 * })
	 * ```
	 *
	 * @example Workflow preserves correlation from aggregate
	 *
	 * ```typescript
	 * import * as Effect from 'effect/Effect'
	 * import * as Option from 'effect/Option'
	 * import { CorrelationId } from '@event-service-agent/schemas/shared'
	 * import type { MessageMetadata } from '@event-service-agent/platform/context'
	 *
	 * // Example: Propagate correlation through workflow
	 * const scheduleTimerWorkflow = (correlationId: Option.Option<CorrelationId.Type>) =>
	 * 	Effect.gen(function* () {
	 * 		// Provision metadata context for port operations
	 * 		const metadata: MessageMetadata.Type = {
	 * 			correlationId,
	 * 			causationId: Option.none(),
	 * 		}
	 *
	 * 		// Context would be consumed by port adapters
	 * 		return metadata
	 * 	})
	 *
	 * // Usage: Preserve correlation from domain aggregate
	 * const workflow = Effect.gen(function* () {
	 * 	const correlationId = yield* CorrelationId.makeUUID7()
	 * 	yield* scheduleTimerWorkflow(Option.some(correlationId))
	 * })
	 * ```
	 *
	 * @param time - Optional UTC timestamp for deterministic generation
	 *
	 * @returns Effect producing validated CorrelationId
	 * @throws ParseError - If generated UUID7 fails validation (extremely rare)
	 * @requires UUID7 - Service for UUID generation
	 */
	static readonly makeUUID7: (
		time?: DateTime.Utc
	) => Effect.Effect<CorrelationId.Type, ParseResult.ParseError, Service.UUID7> = (time) =>
		Service.UUID7.pipe(
			Effect.flatMap(({ randomUUIDv7 }) => randomUUIDv7(time)),
			/*
			 * Use make() instead of decode() — UUID7 service already validates.
			 * Avoids redundant validation for performance.
			 */
			Effect.map((uuid7: UUID7.Type): CorrelationId.Type => CorrelationId.make(uuid7))
		)

	/**
	 * Decode string to CorrelationId with validation
	 *
	 * Use for parsing HTTP headers, environment variables, or configuration.
	 *
	 * @param value - String to validate and brand
	 *
	 * @returns Effect with validated CorrelationId
	 * @throws ParseError - If value is not valid UUID7
	 */
	static readonly decode: (value: string) => Effect.Effect<CorrelationId.Type, ParseResult.ParseError> = (value) =>
		Schema.decode(CorrelationId)(value)

	/**
	 * Decode string to CorrelationId (Either variant)
	 *
	 * @param value - String to validate
	 *
	 * @returns Either with CorrelationId or ParseError
	 */
	static readonly decodeEither: (value: string) => Either.Either<CorrelationId.Type, ParseResult.ParseError> = (
		value
	) => Schema.decodeEither(CorrelationId)(value)
}

/**
 * Type aliases for CorrelationId
 *
 * Provides convenient access to the branded type.
 */
export declare namespace CorrelationId {
	/**
	 * The branded type: string & Brand<UUID7Brand> & Brand<CorrelationIdBrand>
	 */
	type Type = typeof CorrelationId.Type
}
