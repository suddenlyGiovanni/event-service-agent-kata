/**
 * Message Envelope Schema
 *
 * Effect Schema for runtime validation of message envelopes.
 * Provides:
 * - JSON serialization/deserialization (parseJson/encodeJson)
 * - Envelope structure validation (id, type, tenantId, timestamps)
 * - Typed payload using discriminated union of all domain messages
 *
 * Based on docs/design/ports.md and ADR-0011.
 * Migrated to schemas package per ADR-0012.
 */

import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'
import type * as SchemaAst from 'effect/SchemaAST'

import * as Messages from '../messages/index.ts'
import { CorrelationId, EnvelopeId, TenantId } from '../shared/index.ts'

/**
 * DomainMessage - Union of all domain messages (events + commands)
 *
 * This centralized union avoids circular dependencies by having all schemas
 * in a single package. The envelope payload has full Effect Schema type power:
 * branded types, pattern matching, and single-phase decode.
 *
 * Uses actual Effect Schemas (not DTO shapes), preserving full type power.
 * After decode, envelope.payload will have branded types and pattern matching support.
 *
 * @see ADR-0012 for rationale
 */
export const DomainMessage = Schema.Union(
	Messages.Timer.Events.Events,
	Messages.Orchestration.Commands.Commands,
	Messages.Orchestration.Events.Events,
	Messages.Execution.Events.Events,
	Messages.Api.Commands.Commands,
)

export declare namespace DomainMessage {
	/**
	 * Type - Union of all domain message types
	 */
	type Type = Schema.Schema.Type<typeof DomainMessage>

	/**
	 * Encoded - Union of all domain message DTOs
	 */
	type Encoded = Schema.Schema.Encoded<typeof DomainMessage>

	/**
	 * Tag - Union of all message tag literals
	 */
	type Tag = DomainMessage.Type['_tag']
}

export class MessageEnvelopeSchema extends Schema.Class<MessageEnvelopeSchema>('MessageEnvelope')({
	/** Ordering key for per-aggregate ordering (e.g., serviceCallId) */
	aggregateId: Schema.optionalWith(Schema.String, { as: 'Option', exact: true }),

	/** Causation ID linking this message to its cause (optional) */
	causationId: Schema.optionalWith(Schema.String, { as: 'Option', exact: true }),

	/** Correlation ID for distributed tracing (optional) */
	correlationId: Schema.optionalWith(CorrelationId, { as: 'Option', exact: true }),

	/** Unique identifier for this envelope (UUID v7) */
	id: EnvelopeId,

	/**
	 * The actual message payload - union of all domain messages (events + commands)
	 *
	 * Uses DomainMessage union which preserves full Effect Schema type power:
	 * - Branded types (TenantId, ServiceCallId, etc.)
	 * - Pattern matching via _tag discriminator
	 * - Single-phase decode from JSON → typed message
	 */
	payload: DomainMessage,

	/** Tenant identifier for multi-tenancy and routing */
	tenantId: TenantId,

	/**
	 * Producer timestamp (transformed: number ↔ DateTime.Utc)
	 *
	 * Wire format: epoch milliseconds (number)
	 * Domain type: DateTime.Utc (immutable, rich API)
	 *
	 * Used for:
	 * - Event occurrence tracking
	 * - Distributed tracing
	 * - Message ordering hints
	 * - Observability/log correlation
	 */
	timestampMs: Schema.DateTimeUtcFromNumber,

	/**
	 * Message type discriminator (matches payload._tag)
	 *
	 * Constrained to valid message tags for type safety.
	 * This ensures only known message types can be in envelopes.
	 */
	type: Schema.Literal(
		// Timer Events
		Messages.Timer.Events.DueTimeReached.Tag,

		// Orchestration Commands
		Messages.Orchestration.Commands.ScheduleTimer.Tag,
		Messages.Orchestration.Commands.StartExecution.Tag,

		// Orchestration Events
		Messages.Orchestration.Events.ServiceCallSubmitted.Tag,
		Messages.Orchestration.Events.ServiceCallScheduled.Tag,
		Messages.Orchestration.Events.ServiceCallRunning.Tag,
		Messages.Orchestration.Events.ServiceCallSucceeded.Tag,
		Messages.Orchestration.Events.ServiceCallFailed.Tag,

		// Execution Events
		Messages.Execution.Events.ExecutionStarted.Tag,
		Messages.Execution.Events.ExecutionSucceeded.Tag,
		Messages.Execution.Events.ExecutionFailed.Tag,

		// API Commands
		Messages.Api.Commands.SubmitServiceCall.Tag,
	),
}) {
	/**
	 * Decode a JSON string into a validated MessageEnvelope with typed payload.
	 *
	 * Performs single-phase decoding: JSON.parse + Schema validation + payload discrimination.
	 * The resulting envelope.payload is a discriminated union typed by `_tag`.
	 *
	 * **Error Handling**: Returns `ParseResult.ParseError` in error channel if:
	 * - JSON parsing fails (invalid JSON syntax)
	 * - Envelope structure validation fails (missing/invalid fields)
	 * - Payload doesn't match any domain message union member
	 * - Branded type validation fails (invalid UUID format, etc.)
	 *
	 * @param jsonString - JSON string from NATS/wire (e.g., `'{"id":"...","type":"DueTimeReached",...}'`)
	 * @param options - Optional parse options (errors: "first" | "all", exact, etc.)
	 * @returns Effect that succeeds with validated envelope or fails with ParseError
	 *
	 * @example
	 * ```typescript
	 * // In workflow/adapter
	 * const program = Effect.gen(function* () {
	 *   const envelope = yield* MessageEnvelopeSchema.decodeJson(jsonFromNats)
	 *
	 *   // Type-safe pattern matching on payload
	 *   if (envelope.payload._tag === 'DueTimeReached') {
	 *     yield* handleDueTimeReached(envelope.payload)
	 *   }
	 * })
	 * ```
	 *
	 * @see ADR-0011 for envelope schema design rationale
	 * @see ADR-0012 for package structure (schemas package)
	 */
	static readonly decodeJson: (
		jsonString: string,
		options?: SchemaAst.ParseOptions,
	) => Effect.Effect<MessageEnvelopeSchema.Type, ParseResult.ParseError> = Schema.decode(
		Schema.parseJson(MessageEnvelopeSchema),
	)

	/**
	 * Encode a MessageEnvelope to a JSON string for wire transmission.
	 *
	 * Performs two-phase encoding:
	 * 1. Schema.encode: Type → Encoded (unbrands types: TenantId → string, etc.)
	 * 2. JSON.stringify: Encoded → JSON string
	 *
	 * **Error Handling**: Returns `ParseResult.ParseError` in error channel if:
	 * - Envelope validation fails (e.g., invalid branded types)
	 * - Encoding transformation fails
	 *
	 * Note: JSON.stringify is assumed infallible for valid Encoded types.
	 *
	 * @param envelope - Validated MessageEnvelope instance with typed payload
	 * @param options - Optional parse options for encoding phase
	 * @returns Effect that succeeds with JSON string or fails with ParseError
	 *
	 * @example
	 * ```typescript
	 * // In event bus adapter
	 * const program = Effect.gen(function* () {
	 *   const envelope = new MessageEnvelopeSchema({
	 *     id: envelopeId,
	 *     type: 'DueTimeReached',
	 *     tenantId,
	 *     timestampMs: Date.now(),
	 *     payload: dueTimeReachedDto,
	 *   })
	 *
	 *   const jsonString = yield* MessageEnvelopeSchema.encodeJson(envelope)
	 *   yield* natsClient.publish(subject, jsonString)
	 * })
	 * ```
	 *
	 * @see ADR-0011 for envelope schema design rationale
	 * @see ADR-0012 for package structure (schemas package)
	 */
	static readonly encodeJson = (
		envelope: MessageEnvelopeSchema.Type,
		options?: SchemaAst.ParseOptions,
	): Effect.Effect<string, ParseResult.ParseError, never> =>
		pipe(envelope, Schema.encode(MessageEnvelopeSchema, options), Effect.map(JSON.stringify))

	/**
	 * Creates a matcher for the envelope's payload discriminated union.
	 *
	 * This method provides ergonomic access to Effect's pattern matching API for the
	 * envelope payload. It allows partial matching on specific message tags without
	 * requiring exhaustive handlers.
	 *
	 * **Why This Helper?**
	 * - Eliminates boilerplate: `Match.value(envelope.payload)` → `MessageEnvelopeSchema.matchPayload(envelope)`
	 * - Improves discoverability: developers see matcher as part of schema API
	 * - Enables fluent composition with all Match operators (tag, when, not, orElse, exhaustive)
	 *
	 * **Pattern Matching Flow**:
	 * 1. Create matcher from envelope: `matchPayload(envelope)`
	 * 2. Chain handlers: `.pipe(Match.tag(...), Match.tag(...), ...)`
	 * 3. Finalize: `.pipe(..., Match.orElse(...))` or `Match.exhaustive`
	 *
	 * @param envelope - Validated MessageEnvelope with typed payload
	 * @returns Value matcher for the payload discriminated union
	 *
	 * @example
	 * ```typescript
	 * import { Tag } from '@event-service-agent/schemas/messages'
	 *
	 * // Test: Partial matching (only care about specific tags)
	 * const result = MessageEnvelopeSchema.matchPayload(envelope).pipe(
	 *   Match.tag(Tag.Timer.Events.DueTimeReached, (payload) => {
	 *     expect(payload.tenantId).toBe(expectedTenantId)
	 *     expect(payload.serviceCallId).toBe(expectedServiceCallId)
	 *     return 'timer-handled'
	 *   }),
	 *   Match.orElse(() => 'other-message')
	 * )
	 * ```
	 *
	 * @example
	 * ```typescript
	 * import { Tag } from '@event-service-agent/schemas/messages'
	 *
	 * // Workflow: Exhaustive matching (handle all cases)
	 * const result = MessageEnvelopeSchema.matchPayload(envelope).pipe(
	 *   Match.tag(Tag.Timer.Events.DueTimeReached, handleTimer),
	 *   Match.tag(Tag.Orchestration.Events.ServiceCallScheduled, handleSchedule),
	 *   Match.tag(Tag.Orchestration.Events.ServiceCallSucceeded, handleCompletion),
	 *   Match.exhaustive // TypeScript error if any tag is missing
	 * )
	 * ```
	 *
	 * @see https://effect.website/docs/data-types/match for Match API documentation
	 * @see ADR-0011 for envelope schema design
	 */
	static readonly matchPayload: <T extends MessageEnvelopeSchema.Type>(
		envelope: T,
	) => Match.Matcher<T['payload'], Match.Types.Without<never>, T['payload'], never, T['payload']> = envelope =>
		Match.value(envelope.payload)
}

export declare namespace MessageEnvelopeSchema {
	/**
	 * Type - Validated envelope with typed payload
	 */
	type Type = Schema.Schema.Type<typeof MessageEnvelopeSchema>

	/**
	 * Encoded - DTO envelope (unbranded types, JSON-serializable)
	 */
	type Dto = Schema.Schema.Encoded<typeof MessageEnvelopeSchema>
}
