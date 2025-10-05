/**
 * Shared domain types
 *
 * Foundational branded types and context structures used across the system.
 * Based on docs/design/ports.md
 */

import * as Brand from 'effect/Brand'

/**
 * TenantId - Identifies the tenant for multi-tenancy
 */
export type TenantId = string & Brand.Brand<'TenantId'>
export const TenantId = Brand.nominal<TenantId>()

/**
 * CorrelationId - Traces a request across module boundaries
 */
export type CorrelationId = string & Brand.Brand<'CorrelationId'>
export const CorrelationId = Brand.nominal<CorrelationId>()

/**
 * EnvelopeId - Unique identifier for message envelopes
 */
export type EnvelopeId = string & Brand.Brand<'EnvelopeId'>
export const EnvelopeId = Brand.nominal<EnvelopeId>()

/**
 * ServiceCallId - Unique identifier for a service call (aggregate root)
 */
export type ServiceCallId = string & Brand.Brand<'ServiceCallId'>
export const ServiceCallId = Brand.nominal<ServiceCallId>()

/**
 * Iso8601DateTime - ISO8601 formatted datetime string (e.g., "2025-10-05T12:00:00Z")
 */
export type Iso8601DateTime = string & Brand.Brand<'Iso8601DateTime'>
export const Iso8601DateTime = Brand.nominal<Iso8601DateTime>()

/**
 * RequestContext - Common context passed through port operations
 */
export interface RequestContext {
	readonly tenantId: TenantId
	readonly correlationId: CorrelationId
}
