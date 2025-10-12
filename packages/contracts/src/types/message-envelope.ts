/**
 * Message Envelope
 *
 * Minimal envelope shared by publishers/consumers.
 * Based on docs/design/ports.md
 */

import type { Command } from '#/messages/commands.ts'
import type { Event } from '#/messages/events.ts'

import type { CorrelationId, EnvelopeId, TenantId } from './shared.ts'

/**
 * Message - Union of all commands and events in the system
 */
export type Message = Command | Event

/**
 * MessageType - All possible message type discriminators
 */
export type MessageType = Message['type']

/**
 * MessageEnvelope - Wraps all messages published to the broker
 *
 * @template T - The payload type (must be a Command or Event)
 */
export interface MessageEnvelope<T extends Message = Message> {
	/** Unique identifier for this envelope */
	readonly id: EnvelopeId

	/** Message type identifier (matches payload.type) */
	readonly type: T['type']

	/** Tenant identifier for multi-tenancy */
	readonly tenantId: TenantId

	/** Ordering key for per-aggregate ordering (e.g., serviceCallId) */
	readonly aggregateId?: string

	/** Producer timestamp in epoch milliseconds */
	readonly timestampMs: number

	/** Correlation ID for tracing across boundaries */
	readonly correlationId?: CorrelationId

	/** Causation ID linking this message to its cause */
	readonly causationId?: string

	/** The actual message payload */
	readonly payload: T
}
