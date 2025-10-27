/**
 * ServiceCallId - Unique identifier for a service call (aggregate root)
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<ServiceCallIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 } from './uuid7.schema.ts'

const ServiceCallIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/ServiceCallId')

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
