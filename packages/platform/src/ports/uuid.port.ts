/** biome-ignore-all lint/style/useNamingConvention: UUID follows Effect's convention for acronyms */

import * as Context from 'effect/Context'

/**
 * UUIDPort — UUID generation service
 *
 * Provides UUIDv7 generation for time-ordered unique identifiers. Use for envelope IDs, correlation IDs, and entity
 * identifiers.
 *
 * @see {@link ../adapters/uuid.adapter.ts} for adapter implementations (UUID.Live, UUID.Test, UUID.Sequence)
 */
export class UUIDPort extends Context.Tag('@event-service-agent/platform/ports/UUID')<
	UUIDPort,
	{
		/**
		 * Generate a UUIDv7, which is a sequential ID based on the current timestamp with a random component.
		 *
		 * When the same timestamp is used multiple times, a monotonically increasing counter is appended to allow sorting.
		 * The final 8 bytes are cryptographically random. When the timestamp changes, the counter resets to a pseudo-random
		 * integer.
		 *
		 * @param timestamp Unix timestamp in milliseconds, defaults to `Date.now()`
		 */
		randomUUIDv7: (
			/**
			 * @default Date.now()
			 */
			timestamp?: number | Date,
		) => string
	}
>() {}
