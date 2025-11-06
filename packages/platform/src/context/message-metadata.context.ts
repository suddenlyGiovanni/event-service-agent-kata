/**
 * @file Message Metadata Context
 * @module @event-service-agent/platform/context
 *
 * Effect Context for propagating message correlation and causation metadata
 * through port boundaries without polluting domain types.
 *
 * ## Purpose
 *
 * Enables implicit propagation of observability metadata (correlationId, causationId)
 * from workflows through ports to adapters, preserving domain purity while maintaining
 * distributed tracing capabilities.
 *
 * ## Usage Pattern
 *
 * ### In Workflows (Context Provisioning)
 * ```typescript
 * // Extract correlationId from aggregate
 * const correlationId = timer.correlationId
 *
 * // Wrap port call with context
 * yield* eventBus.publishDueTimeReached(event).pipe(
 *   Effect.provideService(MessageMetadata, {
 *     correlationId,
 *     causationId: Option.none()
 *   })
 * )
 * ```
 *
 * ### In Ports (Requirement Declaration)
 * ```typescript
 * class TimerEventBusPort extends Context.Tag('TimerEventBusPort')<
 *   TimerEventBusPort,
 *   {
 *     readonly publishDueTimeReached: (
 *       event: DueTimeReached
 *     ) => Effect.Effect<void, PublishError, MessageMetadata>
 *     //                                      ^^^^^^^^^^^^^^^^
 *     //                                      Requires context
 *   }
 * >() {}
 * ```
 *
 * ### In Adapters (Context Consumption)
 * ```typescript
 * publishDueTimeReached: (event) => Effect.gen(function* () {
 *   const metadata = yield* MessageMetadata
 *   //    ^^^^^^^^ Extract from context
 *
 *   const envelope = new MessageEnvelope({
 *     correlationId: metadata.correlationId,  // From context
 *     causationId: metadata.causationId,      // From context
 *     // ...
 *   })
 * })
 * ```
 *
 * ### In Tests (Test Data Provisioning)
 * ```typescript
 * it.effect('should propagate correlationId', () =>
 *   Effect.gen(function* () {
 *     const correlationId = yield* CorrelationId.makeUUID7()
 *
 *     yield* workflow().pipe(
 *       Effect.provideService(MessageMetadata, {
 *         correlationId: Option.some(correlationId),
 *         causationId: Option.none()
 *       })
 *     )
 *   })
 * )
 * ```
 *
 * ## Design Rationale
 *
 * - **Domain Purity**: Domain events remain pure data (no infrastructure concerns)
 * - **Type Safety**: Missing context causes compile error (via R parameter)
 * - **Effect-Idiomatic**: Uses standard Context.Tag pattern from Effect-TS
 * - **Testability**: Easy to mock/provision in tests via Effect.provideService
 * - **Scalability**: New metadata fields don't require changing all port signatures
 *
 * @see {@link https://github.com/suddenlyGiovanni/event-service-agent-kata/blob/main/docs/decisions/ADR-0013-correlation-propagation.md ADR-0013: CorrelationId Propagation Through Pure Domain Events}
 * @see {@link https://github.com/suddenlyGiovanni/event-service-agent-kata/blob/main/docs/plan/correlation-context-implementation.md PL-24: MessageMetadata Context Implementation Plan}
 */

import * as Context from 'effect/Context'
import type * as Option from 'effect/Option'

import type { CorrelationId, EnvelopeId } from '@event-service-agent/schemas/shared'

/**
 * Message Metadata Context
 *
 * Provides correlation and causation identifiers for message envelope construction.
 * Propagated implicitly through Effect's Context system (R parameter).
 *
 * @example
 * ```typescript
 * // Provision context in workflow
 * yield* publishEvent(event).pipe(
 *   Effect.provideService(MessageMetadata, {
 *     correlationId: Option.some(correlationId),
 *     causationId: Option.none()
 *   })
 * )
 *
 * // Extract in adapter
 * const metadata = yield* MessageMetadata
 * const envelope = new MessageEnvelope({
 *   correlationId: metadata.correlationId,
 *   // ...
 * })
 * ```
 */
export class MessageMetadata extends Context.Tag('MessageMetadata')<
	MessageMetadata,
	{
		/**
		 * Correlation identifier for distributed tracing
		 *
		 * Links causally-related messages across service boundaries.
		 * - **Some(id)**: Message is part of distributed workflow
		 * - **None**: Message originated without correlation context
		 *
		 * Typically extracted from:
		 * - Incoming HTTP request headers (`X-Correlation-Id`)
		 * - Domain aggregate state (`timer.correlationId`)
		 * - Parent message envelope (`envelope.correlationId`)
		 */
		readonly correlationId: Option.Option<CorrelationId.Type>

		/**
		 * Causation identifier (parent message envelope ID)
		 *
		 * Links child messages to immediate parent for causality chain reconstruction.
		 * - **Some(id)**: Message caused by specific parent message
		 * - **None**: Message is root cause (no parent)
		 *
		 * Typically extracted from:
		 * - Incoming message envelope (`envelope.id`)
		 * - Command that triggered event (`commandEnvelope.id`)
		 * - None for spontaneous events (timers, polling)
		 */
		readonly causationId: Option.Option<EnvelopeId.Type>
	}
>() {}

export declare namespace MessageMetadata {
	type Type = Context.Tag.Service<MessageMetadata>
}
