/**
 * CorrelationId - Traces a request across module boundaries
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<CorrelationIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 } from './uuid7.schema.ts'

const CorrelationIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/CorrelationId')

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
