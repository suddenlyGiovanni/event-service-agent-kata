import type * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'

import { UUIDPort } from '../ports/uuid.port.ts'

/**
 * UUID — Adapter implementations for UUIDPort
 *
 * Provides different UUID v7 generation strategies:
 *
 * - {@link Default} — Production adapter using Bun's native UUID v7 implementation
 * - {@link Test} — Test adapter returning fixed UUID for deterministic tests
 * - {@link Sequence} — Test adapter generating sequential UUIDs with incrementing counter
 *
 * @remarks
 * This namespace follows the established adapter pattern (TimerPersistence, TimerEventBus) where the namespace name
 * drops the "Port" suffix from the port name to avoid naming collisions in adapter implementation files.
 *
 * @see {@link UUIDPort} for the port interface specification
 * @see {@link ../../../../docs/design/hexagonal-architecture-layers.md} for adapter layer guidelines
 */
export class UUID {
	/**
	 * Default adapter - Uses Bun's native UUID v7 implementation
	 *
	 * Delegates to Bun.randomUUIDv7() which provides a native, high-performance implementation of the UUID version 7
	 * specification.
	 *
	 * @example
	 *
	 * ```typescript
	 * import { Effect } from 'effect'
	 *
	 * import * as Adapters from '@event-service-agent/platform/adapters'
	 * import { UUIDPort } from '@event-service-agent/platform/ports'
	 *
	 * // In domain code
	 * const program: Effect.Effect<string, never, UUIDPort> = Effect.gen(function* () {
	 * 	const uuid = yield* UUIDPort
	 * 	const rawId = uuid.randomUUIDv7()
	 * 	return rawId
	 * })
	 *
	 * // Provide default implementation
	 * const runnable = program.pipe(Effect.provide(Adapters.UUID.Default))
	 *
	 * // Run the program
	 * await Effect.runPromise(runnable) // "0192ce07-8c4f-7d66-afec-2482b5c9b03c"
	 * ```
	 */
	static readonly Default: Layer.Layer<UUIDPort> = Layer.succeed(
		UUIDPort,
		UUIDPort.of({
			randomUUIDv7: (timestamp) => Bun.randomUUIDv7('hex', timestamp),
		}),
	)

	/**
	 * Test adapter - Returns fixed UUID version 7 (deterministic)
	 *
	 * Useful for tests requiring predictable UUIDs.
	 *
	 * @example
	 *
	 * ```typescript
	 * import { Effect, Console } from 'effect'
	 * import { UUIDPort } from '@event-service-agent/platform/ports'
	 * import * as Adapters from '@event-service-agent/platform/adapters'
	 *
	 * // In domain code
	 * const program: Effect.Effect<void, never, UUIDPort> = Effect.gen(function* () {
	 * 	const uuid = yield* UUIDPort
	 * 	const rawId = uuid.randomUUIDv7()
	 * 	yield* Console.log(rawId)
	 * })
	 *
	 * // in test code
	 * const testable: Effect.Effect<void, never, never> = program.pipe(
	 * 	Effect.provide(Adapters.UUID.Test('fixed-uuid-000-000-000-000'))
	 * )
	 *
	 * // Run the program
	 * await Effect.runPromise(testable) // "fixed-uuid-000-000-000-000"
	 * ```
	 *
	 * @param fixed - The fixed UUID v7 string to return (must be valid UUID v7)
	 */
	static readonly Test = <A extends `${string}-${string}-${string}-${string}-${string}`>(
		fixed: A,
	): Layer.Layer<UUIDPort> => Layer.succeed(UUIDPort, UUIDPort.of({ randomUUIDv7: () => fixed }))

	/**
	 * Sequence adapter - Generates sequential UUIDs with incrementing counter (deterministic)
	 *
	 * Useful for tests requiring multiple unique but predictable UUIDs. Format: `{prefix}-0000-7000-8000-{counter}` where
	 * counter increments from 000000000000.
	 *
	 * @example
	 *
	 * ```typescript
	 * import { Effect, Console } from 'effect'
	 *
	 * import { UUIDPort } from '@event-service-agent/platform/ports'
	 * import * as Adapters from '@event-service-agent/platform/adapters'
	 *
	 * const program = Effect.gen(function* () {
	 * 	const uuid = yield* UUIDPort
	 * 	const uuid1 = uuid.randomUUIDv7() // "12345678-0000-7000-8000-000000000000"
	 * 	const uuid2 = uuid.randomUUIDv7() // "12345678-0000-7000-8000-000000000001"
	 * 	const uuid3 = uuid.randomUUIDv7() // "12345678-0000-7000-8000-000000000002"
	 * 	yield* Console.log([uuid1, uuid2, uuid3])
	 * }).pipe(Effect.provide(Adapters.UUID.Sequence('12345678')))
	 *
	 * await Effect.runPromise(program) // [ "12345678-0000-7000-8000-000000000000", "12345678-0000-7000-8000-000000000001", "12345678-0000-7000-8000-000000000002" ]
	 * ```
	 *
	 * @param prefix - Optional 8-char hex prefix (default: "00000000")
	 */
	static readonly Sequence = (prefix = '00000000'): Layer.Layer<UUIDPort> => {
		// Create new counter instance per call
		const createService = () => {
			let counter = 0
			return {
				randomUUIDv7: () => {
					const hex = (counter++).toString(16).padStart(12, '0')
					return `${prefix}-0000-7000-8000-${hex}`
				},
			} satisfies Context.Tag.Service<UUIDPort>
		}
		return Layer.succeed(UUIDPort, UUIDPort.of(createService()))
	}
}
