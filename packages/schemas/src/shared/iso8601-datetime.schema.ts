/**
 * Iso8601DateTime - ISO8601 formatted datetime string
 *
 * Examples: "2025-10-05T12:00:00Z", "2025-10-05T12:00:00.123Z"
 *
 * Pattern validates RFC3339 / ISO8601 format with:
 * - Date: YYYY-MM-DD
 * - Time separator: T
 * - Time: HH:MM:SS with optional milliseconds
 * - Timezone: Z or ±HH:MM
 */

import type * as Effect from 'effect/Effect'
import type * as Either from 'effect/Either'
import type * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

export class Iso8601DateTime extends Schema.String.pipe(
	Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/, {
		description: 'ISO8601 formatted datetime string',
		message: () =>
			'Invalid ISO8601 datetime format. Expected: YYYY-MM-DDTHH:MM:SS[.mmm]Z or YYYY-MM-DDTHH:MM:SS[.mmm]±HH:MM',
		title: 'Iso8601DateTime',
	}),
	Schema.brand('Iso8601DateTime'),
) {
	static readonly decode: (value: string) => Effect.Effect<Iso8601DateTime.Type, ParseResult.ParseError, never> =
		value => Schema.decode(Iso8601DateTime)(value)

	static readonly decodeEither: (value: string) => Either.Either<Iso8601DateTime.Type, ParseResult.ParseError> =
		value => Schema.decodeEither(Iso8601DateTime)(value)
}

export declare namespace Iso8601DateTime {
	/**
	 * The branded type: string & Brand<"Iso8601DateTime">
	 */
	type Type = typeof Iso8601DateTime.Type
}
