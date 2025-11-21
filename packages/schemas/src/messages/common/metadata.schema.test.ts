import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import { ErrorMeta, ResponseMeta } from './metadata.schema.ts'

describe('Metadata Schemas', () => {
	describe('ResponseMeta', () => {
		it.effect('decodes valid metadata with required fields only', () =>
			Effect.gen(function* () {
				const dto = {
					status: 200,
				}

				const meta = yield* Schema.decode(ResponseMeta)(dto)

				expect(meta.status).toBe(200)
				expect(meta.bodySnippet).toBeUndefined()
				expect(meta.headers).toBeUndefined()
				expect(meta.latencyMs).toBeUndefined()
			}),
		)

		it.effect('decodes metadata with all optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					bodySnippet: 'Response body preview...',
					headers: {
						'Content-Type': 'application/json',
						'X-Request-Id': 'abc-123',
					},
					latencyMs: 1500,
					status: 201,
				}

				const meta = yield* Schema.decode(ResponseMeta)(dto)

				expect(meta.status).toBe(201)
				expect(meta.bodySnippet).toBe('Response body preview...')
				expect(meta.headers).toEqual({
					'Content-Type': 'application/json',
					'X-Request-Id': 'abc-123',
				})
				expect(meta.latencyMs).toBe(1500)
			}),
		)

		it.effect('rejects missing required status field', () =>
			Effect.gen(function* () {
				const dto = {
					bodySnippet: 'Response body',
				}

				const exit = yield* Effect.exit(
					Schema.decode(ResponseMeta)(
						// @ts-expect-error Testing missing required field
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid status type', () =>
			Effect.gen(function* () {
				const dto = {
					status: 'not-a-number' as unknown as number,
				}

				const exit = yield* Effect.exit(Schema.decode(ResponseMeta)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid latencyMs type', () =>
			Effect.gen(function* () {
				const dto = {
					latencyMs: 'not-a-number' as unknown as number,
					status: 200,
				}

				const exit = yield* Effect.exit(Schema.decode(ResponseMeta)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes and decodes round-trip', () =>
			Effect.gen(function* () {
				const original = {
					bodySnippet: 'Test response',
					headers: { 'Content-Type': 'text/plain' },
					latencyMs: 500,
					status: 200,
				}

				const decoded = yield* Schema.decode(ResponseMeta)(original)
				const encoded = yield* Schema.encode(ResponseMeta)(decoded)

				expect(encoded).toEqual(original)
			}),
		)
	})

	describe('ErrorMeta', () => {
		it.effect('decodes valid metadata with required fields only', () =>
			Effect.gen(function* () {
				const dto = {
					kind: 'NetworkError',
				}

				const meta = yield* Schema.decode(ErrorMeta)(dto)

				expect(meta.kind).toBe('NetworkError')
				expect(meta.message).toBeUndefined()
				expect(meta.details).toBeUndefined()
				expect(meta.latencyMs).toBeUndefined()
			}),
		)

		it.effect('decodes metadata with all optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					details: {
						retryable: false,
						statusCode: 500,
					},
					kind: 'HttpError',
					latencyMs: 5000,
					message: 'Internal Server Error',
				}

				const meta = yield* Schema.decode(ErrorMeta)(dto)

				expect(meta.kind).toBe('HttpError')
				expect(meta.message).toBe('Internal Server Error')
				expect(meta.details).toEqual({
					retryable: false,
					statusCode: 500,
				})
				expect(meta.latencyMs).toBe(5000)
			}),
		)

		it.effect('decodes various error kinds', () =>
			Effect.gen(function* () {
				const kinds = ['NetworkError', 'Timeout', 'ValidationError', 'HttpError']

				for (const kind of kinds) {
					const meta = yield* Schema.decode(ErrorMeta)({ kind })
					expect(meta.kind).toBe(kind)
				}
			}),
		)

		it.effect('rejects missing required kind field', () =>
			Effect.gen(function* () {
				const dto = {
					message: 'Some error',
				}

				const exit = yield* Effect.exit(
					Schema.decode(ErrorMeta)(
						// @ts-expect-error Testing missing required field
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid kind type', () =>
			Effect.gen(function* () {
				const dto = {
					kind: 123 as unknown as string,
				}

				const exit = yield* Effect.exit(Schema.decode(ErrorMeta)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid latencyMs type', () =>
			Effect.gen(function* () {
				const dto = {
					kind: 'Timeout',
					latencyMs: 'not-a-number' as unknown as number,
				}

				const exit = yield* Effect.exit(Schema.decode(ErrorMeta)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes and decodes round-trip', () =>
			Effect.gen(function* () {
				const original = {
					details: { code: 'ECONNREFUSED' },
					kind: 'NetworkError',
					latencyMs: 1000,
					message: 'Connection refused',
				}

				const decoded = yield* Schema.decode(ErrorMeta)(original)
				const encoded = yield* Schema.encode(ErrorMeta)(decoded)

				expect(encoded).toEqual(original)
			}),
		)
	})
})
