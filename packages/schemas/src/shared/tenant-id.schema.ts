/**
 * TenantId - Identifies the tenant for multi-tenancy
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<TenantIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 as Uuid7Service } from '../uuid7.service.ts'
import { UUID7 } from './uuid7.schema.ts'

const TenantIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/TenantId')

export class TenantId extends UUID7.pipe(Schema.brand(TenantIdBrand)) {
	/**
	 * Generates a new TenantId using UUID version 7
	 *
	 * Creates a time-ordered, globally unique tenant identifier. UUID7 provides
	 * monotonic sorting properties based on timestamp, making it ideal for
	 * distributed systems and database indexing.
	 *
	 * @param time - Optional UTC timestamp for deterministic generation (useful for testing)
	 * @returns Effect that produces a branded TenantId or ParseError
	 * @requires Uuid7Service - Must be provided to run the Effect
	 *
	 * @example
	 * ```typescript
	 * import * as Effect from 'effect/Effect'
	 * import * as Console from 'effect/Console'
	 * import { Uuid7ServiceLive } from '../services/uuid7.service.ts'
	 *
	 * // Generate with current time
	 * const program = Effect.gen(function* () {
	 *   const tenantId = yield* TenantId.makeUUID7()
	 *
	 *   yield* Console.log(`Generated TenantId: ${tenantId}`)
	 *
	 *   return tenantId
	 * }).pipe(Effect.provide(Uuid7ServiceLive))
	 * ```
	 */
	static readonly makeUUID7: (
		time?: DateTime.Utc,
	) => Effect.Effect<TenantId.Type, ParseResult.ParseError, Uuid7Service> = time =>
		Uuid7Service.pipe(
			Effect.flatMap(({ randomUUIDv7 }) => randomUUIDv7(time)),
			Effect.map(
				// Use make() instead of decode() - the UUID7 is already validated by the service
				(uuid7: UUID7.Type): TenantId.Type => TenantId.make(uuid7),
			),
		)

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
