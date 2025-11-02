/**
 * CorrelationId - Traces a request across module boundaries
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<CorrelationIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import * as Service from '@event-service-agent/platform/uuid7'

import { UUID7 } from './uuid7.schema.ts'

const CorrelationIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/CorrelationId')

export class CorrelationId extends UUID7.pipe(Schema.brand(CorrelationIdBrand)) {
	/**
	 * Generates a new CorrelationId using UUID version 7
	 *
	 * Creates a time-ordered, globally unique correlation identifier for tracing
	 * requests across module boundaries. UUID7 provides monotonic sorting properties
	 * based on timestamp, making it ideal for distributed tracing systems.
	 *
	 * @param time - Optional UTC timestamp for deterministic generation (useful for testing)
	 * @returns Effect that produces a branded CorrelationId or ParseError
	 * @requires Uuid7Service - Must be provided to run the Effect
	 *
	 * @example
	 * ```typescript
	 * import * as Effect from 'effect/Effect'
	 * import * as Console from 'effect/Console'
	 * import { Uuid7ServiceLive } from '../uuid7.service.ts'
	 *
	 * // Generate with current time
	 * const program = Effect.gen(function* () {
	 *   const correlationId = yield* CorrelationId.makeUUID7()
	 *
	 *   yield* Console.log(`Generated CorrelationId: ${correlationId}`)
	 *
	 *   return correlationId
	 * }).pipe(Effect.provide(Uuid7ServiceLive))
	 * ```
	 */
	static readonly makeUUID7: (
		time?: DateTime.Utc,
	) => Effect.Effect<CorrelationId.Type, ParseResult.ParseError, Service.UUID7> = time =>
		Service.UUID7.pipe(
			Effect.flatMap(({ randomUUIDv7 }) => randomUUIDv7(time)),
			// Use make() instead of decode() - the UUID7 is already validated by the service
			Effect.map((uuid7: UUID7.Type): CorrelationId.Type => CorrelationId.make(uuid7)),
		)
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
