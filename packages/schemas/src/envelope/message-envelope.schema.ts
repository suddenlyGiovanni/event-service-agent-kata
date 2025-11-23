/**
 * Message Envelope Schema
 *
 * Effect Schema for runtime validation of message envelopes. Provides:
 *
 * - JSON serialization/deserialization (parseJson/encodeJson)
 * - Envelope structure validation (id, type, tenantId, timestamps)
 * - Typed payload using discriminated union of all domain messages
 *
 * Based on docs/design/ports.md and ADR-0011. Migrated to schemas package per ADR-0012.
 */

import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'
import type * as SchemaAst from 'effect/SchemaAST'

import * as Messages from '../messages/index.ts'
import { CorrelationId, EnvelopeId, ServiceCallId, TenantId } from '../shared/index.ts'

/**
 * DomainMessage - Union of all domain messages (events + commands)
 *
 * This centralized union avoids circular dependencies by having all schemas in a single package. The envelope payload
 * has full Effect Schema type power: branded types, pattern matching, and single-phase decode.
 *
 * Uses actual Effect Schemas (not DTO shapes), preserving full type power. After decode, envelope.payload will have
 * branded types and pattern matching support.
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

/**
 * Type aliases for DomainMessage union
 *
 * Provides convenient access to the union type and its encoded representation.
 */
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

/**
 * MessageEnvelope — Transport wrapper for all domain messages
 *
 * Wraps commands and events with routing and correlation metadata for broker transport. Provides partition key,
 * correlation context, and envelope identity for tracing.
 *
 * @see docs/decisions/ADR-0013-correlation-propagation.md for correlation context design
 * @see docs/decisions/ADR-0010-identity.md for envelope ID generation
 */
export class MessageEnvelope extends Schema.Class<MessageEnvelope>('MessageEnvelope')(
	Schema.Struct({
		/**
		 * **Aggregate Identifier** — Per-aggregate message ordering key
		 *
		 * **Purpose**: Enables strict message ordering for a specific aggregate instance. When present, ensures all
		 * messages for the same aggregate (ServiceCall) are processed in the order they were published.
		 *
		 * **Semantics**:
		 *
		 * - **Present** (`Option.some(serviceCallId)`): Message belongs to a specific ServiceCall aggregate. Broker uses
		 *   `${tenantId}.${serviceCallId}` as partition key to guarantee ordering within that aggregate.
		 * - **Absent** (`Option.none()`): Message is autonomous (not tied to an aggregate) or doesn't require ordering
		 *   guarantees. Examples: system events, broadcasts.
		 *
		 * **Domain Model**: ServiceCall is the only aggregate in the MVP system. All domain events and commands that
		 * manipulate ServiceCall state should include this field for consistency and ordering.
		 *
		 * **Wire format**: optional/missing field (UUID v7 string when present) **Domain type**: `Option<ServiceCallId>`
		 * (branded UUID v7)
		 *
		 * @example
		 *
		 * ```typescript ignore
		 * // Command targeting specific ServiceCall (requires ordering)
		 * aggregateId: Option.some(ServiceCallId.make(serviceCallId))
		 *
		 * // System event (no aggregate, no ordering needed)
		 * aggregateId: Option.none()
		 * ```
		 *
		 * @see docs/design/messages.md — Per-aggregate ordering semantics
		 * @see ADR-0010 — ServiceCallId generation strategy
		 * @see ADR-0002 — Broker partitioning strategy
		 */
		aggregateId: Schema.optionalWith(ServiceCallId, {
			as: 'Option',
			exact: true,
		}),

		/**
		 * **Causation Identifier** — Links this message to its immediate cause
		 *
		 * **Purpose**: Establishes parent-child relationships in message chains for debugging, observability, and
		 * understanding system behavior. Forms a causal graph: Message A causes Message B causes Message C.
		 *
		 * **Semantics**:
		 *
		 * - **Present** (`Option.some(envelopeId)`): This message was created as a direct result of processing another
		 *   message. Points to the `EnvelopeId` of the causing message.
		 * - **Absent** (`Option.none()`): This message originates from external input (user request, timer, external system)
		 *   rather than from another message.
		 *
		 * **Use Cases**:
		 *
		 * - **Debugging**: Trace backwards through message chain to find root cause
		 * - **Observability**: Visualize message flow and dependencies
		 * - **Auditing**: Understand why a message was created
		 *
		 * **Difference from correlationId**:
		 *
		 * - `causationId`: Points to the **immediate parent** message (changes at each hop)
		 * - `correlationId`: Identifies the **entire request/conversation** (same across all messages)
		 *
		 * **Wire format**: optional/missing field (UUID v7 string when present) **Domain type**: `Option<EnvelopeId>`
		 * (branded UUID v7)
		 *
		 * @example
		 *
		 * ```typescript ignore
		 * // 1. User submits request → SubmitServiceCall command (no cause, external origin)
		 * const submitCmd = new MessageEnvelope({
		 * 	id: EnvelopeId.make('envelope-001'),
		 * 	causationId: Option.none(), // External trigger
		 * 	correlationId: Option.some(CorrelationId.make('request-xyz')),
		 * 	// ...
		 * })
		 *
		 * // 2. Orchestration processes command → publishes ScheduleTimer command
		 * const scheduleCmd = new MessageEnvelope({
		 * 	id: EnvelopeId.make('envelope-002'),
		 * 	causationId: Option.some(EnvelopeId.make('envelope-001')), // Caused by SubmitServiceCall
		 * 	correlationId: Option.some(CorrelationId.make('request-xyz')), // Same conversation
		 * 	// ...
		 * })
		 *
		 * // 3. Timer fires → publishes DueTimeReached event
		 * const timerEvent = new MessageEnvelope({
		 * 	id: EnvelopeId.make('envelope-003'),
		 * 	causationId: Option.some(EnvelopeId.make('envelope-002')), // Caused by ScheduleTimer
		 * 	correlationId: Option.some(CorrelationId.make('request-xyz')), // Same conversation
		 * 	// ...
		 * })
		 * ```
		 *
		 * **Current State**: MVP does not populate this field (always `Option.none()`). Type is specified for future
		 * observability improvements.
		 *
		 * @see docs/design/messages.md — Message semantics and identity
		 * @see ADR-0009 — Observability baseline (structured logging)
		 */
		causationId: Schema.optionalWith(EnvelopeId, {
			as: 'Option',
			exact: true,
		}),

		/**
		 * **Correlation Identifier** — Request/conversation trace ID
		 *
		 * **Purpose**: Links all messages (commands + events) that belong to the same logical request or business
		 * transaction. Enables distributed tracing across module boundaries and asynchronous processing.
		 *
		 * **Semantics**:
		 *
		 * - **Present** (`Option.some(correlationId)`): Message is part of a traced request flow. All related messages share
		 *   the same correlationId.
		 * - **Absent** (`Option.none()`): Message is autonomous (system-initiated, background job) with no user request
		 *   context.
		 *
		 * **Lifecycle**:
		 *
		 * 1. **Generated once**: API module creates correlationId when request enters system
		 * 2. **Propagated**: All downstream commands/events inherit the same correlationId
		 * 3. **Never changes**: Unlike causationId, correlationId remains constant across entire flow
		 *
		 * **Use Cases**:
		 *
		 * - **Distributed tracing**: Group all logs/events for a single user request
		 * - **Debugging**: Filter logs by correlationId to see complete request timeline
		 * - **SLO monitoring**: Track end-to-end latency from request to final outcome
		 * - **Auditing**: Link all state changes to originating request
		 *
		 * **Difference from causationId**:
		 *
		 * - `correlationId`: Identifies the **entire conversation** (same for all related messages)
		 * - `causationId`: Points to the **immediate parent** (different at each hop)
		 *
		 * **Wire format**: optional/missing field (UUID v7 string when present) **Domain type**: `Option<CorrelationId>`
		 * (branded UUID v7)
		 *
		 * @example
		 *
		 * ```typescript ignore
		 * // User submits ServiceCall → API generates correlationId
		 * const correlationId = CorrelationId.make('request-abc-123')
		 *
		 * // All messages in this flow share the same correlationId:
		 * SubmitServiceCall.correlationId = Option.some('request-abc-123')
		 * ScheduleTimer.correlationId = Option.some('request-abc-123')
		 * DueTimeReached.correlationId = Option.some('request-abc-123')
		 * StartExecution.correlationId = Option.some('request-abc-123')
		 * ExecutionSucceeded.correlationId = Option.some('request-abc-123')
		 * ServiceCallSucceeded.correlationId = Option.some('request-abc-123')
		 *
		 * // Log query: "Show me all events for request-abc-123"
		 * // Result: Complete timeline from submission to completion
		 * ```
		 *
		 * @see docs/design/messages.md — Message metadata conventions
		 * @see ADR-0009 — Observability baseline (correlation logging)
		 * @see ADR-0010 — Identity generation (correlationId generated at API entry)
		 */
		correlationId: Schema.optionalWith(CorrelationId, {
			as: 'Option',
			exact: true,
		}),

		/**
		 * **Envelope Identifier** — Unique message instance ID
		 *
		 * **Purpose**: Uniquely identifies this specific envelope/message instance for deduplication, acknowledgment
		 * tracking, and idempotent processing.
		 *
		 * **Semantics**:
		 *
		 * - **Always present** (required field)
		 * - **Generated once**: Created when publishing a message (never reused)
		 * - **UUID v7 format**: Time-ordered for natural sorting and debugging
		 *
		 * **Use Cases**:
		 *
		 * - **Deduplication**: Broker/consumer can detect and skip duplicate deliveries
		 * - **Causation tracking**: Other messages reference this ID via `causationId`
		 * - **Acknowledgment**: Track which messages have been processed
		 * - **Debugging**: Unique identifier for log correlation and message tracing
		 *
		 * **Generation**: Created by publisher just before sending message to broker. Uses UUID v7 for monotonic ordering
		 * properties (timestamp-based prefix).
		 *
		 * **Difference from other IDs**:
		 *
		 * - `id` (EnvelopeId): Identifies **this message instance** (unique per message)
		 * - `aggregateId` (ServiceCallId): Identifies **aggregate** (same for all messages about that ServiceCall)
		 * - `correlationId`: Identifies **request flow** (same for all messages in conversation)
		 * - `causationId`: References **parent message's EnvelopeId** (forms causal chain)
		 *
		 * **Wire format**: required field (UUID v7 string) **Domain type**: `EnvelopeId` (branded UUID v7, extends UUID7)
		 *
		 * @example
		 *
		 * ```typescript ignore
		 * // Generate unique envelope ID when publishing
		 * const envelopeId = yield* EnvelopeId.makeUUID7()
		 *
		 * const envelope = new MessageEnvelope({
		 * 	id: envelopeId, // e.g., "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0"
		 * 	// ... other fields
		 * })
		 *
		 * // Later, another message can reference this as its cause
		 * const childEnvelope = new MessageEnvelope({
		 * 	id: yield* EnvelopeId.makeUUID7(), // New unique ID
		 * 	causationId: Option.some(envelopeId), // Parent's ID
		 * 	// ...
		 * })
		 * ```
		 *
		 * @see ADR-0010 — Identity generation (EnvelopeId generated at publish time)
		 * @see ADR-0006 — Idempotency (envelope ID used for deduplication)
		 */
		id: EnvelopeId,

		/**
		 * The actual message payload - union of all domain messages (events + commands)
		 *
		 * Uses DomainMessage union which preserves full Effect Schema type power:
		 *
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
		 * Wire format: epoch milliseconds (number) Domain type: DateTime.Utc (immutable, rich API)
		 *
		 * Used for:
		 *
		 * - Event occurrence tracking
		 * - Distributed tracing
		 * - Message ordering hints
		 * - Observability/log correlation
		 */
		timestampMs: Schema.DateTimeUtcFromNumber,

		/**
		 * Message type discriminator (matches payload._tag)
		 *
		 * Constrained to valid message tags for type safety. This ensures only known message types can be in envelopes.
		 *
		 * **Invariant**: Must match `payload._tag` (enforced by schema filter)
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
	}).pipe(
		/**
		 * **Cross-Field Validation Filter**
		 *
		 * Enforces the invariant that `type` must match `payload._tag`. This prevents mismatched envelopes where the
		 * envelope type doesn't correspond to the actual payload type.
		 *
		 * **When This Runs**:
		 *
		 * - During construction: `new MessageEnvelope({ ... })`
		 * - During decoding: `MessageEnvelope.decodeJson(jsonString)`
		 * - During encoding: `MessageEnvelope.encodeJson(envelope)`
		 *
		 * **Error Example**:
		 *
		 * ```txt
		 * ParseError: MessageEnvelope
		 * └─ Predicate refinement failure
		 *    └─ type must match payload._tag: expected "ScheduleTimer", got "DueTimeReached"
		 * ```
		 *
		 * @see https://effect.website/docs/schema/classes/#defining-classes-with-filters
		 */
		Schema.filter(
			({ type, payload }) =>
				type === payload._tag || `type must match payload._tag: expected "${payload._tag}", got "${type}"`,
		),
	),
) {
	/**
	 * Decode a JSON string into a validated MessageEnvelope with typed payload.
	 *
	 * Performs single-phase decoding: JSON.parse + Schema validation + payload discrimination. The resulting
	 * envelope.payload is a discriminated union typed by `_tag`.
	 *
	 * **Decoded Types**:
	 *
	 * - Optional fields become `Option<T>` (`Option.none()` for missing, `Option.some(value)` for present)
	 * - `timestampMs` becomes `DateTime.Utc` (from epoch milliseconds)
	 * - Branded types validated (TenantId, ServiceCallId, EnvelopeId, etc.)
	 *
	 * **Error Handling**: Returns `ParseResult.ParseError` in error channel if:
	 *
	 * - JSON parsing fails (invalid JSON syntax)
	 * - Envelope structure validation fails (missing/invalid fields)
	 * - Payload doesn't match any domain message union member
	 * - Branded type validation fails (invalid UUID format, etc.)
	 *
	 * @example
	 *
	 * ```typescript ignore
	 * import * as Effect from 'effect/Effect'
	 *
	 * // Decode JSON string and access typed payload
	 * export const program = Effect.gen(function* () {
	 * 	// JSON from wire (e.g., NATS message)
	 * 	const jsonString = `{
	 * 		"id": "018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0",
	 * 		"type": "DueTimeReached",
	 * 		"tenantId": "tenant-123",
	 * 		"timestampMs": 1700000000000,
	 * 		"payload": {
	 * 			"_tag": "DueTimeReached",
	 * 			"tenantId": "tenant-123",
	 * 			"serviceCallId": "018f6b8a-1111-7b32-8c6d-111111111111"
	 * 		}
	 * 	}`
	 *
	 * 	// Decode to validated envelope (auto-imported: MessageEnvelope)
	 * 	const envelope = yield* MessageEnvelope.decodeJson(jsonString)
	 *
	 * 	// Type-safe access to payload using _tag
	 * 	if (envelope.payload._tag === 'DueTimeReached') {
	 * 		// TypeScript narrows payload to DueTimeReached type
	 * 		return {
	 * 			tenantId: envelope.payload.tenantId,
	 * 			serviceCallId: envelope.payload.serviceCallId,
	 * 		}
	 * 	}
	 *
	 * 	return null
	 * })
	 * ```
	 *
	 * @param jsonString - JSON string from NATS/wire (e.g., `'{"id":"...","type":"DueTimeReached",...}'`)
	 * @param options - Optional parse options (errors: "first" | "all", exact, etc.)
	 *
	 * @returns Effect that succeeds with validated envelope or fails with ParseError
	 * @see ADR-0011 for envelope schema design rationale
	 * @see ADR-0012 for package structure (schemas package)
	 */
	static readonly decodeJson: (
		jsonString: string,
		options?: SchemaAst.ParseOptions,
	) => Effect.Effect<MessageEnvelope.Type, ParseResult.ParseError> = Schema.decode(Schema.parseJson(MessageEnvelope))

	/**
	 * Encode a MessageEnvelope to a JSON string for wire transmission.
	 *
	 * Performs two-phase encoding:
	 *
	 * 1. Schema.encode: Type → Encoded (unbrands types: TenantId → string, etc.)
	 * 2. JSON.stringify: Encoded → JSON string
	 *
	 * **Error Handling**: Returns `ParseResult.ParseError` in error channel if:
	 *
	 * - Envelope validation fails (e.g., invalid branded types)
	 * - Encoding transformation fails
	 *
	 * Note: JSON.stringify is assumed infallible for valid Encoded types.
	 *
	 * @example
	 *
	 * ```typescript ignore
	 * import * as DateTime from 'effect/DateTime'
	 * import * as Effect from 'effect/Effect'
	 * import * as Option from 'effect/Option'
	 *
	 * // Construct and encode MessageEnvelope to JSON (auto-imported types)
	 * const program = Effect.gen(function* () {
	 * 	// Create a DueTimeReached event
	 * 	const dueTimeReachedEvent = new DueTimeReached({
	 * 		serviceCallId: ServiceCallId.make('018f6b8a-1111-7b32-8c6d-111111111111'),
	 * 		tenantId: TenantId.make('tenant-123'),
	 * 		reachedAt: DateTime.unsafeMake(1700000000000),
	 * 	})
	 *
	 * 	// Construct envelope with metadata
	 * 	const envelope = new MessageEnvelope({
	 * 		aggregateId: Option.some(ServiceCallId.make('018f6b8a-1111-7b32-8c6d-111111111111')),
	 * 		causationId: Option.none(),
	 * 		correlationId: Option.some(CorrelationId.make('request-xyz')),
	 * 		id: EnvelopeId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
	 * 		payload: dueTimeReachedEvent,
	 * 		tenantId: TenantId.make('tenant-123'),
	 * 		timestampMs: DateTime.unsafeMake(1700000000000),
	 * 		type: DueTimeReached.Tag,
	 * 	})
	 *
	 * 	// Encode to JSON string for wire transmission
	 * 	const jsonString = yield* MessageEnvelope.encodeJson(envelope)
	 * 	return jsonString
	 * })
	 * ```
	 *
	 * @param envelope - Validated MessageEnvelope instance with typed payload
	 * @param options - Optional parse options for encoding phase
	 *
	 * @returns Effect that succeeds with JSON string or fails with ParseError
	 * @see ADR-0011 for envelope schema design rationale
	 * @see ADR-0012 for package structure (schemas package)
	 */
	static readonly encodeJson = (
		envelope: MessageEnvelope.Type,
		options?: SchemaAst.ParseOptions,
	): Effect.Effect<string, ParseResult.ParseError, never> =>
		pipe(envelope, Schema.encode(MessageEnvelope, options), Effect.map(JSON.stringify))

	/**
	 * Creates a matcher for the envelope's payload discriminated union.
	 *
	 * This method provides ergonomic access to Effect's pattern matching API for the envelope payload. It allows partial
	 * matching on specific message tags without requiring exhaustive handlers.
	 *
	 * **Why This Helper?**
	 *
	 * - Eliminates boilerplate: `Match.value(envelope.payload)` → `MessageEnvelope.matchPayload(envelope)`
	 * - Improves discoverability: developers see matcher as part of schema API
	 * - Enables fluent composition with all Match operators (tag, when, not, orElse, exhaustive)
	 *
	 * **Pattern Matching Flow**:
	 *
	 * 1. Create matcher from envelope: `matchPayload(envelope)`
	 * 2. Chain handlers: `.pipe(Match.tag(...), Match.tag(...), ...)`
	 * 3. Finalize: `.pipe(..., Match.orElse(...))` or `Match.exhaustive`
	 *
	 * @example
	 *
	 * ```typescript ignore
	 * import * as Match from 'effect/Match'
	 *
	 * // Assume we have a validated envelope
	 * declare const envelope: MessageEnvelope.Type
	 *
	 * // Partial matching - only handle specific tags (auto-imported: DueTimeReached)
	 * export const result = MessageEnvelope.matchPayload(envelope).pipe(
	 * 	Match.tag(DueTimeReached.Tag, (payload) => ({
	 * 		type: 'timer-handled' as const,
	 * 		tenantId: payload.tenantId,
	 * 		serviceCallId: payload.serviceCallId,
	 * 	})),
	 * 	Match.orElse(() => ({ type: 'other-message' as const })),
	 * )
	 * ```
	 *
	 * @example
	 *
	 * ```typescript ignore
	 * import * as Match from 'effect/Match'
	 *
	 * // Assume we have a validated envelope
	 * declare const envelope: MessageEnvelope.Type
	 *
	 * // Exhaustive matching - TypeScript enforces all tags handled (auto-imported types)
	 * export const result = MessageEnvelope.matchPayload(envelope).pipe(
	 * 	Match.tag(DueTimeReached.Tag, () => 'timer'),
	 * 	Match.tag(ServiceCallScheduled.Tag, () => 'scheduled'),
	 * 	Match.tag(ServiceCallSucceeded.Tag, () => 'succeeded'),
	 * 	Match.orElse(() => 'other'), // Or use Match.exhaustive for compile-time safety
	 * )
	 * ```
	 *
	 * @param envelope - Validated MessageEnvelope with typed payload
	 *
	 * @returns Value matcher for the payload discriminated union
	 * @see https://effect.website/docs/data-types/match for Match API documentation
	 * @see ADR-0011 for envelope schema design
	 */
	static readonly matchPayload: <T extends MessageEnvelope.Type>(
		envelope: T,
	) => Match.Matcher<T['payload'], Match.Types.Without<never>, T['payload'], never, T['payload']> = (envelope) =>
		Match.value(envelope.payload)
}

/**
 * Type aliases for MessageEnvelope
 *
 * Provides convenient access to validated and encoded envelope types.
 */
export declare namespace MessageEnvelope {
	/**
	 * Type - Validated envelope with typed payload
	 */
	type Type = Schema.Schema.Type<typeof MessageEnvelope>

	/**
	 * Encoded - DTO envelope (unbranded types, JSON-serializable)
	 */
	type Dto = Schema.Schema.Encoded<typeof MessageEnvelope>
}
