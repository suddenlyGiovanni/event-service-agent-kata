/**
 * EventBusPort - Message broker abstraction
 *
 * Provides broker-agnostic publish/subscribe interface for command and event distribution across modules. The adapter
 * handles all broker-specific details (streams, consumers, subjects, partitions, etc.).
 *
 * Used by: [Orchestration], [Execution], [Timer], [API] (publish only)
 *
 * Design principles:
 *
 * - Broker-agnostic: works with NATS JetStream, Kafka, RabbitMQ, or in-memory
 * - Effect-based: all operations return Effect for composability
 * - At-least-once delivery: messages may be delivered multiple times
 * - Per-aggregate ordering: preserved via routing key (tenantId.serviceCallId)
 *
 * Based on {@link docs/design/ports.md} and ADR-0002
 */

import type { NonEmptyReadonlyArray } from 'effect/Array'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'

import type { MessageEnvelope } from '@event-service-agent/schemas/envelope'

import type { Topics } from '../routing/topics.ts'

/**
 * PublishError - Generic error when publishing messages fails
 *
 * Adapter maps broker-specific errors (connection failure, stream not found, subject not allowed, etc.) to this generic
 * error. Specific details are logged by the adapter for observability.
 */
export class PublishError extends Data.TaggedError('PublishError')<{ readonly cause: string }> {}

/**
 * SubscribeError - Generic error when subscribing or consuming messages fails
 *
 * Adapter maps broker-specific errors (consumer creation failure, stream not found, connection failure, etc.) to this
 * generic error. Specific details are logged by the adapter for observability.
 */
export class SubscribeError extends Data.TaggedError('SubscribeError')<{ readonly cause: string }> {}

/**
 * EventBusPort - Message broker port interface
 *
 * Responsibilities:
 *
 * - Publish messages to the broker with idempotency (via envelope.id)
 * - Subscribe to topics and process messages with a handler
 * - Handle errors generically (adapter logs details)
 *
 * Adapter responsibilities (hidden from domain):
 *
 * - Stream/topic creation and configuration
 * - Consumer creation and management (durable, pull-based, work-sharing)
 * - ACK/NAK handling (ack on success, nak on error)
 * - Retry policies and dead-letter queue (DLQ) routing
 * - Batch sizing and concurrency control
 * - Heartbeat monitoring and connection resilience
 * - Subject/topic mapping and routing
 * - Deduplication window configuration
 */
export interface EventBusPort {
	/**
	 * Publish messages to the event bus
	 *
	 * Messages are published to topics derived from the envelope (type, tenantId). Routing information (tenantId,
	 * aggregateId, correlationId) is extracted from each envelope - no separate context needed.
	 *
	 * The adapter handles:
	 *
	 * - Routing to appropriate subjects/topics/queues (using envelope.tenantId + envelope.aggregateId)
	 * - Deduplication via envelope.id (within broker's deduplication window)
	 * - Idempotent publish (safe to retry on transient failures)
	 * - Per-aggregate ordering (via tenantId + aggregateId routing key, e.g., tenant-123.order-456,
	 *   tenant-123.serviceCallId-789)
	 * - Tracing propagation (via envelope.correlationId if present)
	 *
	 * @example Publishing a message envelope
	 *
	 * ```typescript
	 * import * as DateTime from "effect/DateTime"
	 * import * as Effect from "effect/Effect"
	 * import * as Option from "effect/Option"
	 * import type { ParseError } from "effect/ParseResult"
	 *
	 * import { MessageEnvelope } from "@event-service-agent/schemas/envelope"
	 * import type * as Messages from "@event-service-agent/schemas/messages"
	 * import { type CorrelationId, EnvelopeId, type ServiceCallId, type TenantId } from "@event-service-agent/schemas/shared"
	 *
	 * import type { UUID7 } from "../uuid7.service.ts"
	 *
	 * declare const correlationId: CorrelationId.Type
	 * declare const tenantId: TenantId.Type
	 * declare const serviceCallId: ServiceCallId.Type
	 * declare const domainEvent: Messages.Orchestration.Events.ServiceCallScheduled.Type
	 *
	 * // Publishing a message envelope
	 * export const publishMessage: Effect.Effect<void, ParseError | PublishError, EventBusPort | UUID7> = Effect.gen(function* () {
	 *   const eventBus = yield* EventBusPort
	 *
	 *   const envelope: MessageEnvelope.Type = new MessageEnvelope({
	 *     aggregateId: Option.some(serviceCallId),
	 *     causationId: Option.none(),
	 *     correlationId: Option.some(correlationId),
	 *     id: yield* EnvelopeId.makeUUID7(),
	 *     payload: domainEvent,
	 *     tenantId: tenantId,
	 *     timestampMs: yield* DateTime.now,
	 *     type: domainEvent._tag,
	 *   })
	 *
	 *   yield* eventBus.publish([envelope])
	 * })
	 * ```
	 *
	 * @param envelopes - Array of message envelopes to publish (self-contained with all routing metadata)
	 *
	 * @returns Effect that succeeds when all messages are published
	 * @throws PublishError - When publishing fails (connection, stream errors, etc.)
	 */
	readonly publish: (envelopes: NonEmptyReadonlyArray<MessageEnvelope.Type>) => Effect.Effect<void, PublishError>

	/**
	 * Subscribe to topics and process messages
	 *
	 * Creates a durable consumer (or attaches to existing) that:
	 *
	 * - Pulls messages from specified topics
	 * - Processes each message with the handler Effect
	 * - ACKs message on handler success
	 * - NAKs message on handler error (triggers redelivery)
	 * - Routes to DLQ after max retries (configured in adapter)
	 *
	 * Topics are type-safe references from the centralized Topics configuration. Use Topics.Timer.Commands,
	 * Topics.Orchestration.Events, etc. for type safety.
	 *
	 * Adapter maps these logical topics to broker-specific routing:
	 *
	 * - NATS: subjects (e.g., 'svc.timer.commands')
	 * - Kafka: topics (e.g., 'timer-commands')
	 * - RabbitMQ: routing keys + exchanges
	 *
	 * Processing semantics:
	 *
	 * - Sequential (MVP): processes one message at a time (safe, simple)
	 * - Handler must be idempotent (messages may be redelivered)
	 * - Preserves per-aggregate order (via tenantId + aggregateId routing key, e.g., tenant-123.serviceCallId-789)
	 *
	 * Work-sharing (multiple instances):
	 *
	 * - Multiple instances with same consumer name share work automatically
	 * - Adapter creates/attaches to durable consumer for load balancing
	 * - Each message delivered to only one instance
	 *
	 * @example Subscribing to commands with idempotent handler
	 *
	 * ```typescript
	 * import * as Effect from "effect/Effect"
	 *
	 * import type { MessageEnvelope } from "@event-service-agent/schemas/envelope"
	 *
	 * import { Topics } from "../routing/topics.ts"
	 *
	 * declare const processCommand: (envelope: MessageEnvelope.Type) => Effect.Effect<void, Error>
	 *
	 * // Subscribe to commands with idempotent handler
	 * export const subscribeToCommands: Effect.Effect<void, SubscribeError | Error, EventBusPort> = Effect.gen(function* () {
	 *   const eventBus = yield* EventBusPort
	 *
	 *   yield* eventBus.subscribe([Topics.Timer.Commands], (envelope) =>
	 *     Effect.gen(function* () {
	 *       // Handler must be idempotent
	 *       yield* Effect.log(`Processing command: ${envelope.type}`)
	 *
	 *       // Process command (upsert is idempotent)
	 *       yield* processCommand(envelope)
	 *     }).pipe(
	 *       // Handler errors cause NAK → redelivery
	 *       Effect.catchAll((err) => Effect.logError(err)),
	 *     ),
	 *   )
	 * })
	 * ```
	 *
	 * @param topics - Array of type-safe topic references (from Topics namespace)
	 * @param handler - Effect to process each message (ack on success, nak on error)
	 *
	 * @returns Effect that runs indefinitely, processing messages
	 * @throws SubscribeError - When subscription fails (consumer creation, connection, etc.)
	 */
	readonly subscribe: <E, R>(
		topics: NonEmptyReadonlyArray<Topics.Type>,
		handler: (envelope: MessageEnvelope.Type) => Effect.Effect<void, E, R>,
	) => Effect.Effect<void, SubscribeError | E, R>
}

export const EventBusPort = Context.GenericTag<EventBusPort>('@event-service-agent/platform/EventBusPort')
