/**
 * TenantId Schema
 *
 * Branded UUID7 type for tenant identification in multi-tenant architecture.
 *
 * **Why TenantId is distinct from other IDs**: Type system prevents accidentally using TenantId where ServiceCallId is
 * expected and vice versa. This compile-time safety prevents data leakage bugs across tenant boundaries.
 *
 * **Multi-Tenancy Enforcement**: Every database query, event, and command must include TenantId to ensure:
 *
 * - No cross-tenant data access (tenant isolation)
 * - Partition key for message broker ordering (per-tenant partitioning)
 * - Audit trail (which tenant performed what action)
 *
 * **Why UUID7 instead of UUID4**: UUID7 is time-ordered (timestamp prefix), providing:
 *
 * - Natural database index ordering (better performance)
 * - Sortable tenant IDs (useful for pagination, reporting)
 * - Embedded timestamp (can extract creation time without separate column)
 *
 * Type Structure: `string & Brand<UUID7Brand> & Brand<TenantIdBrand>`
 *
 * - Double-branded for maximum type safety
 * - Cannot be confused with raw UUID7 or other ID types
 * - Runtime validation via Effect Schema
 *
 * @see docs/design/domain.md#tenancy — Multi-tenancy design
 * @see docs/decisions/ADR-0010-identity.md — Identity generation strategy
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import * as Adapters from '@event-service-agent/platform/adapters'

import { UUID7 } from './uuid7.schema.ts'

/**
 * TenantId brand for internal use
 */
const TenantIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/TenantId')

/**
 * TenantId — Branded UUID7 for tenant identification
 *
 * Double-branded type ensures compile-time distinction from:
 *
 * - Raw UUID7 (prevents using unvalidated strings)
 * - ServiceCallId (prevents cross-entity confusion)
 * - CorrelationId (prevents using tenant ID for correlation)
 * - EnvelopeId (prevents using tenant ID as message ID)
 */
export class TenantId extends UUID7.pipe(Schema.brand(TenantIdBrand)) {
	/**
	 * Generate a new TenantId using UUID version 7
	 *
	 * Creates a time-ordered, globally unique tenant identifier. UUID7's timestamp prefix enables natural chronological
	 * sorting in databases and logs.
	 *
	 * **When to use**:
	 *
	 * - Creating new tenant during signup/provisioning
	 * - Testing with deterministic IDs (pass `time` parameter)
	 *
	 * **Application-generated IDs (per ADR-0010)**: IDs are generated in application code, not database. This ensures:
	 *
	 * - Idempotency (can retry operations with same ID)
	 * - Correlation (ID available before database write)
	 * - Portability (no database-specific ID generation)
	 *
	 * @example Generate TenantId
	 *
	 * ```typescript
	 * import * as DateTime from 'effect/DateTime'
	 * import * as Effect from 'effect/Effect'
	 * import { pipe } from 'effect/Function'
	 * import type * as ParseResult from 'effect/ParseResult'
	 *
	 * import { UUID7 } from '@event-service-agent/platform/adapters'
	 *
	 * // Generate new TenantId (default: current time)
	 * export const _program1: Effect.Effect<TenantId.Type, ParseResult.ParseError, UUID7> = Effect.gen(function* () {
	 * 	const tenantId = yield* TenantId.makeUUID7()
	 * 	return tenantId
	 * })
	 *
	 * // Generate TenantId with specific timestamp (deterministic)
	 * export const _program2: Effect.Effect<TenantId.Type, ParseResult.ParseError, UUID7> = pipe(
	 * 	DateTime.unsafeMake(1234567890000), // DateTime.Utc
	 * 	TenantId.makeUUID7,
	 * )
	 *
	 * // Provide UUID7 service to satisfy requirements
	 * export const _program3: Effect.Effect<TenantId.Type, ParseResult.ParseError, never> = _program2.pipe(
	 * 	Effect.provide(UUID7.Default),
	 * )
	 * ```
	 *
	 * @param time - Optional UTC timestamp for deterministic generation (testing)
	 *
	 * @returns Effect producing validated TenantId
	 * @throws ParseError - If generated UUID7 fails validation (extremely rare)
	 * @requires UUID7 - Service for UUID generation
	 */
	static readonly makeUUID7: (
		time?: DateTime.Utc,
	) => Effect.Effect<TenantId.Type, ParseResult.ParseError, Adapters.UUID7> = (time) =>
		Adapters.UUID7.pipe(
			Effect.flatMap(({ randomUUIDv7 }) => randomUUIDv7(time)),
			Effect.map(
				/*
				 * Use make() instead of decode() because UUID7 service already validates.
				 * This avoids redundant validation (performance optimization).
				 */
				(uuid7: UUID7.Type): TenantId.Type => TenantId.make(uuid7),
			),
		)

	/**
	 * Decode string to TenantId with validation
	 *
	 * Validates UUID7 format and applies TenantId brand. Use for:
	 *
	 * - Parsing HTTP request parameters
	 * - Deserializing from database
	 * - Loading from configuration files
	 *
	 * @example Decode string to TenantId
	 *
	 * ```typescript
	 * import * as Effect from 'effect/Effect'
	 * import { pipe } from 'effect/Function'
	 * import type * as ParseResult from 'effect/ParseResult'
	 *
	 * import { TenantId } from './tenant-id.schema.ts'
	 *
	 * // Decode and use with Effect chaining
	 * export const _program1: Effect.Effect<string, ParseResult.ParseError> = pipe(
	 * 	'01936cf8-8d3a-7000-8000-000000000000',
	 * 	TenantId.decode,
	 * 	Effect.map((tenantId) => `Tenant: ${tenantId}`),
	 * )
	 *
	 * // Decode with error handling using match
	 * export const _program2: Effect.Effect<string, never> = pipe(
	 * 	'01936cf8-8d3a-7000-8000-000000000000',
	 * 	TenantId.decode,
	 * 	Effect.match({
	 * 		onFailure: (error) => `Invalid tenant ID: ${error}`,
	 * 		onSuccess: (tenantId) => `Valid tenant: ${tenantId}`,
	 * 	}),
	 * )
	 * ```
	 *
	 * @param value - String to validate and brand
	 *
	 * @returns Effect with validated TenantId
	 * @throws ParseError - If value is not valid UUID7 format
	 */
	static readonly decode: (value: string) => Effect.Effect<TenantId.Type, ParseResult.ParseError> = (value) =>
		Schema.decode(TenantId)(value)

	/**
	 * Decode string to TenantId (Either variant for error handling)
	 *
	 * Like decode() but returns Either instead of Effect. Useful for:
	 *
	 * - Synchronous validation contexts
	 * - Pattern matching on success/failure
	 * - Avoiding Effect overhead when already in Effect context
	 *
	 * @example Decode with Either
	 *
	 * ```typescript
	 * import * as Either from 'effect/Either'
	 * import { pipe } from 'effect/Function'
	 * import type * as ParseResult from 'effect/ParseResult'
	 *
	 * import { TenantId } from './tenant-id.schema.ts'
	 *
	 * // Decode and use with Either chaining
	 * export const _program1: Either.Either<string, ParseResult.ParseError> = pipe(
	 * 	'01936cf8-8d3a-7000-8000-000000000000',
	 * 	TenantId.decodeEither,
	 * 	Either.map((tenantId) => `Tenant: ${tenantId}`),
	 * )
	 *
	 * // Decode with pattern matching
	 * export const _program2: string = pipe(
	 * 	'01936cf8-8d3a-7000-8000-000000000000',
	 * 	TenantId.decodeEither,
	 * 	Either.match({
	 * 		onLeft: (error) => `Invalid tenant ID: ${error}`,
	 * 		onRight: (tenantId) => `Valid tenant: ${tenantId}`,
	 * 	}),
	 * )
	 * ```
	 *
	 * @param value - String to validate
	 *
	 * @returns Either with TenantId or ParseError
	 */
	static readonly decodeEither: (value: string) => Either.Either<TenantId.Type, ParseResult.ParseError> = (value) =>
		Schema.decodeEither(TenantId)(value)
}

/**
 * Type aliases for TenantId
 *
 * Provides convenient access to the branded type.
 */
export declare namespace TenantId {
	/**
	 * The branded type: string & Brand<UUID7Brand> & Brand<TenantIdBrand>
	 */
	type Type = typeof TenantId.Type
}
