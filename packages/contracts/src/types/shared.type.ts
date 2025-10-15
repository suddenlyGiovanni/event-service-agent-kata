/**
 * Shared domain types
 *
 * Foundational branded types and context structures used across the system.
 * Based on docs/design/ports.md and ADR-0010 (identity generation strategy).
 */

import type * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 } from './uuid7.type.ts'

const TenantIdBrand: unique symbol = Symbol.for('@event-service-agent/contracts/types/TenantId')
/**
 * TenantId - Identifies the tenant for multi-tenancy
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<TenantIdBrand>
 */
export class TenantId extends UUID7.pipe(Schema.brand(TenantIdBrand)) {
	static readonly decode: (value: string) => Effect.Effect<TenantId.Type, ParseResult.ParseError> = value =>
		Schema.decode(TenantId)(value)

	static readonly decodeEither: (value: string) => Either.Either<TenantId.Type, ParseResult.ParseError> = value =>
		Schema.decodeEither(TenantId)(value)
}

export declare namespace TenantId {
	/**
	 * The branded type: string & Brand<UUID7Brand> & Brand<TenantIdBrand>
	 */
	type Type = typeof TenantId.Type
}

const CorrelationIdBrand: unique symbol = Symbol.for('@event-service-agent/contracts/types/CorrelationId')
/**
 * CorrelationId - Traces a request across module boundaries
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<CorrelationIdBrand>
 */
export class CorrelationId extends UUID7.pipe(Schema.brand(CorrelationIdBrand)) {
	static readonly decode: (value: string) => Effect.Effect<CorrelationId.Type, ParseResult.ParseError> = value =>
		Schema.decode(CorrelationId)(value)

	static readonly decodeEither: (value: string) => Either.Either<CorrelationId.Type, ParseResult.ParseError> = value =>
		Schema.decodeEither(CorrelationId)(value)
}

export declare namespace CorrelationId {
	/**
	 * The branded type: string & Brand<UUID7Brand> & Brand<CorrelationIdBrand>
	 */
	type Type = typeof CorrelationId.Type
}

const EnvelopeIdBrand: unique symbol = Symbol.for('@event-service-agent/contracts/types/EnvelopeId')
/**
 * EnvelopeId - Unique identifier for message envelopes
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<EnvelopeIdBrand>
 */
export class EnvelopeId extends UUID7.pipe(Schema.brand(EnvelopeIdBrand)) {
	static readonly decode: (value: string) => Effect.Effect<EnvelopeId.Type, ParseResult.ParseError> = value =>
		Schema.decode(EnvelopeId)(value)

	static readonly decodeEither: (value: string) => Either.Either<EnvelopeId.Type, ParseResult.ParseError> = value =>
		Schema.decodeEither(EnvelopeId)(value)
}

export declare namespace EnvelopeId {
	/**
	 * The branded type: string & Brand<UUID7Brand> & Brand<EnvelopeIdBrand>
	 */
	type Type = typeof EnvelopeId.Type
}

const ServiceCallIdBrand: unique symbol = Symbol.for('@event-service-agent/contracts/types/ServiceCallId')
/**
 * ServiceCallId - Unique identifier for a service call (aggregate root)
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<ServiceCallIdBrand>
 */
export class ServiceCallId extends UUID7.pipe(Schema.brand(ServiceCallIdBrand)) {
	static readonly decode: (value: string) => Effect.Effect<ServiceCallId.Type, ParseResult.ParseError> = value =>
		Schema.decode(ServiceCallId)(value)

	static readonly decodeEither: (value: string) => Either.Either<ServiceCallId.Type, ParseResult.ParseError> = value =>
		Schema.decodeEither(ServiceCallId)(value)
}

export declare namespace ServiceCallId {
	/**
	 * The branded type: string & Brand<UUID7Brand> & Brand<ServiceCallIdBrand>
	 */
	type Type = typeof ServiceCallId.Type
}

/**
 * Iso8601DateTime - ISO8601 formatted datetime string
 *
 * Examples: "2025-10-05T12:00:00Z", "2025-10-05T12:00:00.123Z"
 *
 * Pattern validates RFC3339 / ISO8601 format with:
 * - Date: YYYY-MM-DD
 * - Time separator: T
 * - Time: HH:MM:SS with optional milliseconds
 * - Timezone: Z or ±HH:MM
 */
export class Iso8601DateTime extends Schema.String.pipe(
	Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/, {
		description: 'ISO8601 formatted datetime string',
		message: () =>
			'Invalid ISO8601 datetime format. Expected: YYYY-MM-DDTHH:MM:SS[.mmm]Z or YYYY-MM-DDTHH:MM:SS[.mmm]±HH:MM',
		title: 'Iso8601DateTime',
	}),
	Schema.brand('Iso8601DateTime'),
) {
    static readonly decode: (value: string) => Effect.Effect<Iso8601DateTime.Type, ParseResult.ParseError, never> = value =>
		Schema.decode(Iso8601DateTime)(value)

	static readonly decodeEither: (value: string) => Either.Either<Iso8601DateTime.Type, ParseResult.ParseError> =
		value => Schema.decodeEither(Iso8601DateTime)(value)
}

export declare namespace Iso8601DateTime {
	/**
	 * The branded type: string & Brand<"Iso8601DateTime">
	 */
	type Type = typeof Iso8601DateTime.Type
}

/**
 * RequestContext - Common context passed through port operations
 *
 * Contains tenant and correlation information for tracing and multi-tenancy.
 */
export interface RequestContext {
	readonly tenantId: TenantId.Type
	readonly correlationId: CorrelationId.Type
}
