/**
 * HTTP Types
 *
 * Shared types for HTTP request specifications.
 * Used across commands and events for consistent request handling.
 */

/**
 * HTTP methods supported by the system
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * RequestSpec - Specification for an HTTP request
 */
export interface RequestSpec {
	readonly method: HttpMethod
	readonly url: string
	readonly headers?: Record<string, string>
	readonly body?: string
}

/**
 * RequestSpecWithoutBody - RequestSpec for logging/tracing without full body
 *
 * Used in events and execution commands where the full body should not be
 * logged or transmitted. Instead, a bodySnippet can be included for debugging.
 *
 * ⚠️ WARNING: This type is ONLY for logging/tracing/debugging purposes.
 * It MUST NOT be used for actual HTTP request execution, as the full body
 * is not available and cannot be reconstructed from bodySnippet.
 * If you need to execute a request, use RequestSpec instead.
 */
export type RequestSpecWithoutBody = Omit<RequestSpec, 'body'> & {
	/**
	 * Optional snippet of the body for debugging/logging purposes.
	 * This is NOT the full body and cannot be used for request execution.
	 */
	readonly bodySnippet?: string
}
