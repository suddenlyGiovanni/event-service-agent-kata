/**
 * Message Envelope Schema
 *
 * Effect Schema for runtime validation of message envelopes.
 * Provides:
 * - JSON serialization/deserialization (parseJson/encodeJson)
 * - Envelope structure validation (id, type, tenantId, timestamps)
 * - Typed payload using DomainMessage union
 *
 * Based on docs/design/ports.md and ADR-0011.
 * Migrated to schemas package per ADR-0012.
 */

import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'
import type * as SchemaAst from 'effect/SchemaAST'

import { CorrelationId, EnvelopeId, TenantId } from '../shared/index.ts'
import { DomainMessage } from './domain-message.schema.ts'

export class MessageEnvelopeSchema extends Schema.Class<MessageEnvelopeSchema>('MessageEnvelope')({
	/** Ordering key for per-aggregate ordering (e.g., serviceCallId) */
	aggregateId: Schema.optional(Schema.String),

	/** Causation ID linking this message to its cause (optional) */
	causationId: Schema.optional(Schema.String),

	/** Correlation ID for distributed tracing (optional) */
	correlationId: Schema.optional(CorrelationId),

	/** Unique identifier for this envelope (UUID v7) */
	id: EnvelopeId,

	/** The actual message payload - union of all domain messages */
	payload: DomainMessage,

	/** Tenant identifier for multi-tenancy and routing */
	tenantId: TenantId,

	/** Producer timestamp in epoch milliseconds */
	timestampMs: Schema.Number,

	/** Message type discriminator (matches payload._tag) */
	type: Schema.String, // TODO: derive from payload._tag
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
	 * - Payload doesn't match any DomainMessage union member
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
	) => Effect.Effect<MessageEnvelopeSchema, ParseResult.ParseError> = Schema.decode(
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
		envelope: MessageEnvelopeSchema,
		options?: SchemaAst.ParseOptions,
	): Effect.Effect<string, ParseResult.ParseError, never> =>
		pipe(envelope, Schema.encode(MessageEnvelopeSchema, options), Effect.map(JSON.stringify))
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
