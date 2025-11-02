/**
 * EnvelopeId - Unique identifier for message envelopes
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<EnvelopeIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import * as Service from '@event-service-agent/platform/uuid7'

import * as Schemas from './index.ts'

const EnvelopeIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/EnvelopeId')

export class EnvelopeId extends Schemas.UUID7.pipe(Schema.brand(EnvelopeIdBrand)) {
	/**
	 * Generates a new EnvelopeId using UUID version 7
	 *
	 * Creates a time-ordered, globally unique envelope identifier for message wrapping.
	 * UUID7 provides monotonic sorting properties based on timestamp, making it ideal
	 * for message ordering and distributed messaging systems.
	 *
	 * @param time - Optional UTC timestamp for deterministic generation (useful for testing)
	 * @returns Effect that produces a branded EnvelopeId or ParseError
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
	 *   const envelopeId = yield* EnvelopeId.makeUUID7()
	 *
	 *   yield* Console.log(`Generated EnvelopeId: ${envelopeId}`)
	 *
	 *   return envelopeId
	 * }).pipe(Effect.provide(Uuid7ServiceLive))
	 * ```
	 */
	static readonly makeUUID7: (
		time?: DateTime.Utc,
	) => Effect.Effect<EnvelopeId.Type, ParseResult.ParseError, Service.UUID7> = time =>
		Service.UUID7.pipe(
			Effect.flatMap(({ randomUUIDv7 }) => randomUUIDv7(time)),
			// Use make() instead of decode() - the UUID7 is already validated by the service
			Effect.map((uuid7: Schemas.UUID7.Type): EnvelopeId.Type => EnvelopeId.make(uuid7)),
		)
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
