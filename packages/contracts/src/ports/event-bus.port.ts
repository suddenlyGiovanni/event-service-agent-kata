/**
 * EventBusPort - Message broker abstraction
 *
 * Provides broker-agnostic publish/subscribe interface for command and event
 * distribution across modules. The adapter handles all broker-specific details
 * (streams, consumers, subjects, partitions, etc.).
 *
 * Used by: [Orchestration], [Execution], [Timer], [API] (publish only)
 *
 * Design principles:
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

import type { Message } from '#/types/message-envelope.type.ts'
import type { RequestContext } from '#/types/shared.type.ts'

/**
 * PublishError - Generic error when publishing messages fails
 *
 * Adapter maps broker-specific errors (connection failure, stream not found,
 * subject not allowed, etc.) to this generic error. Specific details are
 * logged by the adapter for observability.
 */
export class PublishError extends Data.TaggedError('PublishError')<{
	readonly cause: string
}> {}

/**
 * SubscribeError - Generic error when subscribing or consuming messages fails
 *
 * Adapter maps broker-specific errors (consumer creation failure, stream not
 * found, connection failure, etc.) to this generic error. Specific details are
 * logged by the adapter for observability.
 */
export class SubscribeError extends Data.TaggedError('SubscribeError')<{
	readonly cause: string
}> {}

/**
 * EventBusPort - Message broker port interface
 *
 * Responsibilities:
 * - Publish messages to the broker with idempotency (via envelope.id)
 * - Subscribe to topics and process messages with a handler
 * - Handle errors generically (adapter logs details)
 *
 * Adapter responsibilities (hidden from domain):
 * - Stream/topic creation and configuration
 * - Consumer creation and management (durable, pull-based, work-sharing)
 * - ACK/NAK handling (ack on success, nak on error)
 * - Retry policies and dead-letter queue (DLQ) routing
 * - Batch sizing and concurrency control
 * - Heartbeat monitoring and connection resilience
 * - Subject/topic mapping and routing
 * - Deduplication window configuration
 *
 * @example
 * ```typescript
 * // Publishing events (Orchestration, Execution, Timer)
 * const publishEvents = Effect.gen(function* () {
 *   const bus = yield* EventBusPort
 *   yield* bus.publish([envelope1, envelope2], ctx)
 * })
 *
 * // Subscribing to commands (Timer)
 * const subscribeToCommands = Effect.gen(function* () {
 *   const bus = yield* EventBusPort
 *   yield* bus.subscribe(['timer.commands'], (envelope) =>
 *     Effect.gen(function* () {
 *       // Parse and handle command
 *       const cmd = yield* parseScheduleTimer(envelope.payload)
 *       yield* TimerRepository.upsert(cmd)
 *     })
 *   )
 * })
 * ```
 */
export interface EventBusPort {
	/**
	 * Publish messages to the event bus
	 *
	 * Messages are published to topics derived from the envelope (type, tenantId).
	 * The adapter handles:
	 * - Routing to appropriate subjects/topics/queues
	 * - Deduplication via envelope.id (within broker's deduplication window)
	 * - Idempotent publish (safe to retry on transient failures)
	 * - Per-aggregate ordering (via tenantId + aggregateId routing)
	 *
	 * @param envelopes - Array of message envelopes to publish
	 * @param ctx - Request context (tenantId, correlationId for tracing)
	 * @returns Effect that succeeds when all messages are published
	 * @throws PublishError - When publishing fails (connection, stream errors, etc.)
	 *
	 * @example
	 * ```typescript
	 * yield* bus.publish([
	 *   { id, type: 'ServiceCallScheduled', tenantId, payload: {...} }
	 * ], { tenantId, correlationId })
	 * ```
	 */
	readonly publish: (
		envelopes: NonEmptyReadonlyArray<Message.Envelope>,
		ctx: RequestContext,
	) => Effect.Effect<void, PublishError>

	/**
	 * Subscribe to topics and process messages
	 *
	 * Creates a durable consumer (or attaches to existing) that:
	 * - Pulls messages from specified topics
	 * - Processes each message with the handler Effect
	 * - ACKs message on handler success
	 * - NAKs message on handler error (triggers redelivery)
	 * - Routes to DLQ after max retries (configured in adapter)
	 *
	 * Topics are logical names (e.g., 'timer.commands', 'orchestration.events').
	 * Adapter maps these to broker-specific routing:
	 * - NATS: subjects (e.g., 'svc.timer.commands')
	 * - Kafka: topics (e.g., 'timer-commands')
	 * - RabbitMQ: routing keys + exchanges
	 *
	 * Processing semantics:
	 * - Sequential (MVP): processes one message at a time (safe, simple)
	 * - Handler must be idempotent (messages may be redelivered)
	 * - Preserves per-aggregate order (via tenantId.serviceCallId routing)
	 *
	 * Work-sharing (multiple instances):
	 * - Multiple instances with same consumer name share work automatically
	 * - Adapter creates/attaches to durable consumer for load balancing
	 * - Each message delivered to only one instance
	 *
	 * @param topics - Array of topic names to subscribe to (supports wildcards in NATS)
	 * @param handler - Effect to process each message (ack on success, nak on error)
	 * @returns Effect that runs indefinitely, processing messages
	 * @throws SubscribeError - When subscription fails (consumer creation, connection, etc.)
	 *
	 * @example
	 * ```typescript
	 * yield* bus.subscribe(['timer.commands'], (envelope) =>
	 *   Effect.gen(function* () {
	 *     // Handler must be idempotent
	 *     const cmd = yield* parseScheduleTimer(envelope.payload)
	 *     yield* TimerRepository.upsert(cmd) // Upsert is idempotent
	 *   }).pipe(
	 *     // Handler errors cause NAK → redelivery
	 *     Effect.catchAll((err) => Effect.logError(err))
	 *   )
	 * )
	 * ```
	 */
	readonly subscribe: <E>(
		topics: NonEmptyReadonlyArray<string>,
		handler: (envelope: Message.Envelope) => Effect.Effect<void, E>,
	) => Effect.Effect<void, SubscribeError | E>
}

/**
 * EventBusPort service tag
 *
 * Use this to access the EventBusPort from the Effect context.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const bus = yield* EventBusPort
 *   yield* bus.publish([envelope], ctx)
 * })
 * ```
 */
export const EventBusPort = Context.GenericTag<EventBusPort>('@event-service-agent/contracts/EventBusPort')
