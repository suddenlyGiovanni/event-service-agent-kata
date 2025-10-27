/**
 * EnvelopeId - Unique identifier for message envelopes
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<EnvelopeIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 } from './uuid7.schema.ts'

const EnvelopeIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/EnvelopeId')

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
