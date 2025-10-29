import * as Schema from 'effect/Schema'

/**
 * Minimal RequestSpec schemas to match platform interfaces.
 * These are intentionally conservative and can be expanded later.
 */
export const RequestSpec = Schema.Struct({
  method: Schema.String,
  url: Schema.String,
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  body: Schema.optional(Schema.String),
})

export const RequestSpecWithoutBody = Schema.Struct({
  method: Schema.String,
  url: Schema.String,
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  bodySnippet: Schema.optional(Schema.String),
})
export type RequestSpec = Schema.Schema.Type<typeof RequestSpec>
export type RequestSpecWithoutBody = Schema.Schema.Type<typeof RequestSpecWithoutBody>
