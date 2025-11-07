import * as Schema from 'effect/Schema'

/**
 * Minimal RequestSpec schemas to match platform interfaces.
 * These are intentionally conservative and can be expanded later.
 */
export const RequestSpec = Schema.Struct({
	body: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	method: Schema.String,
	url: Schema.String,
})

/**
 * HTTP request specification type (with optional body)
 */
export type RequestSpec = Schema.Schema.Type<typeof RequestSpec>

/**
 * HTTP request specification without body (for logging/metadata)
 *
 * Uses bodySnippet instead of full body for reduced storage/logging overhead.
 */
export const RequestSpecWithoutBody = Schema.Struct({
	bodySnippet: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	method: Schema.String,
	url: Schema.String,
})

/**
 * HTTP request specification type without body
 */
export type RequestSpecWithoutBody = Schema.Schema.Type<typeof RequestSpecWithoutBody>
