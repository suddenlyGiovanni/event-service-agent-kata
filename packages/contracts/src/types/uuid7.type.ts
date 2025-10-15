/** biome-ignore-all lint/style/useNamingConvention: UUID7 follows Effect's convention for acronyms (UUID, ULID) */

/**
 * UUID7 - Time-ordered UUID (RFC 9562)
 *
 * This module provides:
 * - UUID7 branded schema with validation
 * - Uuid7Generator port for environment-agnostic generation
 * - Live adapter (platform crypto API)
 * - Test adapters (deterministic, sequential)
 *
 * @module uuid7
 * @see {@link https://www.rfc-editor.org/rfc/rfc9562.html#name-uuid-version-7 RFC 9562: UUID version 7}
 * @see {@link ../../decisions/ADR-0010-identity.md ADR-0010: Identity Generation Strategy}
 */

import type { LazyArbitrary } from 'effect/Arbitrary'
import * as Schema from 'effect/Schema'

const identifier = 'UUID7' as const
const UUID7SchemaId: unique symbol = Symbol.for(`@event-service-agent/contracts/SchemaId/${identifier}`)
const UUID7Brand: unique symbol = Symbol.for(`@event-service-agent/contracts/types/${identifier}`)

/**
 * UUID v7 regex pattern (RFC 9562 compliant)
 *
 * Format breakdown:
 * - `[0-9a-f]{8}` — Timestamp high (32 bits)
 * - `-[0-9a-f]{4}` — Timestamp mid (16 bits)
 * - `-7[0-9a-f]{3}` — Version (4 bits = 7) + Timestamp low (12 bits)
 * - `-[89ab][0-9a-f]{3}` — Variant (2 bits = RFC4122) + Clock sequence (14 bits)
 * - `-[0-9a-f]{12}` — Node (48 bits random)
 *
 * Named capture groups:
 * - `timestampHigh`, `timestampMid`, `timestampLowVersion`, `variant`, `node`
 *
 * @internal
 */
export const UUID7Regex =
	/^(?<timestampHigh>[0-9a-f]{8})-(?<timestampMid>[0-9a-f]{4})-(?<timestampLowVersion>7[0-9a-f]{3})-(?<variant>[89ab][0-9a-f]{3})-(?<node>[0-9a-f]{12})$/i

/**
 * UUID7 - Time-ordered UUID schema with validation and branding
 *
 * Extends `Schema.UUID` with additional validation for UUID version 7 format:
 * - Version field must be `7`
 * - Variant field must be RFC4122 compliant (`[89ab]`)
 *
 * **Brands:** `UUID7`
 *
 * **Format:** `xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx` (time-ordered)
 *
 * @example
 * ```typescript
 * // Generate new UUID v7 (requires UUID7Generator in context)
 * const id = yield* makeUUID7
 *
 * // Decode from string (validation)
 * const parsed = yield* Schema.decode(UUID7)("01234567-89ab-7cde-89ab-0123456789ab")
 *
 * // Encode to string (no-op, already string)
 * const str = Schema.encode(UUID7)(id)
 * ```
 */
export class UUID7 extends Schema.UUID.pipe(
	Schema.pattern(UUID7Regex, {
		arbitrary: (): LazyArbitrary<string> => fc => fc.uuid({ version: 7 }),
		description: 'a UUID version 7 (time-ordered, RFC 9562)',
		identifier: identifier,
		jsonSchema: {
			description: 'UUID version 7 (time-ordered, RFC 9562)',
			format: 'uuid',
			pattern: UUID7Regex.source,
		},
		message: () => 'Must be a valid UUID version 7 (format: xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx)',
		schemaId: UUID7SchemaId,
	}),
	Schema.brand(UUID7Brand),
) {}

export declare namespace UUID7 {
	/**
	 * UUID7 type - Branded string representing a time-ordered UUID v7
	 *
	 * Use this type for function signatures, return types, and type annotations.
	 * To create values, use the UUID7 service or Schema.decode(UUID7).
	 *
	 */
	type Type = typeof UUID7.Type
}
