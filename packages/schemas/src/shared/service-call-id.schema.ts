/**
 * ServiceCallId - Unique identifier for a service call (aggregate root)
 *
 * Extends UUID7 with an additional brand, resulting in:
 * string & Brand<UUID7Brand> & Brand<ServiceCallIdBrand>
 */

/* biome-ignore-all lint/style/useNamingConvention: UUID7/makeUUID7 follow Effect conventions */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

import { UUID7 as Uuid7Service } from '@event-service-agent/platform/uuid7'

import { UUID7 } from './uuid7.schema.ts'

const ServiceCallIdBrand: unique symbol = Symbol.for('@event-service-agent/schemas/shared/ServiceCallId')

export class ServiceCallId extends UUID7.pipe(Schema.brand(ServiceCallIdBrand)) {
	/**
	 * Generates a new ServiceCallId using UUID version 7
	 *
	 * Creates a time-ordered, globally unique identifier for service call aggregates.
	 * UUID7 provides monotonic sorting properties based on timestamp, making it ideal
	 * for event sourcing, aggregate tracking, and distributed systems.
	 *
	 * @param time - Optional UTC timestamp for deterministic generation (useful for testing)
	 * @returns Effect that produces a branded ServiceCallId or ParseError
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
	 *   const serviceCallId = yield* ServiceCallId.makeUUID7()
	 *
	 *   yield* Console.log(`Generated ServiceCallId: ${serviceCallId}`)
	 *
	 *   return serviceCallId
	 * }).pipe(Effect.provide(Uuid7ServiceLive))
	 * ```
	 */
	static readonly makeUUID7: (
		time?: DateTime.Utc,
	) => Effect.Effect<ServiceCallId.Type, ParseResult.ParseError, Uuid7Service> = time =>
		Uuid7Service.pipe(
			Effect.flatMap(({ randomUUIDv7 }) => randomUUIDv7(time)),
			// Use make() instead of decode() - the UUID7 is already validated by the service
			Effect.map((uuid7: UUID7.Type): ServiceCallId.Type => ServiceCallId.make(uuid7)),
		)

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
