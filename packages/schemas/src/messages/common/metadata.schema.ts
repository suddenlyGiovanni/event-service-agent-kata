import * as Schema from 'effect/Schema'

/** ResponseMeta - HTTP response metadata used in events */
export const ResponseMeta = Schema.Struct({
	bodySnippet: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	latencyMs: Schema.optional(Schema.Number),
	status: Schema.Number,
})

/** ErrorMeta - Error classification and optional diagnostics */
export const ErrorMeta = Schema.Struct({
	details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
	kind: Schema.String,
	latencyMs: Schema.optional(Schema.Number),
	message: Schema.optional(Schema.String),
})

export type ResponseMeta = Schema.Schema.Type<typeof ResponseMeta>
export type ErrorMeta = Schema.Schema.Type<typeof ErrorMeta>
