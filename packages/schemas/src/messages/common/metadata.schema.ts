import * as Schema from 'effect/Schema'

/**
 * ResponseMeta - Metadata about a successful HTTP response
 *
 * Privacy & Size Constraints:
 *
 * - `bodySnippet` is truncated/sanitized before storage and transmission
 * - Sensitive headers may be excluded or redacted
 * - Full response body is stored separately if needed for debugging
 */
export const ResponseMeta = Schema.Struct({
	/**
	 * Truncated/sanitized response body preview
	 *
	 * Limited to a small size (e.g., first 1KB) for observability. Sensitive data is redacted. Full body stored
	 * separately if retention is required.
	 */
	bodySnippet: Schema.optional(Schema.String),
	/** Selected response headers (may be filtered for privacy) */
	headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	/** Request duration in milliseconds (from HttpClientPort measurement) */
	latencyMs: Schema.optional(Schema.Number),
	/** HTTP status code (2xx range for success in MVP) */
	status: Schema.Number,
})

/**
 * ErrorMeta - Metadata about a failed execution
 *
 * Privacy & Size Constraints:
 *
 * - `details` may be sanitized to remove sensitive information
 * - Stack traces and internal errors are logged separately, not transmitted in events
 * - Error messages are safe for observability (no secrets/credentials)
 */
export const ErrorMeta = Schema.Struct({
	/**
	 * Additional error context (sanitized)
	 *
	 * May include status codes, error codes, or diagnostic hints. Stack traces and sensitive data are excluded.
	 */
	details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
	/**
	 * Error classification (e.g., 'NetworkError', 'Timeout', 'HttpError', 'ValidationError')
	 *
	 * Used for metrics aggregation and retry decisions.
	 */
	kind: Schema.String,
	/** Request duration before failure in milliseconds */
	latencyMs: Schema.optional(Schema.Number),
	/** Human-readable error message (sanitized, no sensitive data) */
	message: Schema.optional(Schema.String),
})

/**
 * HTTP response metadata type
 */
export type ResponseMeta = Schema.Schema.Type<typeof ResponseMeta>

/**
 * Error metadata type
 */
export type ErrorMeta = Schema.Schema.Type<typeof ErrorMeta>
