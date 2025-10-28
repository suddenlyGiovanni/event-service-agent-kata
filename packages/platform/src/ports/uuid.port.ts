/** biome-ignore-all lint/style/useNamingConvention: UUID follows Effect's convention for acronyms */

import * as Context from 'effect/Context'

export class UUIDPort extends Context.Tag('@event-service-agent/platform/ports/UUID')<
	UUIDPort,
	{
		/**
		 * Generate a UUIDv7, which is a sequential ID based on the current timestamp with a random component.
		 *
		 * When the same timestamp is used multiple times, a monotonically increasing
		 * counter is appended to allow sorting. The final 8 bytes are
		 * cryptographically random. When the timestamp changes, the counter resets to
		 * a pseudo-random integer.
		 *
		 * @param timestamp Unix timestamp in milliseconds, defaults to `Date.now()`
		 *
		 * @example
		 * ```ts
		 * const array = [
		 *   randomUUIDv7(),
		 *   randomUUIDv7(),
		 *   randomUUIDv7(),
		 * ]
		 * [
		 *   "0192ce07-8c4f-7d66-afec-2482b5c9b03c",
		 *   "0192ce07-8c4f-7d67-805f-0f71581b5622",
		 *   "0192ce07-8c4f-7d68-8170-6816e4451a58"
		 * ]
		 * ```
		 */
		randomUUIDv7: (
			/**
			 * @default Date.now()
			 */
			timestamp?: number | Date,
		) => string
	}
>() {
	/**
	 * Provides a default `UUID` tag implementation backed by `Bun.randomUUIDv7`
	 * so consumers can depend on an in-process UUIDv7 generator without wiring
	 * a custom layer.
	 *
	 * @example
	 * ```typescript
	 * import { Effect } from 'effect'
	 * import { UUIDPort } from '@event-service-agent/contracts/ports'
	 *
	 * const program: Effect.Effect<void, never, UUIDPort> = Effect.gen(function* () {
	 *     const uuid = yield* UUIDPort
	 *     const rawId = uuid.randomUUIDv7()
	 *     yield* Console.log(rawId)
	 * })
	 *
	 * // Provide default implementation
	 * const runnable = program.pipe(Effect.provideService(UUIDPort.Default))
	 *
	 * // Run the program
	 * await Effect.runPromise(runnable) // "0192ce07-8c4f-7d66-afec-2482b5c9b03c"
	 * ```
	 */
	static readonly Default: Context.Tag.Service<UUIDPort> = UUIDPort.of({
		randomUUIDv7: timestamp => Bun.randomUUIDv7('hex', timestamp),
	})

	/**
	 * Test adapter - Returns fixed UUID version 7 (deterministic)
	 *
	 * Useful for tests requiring predictable UUIDs.
	 *
	 * @param fixed - The fixed UUID v7 string to return (must be valid UUID v7)
	 *
	 * @example
	 * ```typescript
	 * import { Effect } from 'effect'
	 * import { UUIDPort } from '@event-service-agent/contracts/ports'
	 *
	 * // In domain code
	 * const program: Effect.Effect<void, never, UUIDPort> = Effect.gen(function* () {
	 *     const uuid = yield* UUIDPort
	 *     const rawId = uuid.randomUUIDv7()
	 *     yield* Console.log(rawId)
	 * })
	 *
	 * // in test code
	 * const testable: Effect.Effect<void, never, never> = program.pipe(Effect.provideService(UUIDPort.Test("fixed-uuid-000-000-000-000")))
	 *
	 * // Run the program
	 * await Effect.runPromise(testable) // "fixed-uuid-000-000-000-000"
	 *```
	 */
	static readonly Test = <A extends `${string}-${string}-${string}-${string}-${string}`>(
		fixed: A,
	): Context.Tag.Service<UUIDPort> => UUIDPort.of({ randomUUIDv7: () => fixed })

	/**
	 * Sequence adapter - Generates sequential UUIDs with incrementing counter (deterministic)
	 *
	 * Useful for tests requiring multiple unique but predictable UUIDs.
	 * Format: `{prefix}-0000-7000-8000-{counter}` where counter increments from 000000000000.
	 *
	 * @param prefix - Optional 8-char hex prefix (default: "00000000")
	 *
	 * @example
	 * ```typescript
	 * import { Effect } from 'effect'
	 * import { UUIDPort } from '@event-service-agent/contracts/ports'
	 *
	 * const program = Effect.gen(function* () {
	 *   const uuid = yield* UUIDPort
	 *   const uuid1 = uuid.randomUUIDv7() // "12345678-0000-7000-8000-000000000000"
	 *   const uuid2 = uuid.randomUUIDv7() // "12345678-0000-7000-8000-000000000001"
	 *   const uuid3 = uuid.randomUUIDv7() // "12345678-0000-7000-8000-000000000002"
	 *   yield* Console.log([uuid1, uuid2, uuid3])
	 * }).pipe(Effect.provideService(UUIDPort.Sequence("12345678")))
	 *
	 * await Effect.runPromise(program) // [ "12345678-0000-7000-8000-000000000000", "12345678-0000-7000-8000-000000000001", "12345678-0000-7000-8000-000000000002" ]
	 * ```
	 *
	 */
	static readonly Sequence = (prefix = '00000000'): Context.Tag.Service<UUIDPort> => {
		// Create new counter instance per call
		const createService = () => {
			let counter = 0
			return {
				randomUUIDv7: () => {
					const hex = (counter++).toString(16).padStart(12, '0')
					return `${prefix}-0000-7000-8000-${hex}`
				},
			}
		}
		return UUIDPort.of(createService())
	}
}
