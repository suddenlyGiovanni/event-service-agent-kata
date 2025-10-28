/** biome-ignore-all lint/style/useNamingConvention: UUID7 follows Effect's convention for acronyms (UUID, ULID) */

/**
 * UUID7 - Domain service for generating validated UUID7 values
 *
 * This module provides a high-level service that composes:
 * - UUID port (system adapter for raw UUID string generation - from platform package)
 * - UUID7 schema (validation and branding)
 *
 * The service bridges the gap between low-level system UUID generation
 * and domain-level validated UUID7 values.
 *
 * @see {@link ./shared/uuid7.schema.ts} for UUID7 schema definition
 * @see {@link @event-service-agent/platform/ports/uuid.port.ts} for UUID port interface (will be in platform)
 */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import type * as ParseResult from 'effect/ParseResult'

import { UUIDPort } from '@event-service-agent/platform/ports'

import { UUID7 as UUID7Schema } from './shared/uuid7.schema.ts'

/**
 * UUID7 - Domain service for generating validated UUID7 values
 *
 * Composes the UUID port (system adapter) with UUID7Schema validation
 * to provide a high-level API for generating domain-validated UUIDs.
 *
 * Following Effect's convention: services are named after their domain concept,
 * not suffixed with "Service" (like Random, Clock, Console).
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 * import { UUID7 } from '@event-service-agent/schemas/uuid7.service'
 *
 * // Production usage with accessor
 * const program = Effect.gen(function* () {
 *   const id = yield* UUID7.randomUUIDv7()
 *   console.log(id) // "01934567-89ab-7cde-89ab-0123456789ab" (branded UUID7 type)
 * }).pipe(Effect.provide(UUID7.Default))
 *
 * // Or extract service if needed
 * const program2 = Effect.gen(function* () {
 *   const service = yield* UUID7
 *   const id = yield* service.randomUUIDv7()
 *   return id
 * }).pipe(Effect.provide(UUID7.Default))
 * ```
 */
export class UUID7 extends Effect.Service<UUID7>()('@event-service-agent/schemas/UUID7', {
	accessors: true,

	dependencies: [Layer.succeed(UUIDPort, UUIDPort.Default)],

	effect: UUIDPort.pipe(
		Effect.map(uuid => ({
			/**
			 * Generate a new validated UUID7 with optional timestamp
			 *
			 * Calls the UUID port to generate a raw UUID string, then validates
			 * and brands it using the UUID7 schema.
			 *
			 * @param time - Optional DateTime for deterministic generation
			 * @returns Effect producing a validated and branded UUID7
			 *
			 * @example
			 * ```typescript
			 * // Generate with current time - dependencies satisfied automatically
			 * const id = yield* UUID7Service.randomUUIDv7()
			 *
			 * // Generate with specific time
			 * const now = yield* DateTime.now
			 * const id = yield* UUID7Service.randomUUIDv7(now)
			 *
			 * // yield the service
			 * const uuid7 = yield* UUID7Service
			 * // Generate with specific time
			 * const now = yield* DateTime.now
			 * const id = yield* uuid7.randomUUIDv7(now)
			 * ```
			 */
			randomUUIDv7: (time?: DateTime.Utc): Effect.Effect<UUID7Schema.Type, ParseResult.ParseError> =>
				pipe(uuid.randomUUIDv7(time?.epochMillis), UUID7Schema.decode),
		})),
	),
}) {
	/**
	 * Test implementation with fixed UUID
	 *
	 * Provides the service layer with a test UUID port that returns a fixed value.
	 * Uses DefaultWithoutDependencies to allow overriding the UUID dependency.
	 *
	 * @param fixed - The fixed UUID v7 string to return (must be valid UUID v7)
	 *
	 * @example
	 * ```typescript
	 * import { Effect } from 'effect'
	 * import { UUID7Service } from '@event-service-agent/schemas/uuid7.service'
	 *
	 * const testProgram = Effect.gen(function* () {
	 *   const id1 = yield* UUID7Service.randomUUIDv7()
	 *   const id2 = yield* UUID7Service.randomUUIDv7()
	 *   // Both will be "01234567-89ab-7cde-89ab-0123456789ab"
	 *   return [id1, id2]
	 * }).pipe(Effect.provide(
	 *   UUID7Service.Test("01234567-89ab-7cde-89ab-0123456789ab")
	 * ))
	 * ```
	 */
	static readonly Test = <A extends `${string}-${string}-${string}-${string}-${string}`>(
		fixed: A,
	): Layer.Layer<UUID7> =>
		UUID7.DefaultWithoutDependencies.pipe(Layer.provide(Layer.succeed(UUIDPort, UUIDPort.Test(fixed))))

	/**
	 * Test implementation with sequential UUIDs
	 *
	 * Provides the service layer with a sequential UUID port.
	 * Uses DefaultWithoutDependencies to allow overriding the UUID dependency.
	 * Format: `{prefix}-0000-7000-8000-{counter}` where counter increments from 000000000000.
	 *
	 * @param prefix - Optional 8-char hex prefix (default: "00000000")
	 *
	 * @example
	 * ```typescript
	 * import { Effect } from 'effect'
	 * import { UUID7Service } from '@event-service-agent/schemas/uuid7.service'
	 *
	 * const testProgram = Effect.gen(function* () {
	 *   const id1 = yield* UUID7Service.randomUUIDv7() // "12345678-0000-7000-8000-000000000000"
	 *   const id2 = yield* UUID7Service.randomUUIDv7() // "12345678-0000-7000-8000-000000000001"
	 *   const id3 = yield* UUID7Service.randomUUIDv7() // "12345678-0000-7000-8000-000000000002"
	 *   return [id1, id2, id3]
	 * }).pipe(Effect.provide(UUID7Service.Sequence("12345678")))
	 * ```
	 */
	static readonly Sequence = (prefix = '00000000'): Layer.Layer<UUID7> =>
		UUID7.DefaultWithoutDependencies.pipe(Layer.provide(Layer.succeed(UUIDPort, UUIDPort.Sequence(prefix))))
}
