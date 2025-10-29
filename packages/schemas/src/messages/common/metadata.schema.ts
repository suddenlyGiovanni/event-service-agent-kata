import * as Schema from 'effect/Schema'

/** ResponseMeta - HTTP response metadata used in events */
export const ResponseMeta = Schema.Struct({
  status: Schema.Number,
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  bodySnippet: Schema.optional(Schema.String),
  latencyMs: Schema.optional(Schema.Number),
})

/** ErrorMeta - Error classification and optional diagnostics */
export const ErrorMeta = Schema.Struct({
  kind: Schema.String,
  message: Schema.optional(Schema.String),
  details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  latencyMs: Schema.optional(Schema.Number),
})

export type ResponseMeta = Schema.Schema.Type<typeof ResponseMeta>
export type ErrorMeta = Schema.Schema.Type<typeof ErrorMeta>
