/**
 * Message Envelope
 *
 * Minimal envelope shared by publishers/consumers.
 * Based on docs/design/ports.md
 */

import type { Messages } from '../messages/messages.ts'
import type { CorrelationId, EnvelopeId, TenantId } from './shared.type.ts'

export declare namespace Message {
	/**
	 * Message - Union of all commands and events in the system
	 */
	type Message = Messages

	/**
	 * Type - All possible message type discriminators
	 */
	type Type = Message['type']

	/**
	 * Envelope - Wraps all messages published to the broker
	 *
	 * @template M - The payload type (must be a Command or Event)
	 */
	interface Envelope<M extends Message = Message> {
		/** Unique identifier for this envelope */
		readonly id: EnvelopeId.Type

		/** Message type identifier (matches payload.type) */
		readonly type: M['type']

		/** Tenant identifier for multi-tenancy */
		readonly tenantId: TenantId.Type

		/** Ordering key for per-aggregate ordering (e.g., serviceCallId) */
		readonly aggregateId?: string

		/** Producer timestamp in epoch milliseconds */
		readonly timestampMs: number

		/** Correlation ID for tracing across boundaries */
		readonly correlationId?: CorrelationId.Type

		/** Causation ID linking this message to its cause */
		readonly causationId?: string

		/** The actual message payload */
		readonly payload: M
	}
}
