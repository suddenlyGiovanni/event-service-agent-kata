/** biome-ignore-all lint/style/useNamingConvention: UUID7 follows Effect's convention for acronyms (UUID, ULID) */

/**
 * UUID7 - Domain service for generating validated UUID7 values
 *
 * This module provides a high-level service that composes:
 *
 * - UUID port (system adapter for raw UUID string generation - from platform package)
 * - UUID7 schema (validation and branding)
 *
 * The service bridges the gap between low-level system UUID generation and domain-level validated UUID7 values.
 *
 * @see {@link @event-service-agent/schemas/shared} for UUID7 schema definition
 * @see {@link ./ports/uuid.port.ts} for UUID port interface
 */

import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import type * as ParseResult from 'effect/ParseResult'

import * as Schema from '@event-service-agent/schemas/shared'

import * as Adapters from './adapters/index.ts'
import * as Ports from './ports/index.ts'

/**
 * UUID7 - Domain service for generating validated UUID7 values
 *
 * Composes the UUID port (system adapter) with UUID7Schema validation to provide a high-level API for generating
 * domain-validated UUIDs.
 *
 * Following Effect's convention: services are named after their domain concept, not suffixed with "Service" (like
 * Random, Clock, Console).
 *
 * @example
 *
 * ```typescript ignore
 * // Production usage with accessor
 * const id = yield* UUID7.randomUUIDv7()
 *
 * // Or extract service if needed
 * const service = yield* UUID7
 * const id2 = yield* service.randomUUIDv7()
 * ```
 */
export class UUID7 extends Effect.Service<UUID7>()('@event-service-agent/schemas/UUID7', {
	accessors: true,

	dependencies: [Adapters.UUID.Default],

	effect: Ports.UUIDPort.pipe(
		Effect.map((uuid) => ({
			/**
			 * Generate a new validated UUID7 with optional timestamp
			 *
			 * Calls the UUID port to generate a raw UUID string, then validates and brands it using the UUID7 schema.
			 *
			 * @example
			 *
			 * ```typescript ignore
			 * // Generate with current time
			 * const id = yield* UUID7.randomUUIDv7()
			 *
			 * // Generate with specific time
			 * const now = yield* DateTime.now
			 * const id2 = yield* UUID7.randomUUIDv7(now)
			 * ```
			 *
			 * @param time - Optional DateTime for deterministic generation
			 *
			 * @returns Effect producing a validated and branded UUID7
			 */
			randomUUIDv7: (time?: DateTime.Utc): Effect.Effect<Schema.UUID7.Type, ParseResult.ParseError> =>
				pipe(uuid.randomUUIDv7(time?.epochMillis), Schema.UUID7.decode),
		})),
	),
}) {
	/**
	 * Test implementation with fixed UUID
	 *
	 * Provides the service layer with a test UUID port that returns a fixed value. Uses DefaultWithoutDependencies to
	 * allow overriding the UUID dependency.
	 *
	 * @example
	 *
	 * ```typescript ignore
	 * const id1 = yield* UUID7.randomUUIDv7()
	 * const id2 = yield* UUID7.randomUUIDv7()
	 * // Both will be "01234567-89ab-7cde-89ab-0123456789ab" when using Test layer
	 * ```
	 *
	 * @param fixed - The fixed UUID v7 string to return (must be valid UUID v7)
	 */
	static readonly Test = <A extends `${string}-${string}-${string}-${string}-${string}`>(
		fixed: A,
	): Layer.Layer<UUID7> => UUID7.DefaultWithoutDependencies.pipe(Layer.provide(Adapters.UUID.Test(fixed)))

	/**
	 * Test implementation with sequential UUIDs
	 *
	 * Provides the service layer with a sequential UUID port. Uses DefaultWithoutDependencies to allow overriding the
	 * UUID dependency.
	 *
	 * Format: `{prefix}-0000-7000-8000-{counter}` where counter increments from 000000000000.
	 *
	 * @example
	 *
	 * ```typescript ignore
	 * const id1 = yield* UUID7.randomUUIDv7() // "12345678-0000-7000-8000-000000000000"
	 * const id2 = yield* UUID7.randomUUIDv7() // "12345678-0000-7000-8000-000000000001"
	 * const id3 = yield* UUID7.randomUUIDv7() // "12345678-0000-7000-8000-000000000002"
	 * // When using Sequence layer
	 * ```
	 *
	 * @param prefix - Optional 8-char hex prefix (default: "00000000")
	 */
	static readonly Sequence = (prefix = '00000000'): Layer.Layer<UUID7> =>
		UUID7.DefaultWithoutDependencies.pipe(Layer.provide(Adapters.UUID.Sequence(prefix)))
}
