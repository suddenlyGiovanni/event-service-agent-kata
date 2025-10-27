/**
 * TenantId - Identifies the tenant for multi-tenancy
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<TenantIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 } from './uuid7.schema.ts'

const TenantIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/TenantId')

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
