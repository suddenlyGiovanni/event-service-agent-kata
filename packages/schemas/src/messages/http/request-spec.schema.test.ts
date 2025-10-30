import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import { RequestSpec, RequestSpecWithoutBody } from './request-spec.schema.ts'

describe('HTTP Request Spec Schemas', () => {
	describe('RequestSpec', () => {
		it.effect('decodes valid spec with required fields only', () =>
			Effect.gen(function* () {
				const dto = {
					method: 'GET',
					url: 'https://api.example.com/endpoint',
				}

				const spec = yield* Schema.decode(RequestSpec)(dto)

				expect(spec.method).toBe('GET')
				expect(spec.url).toBe('https://api.example.com/endpoint')
				expect(spec.body).toBeUndefined()
				expect(spec.headers).toBeUndefined()
			}),
		)

		it.effect('decodes spec with all optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					body: JSON.stringify({ key: 'value' }),
					headers: {
						'Content-Type': 'application/json',
						'X-Api-Key': 'secret-key-123',
					},
					method: 'POST',
					url: 'https://api.example.com/endpoint',
				}

				const spec = yield* Schema.decode(RequestSpec)(dto)

				expect(spec.method).toBe('POST')
				expect(spec.url).toBe('https://api.example.com/endpoint')
				expect(spec.body).toBe(JSON.stringify({ key: 'value' }))
				expect(spec.headers).toEqual({
					'Content-Type': 'application/json',
					'X-Api-Key': 'secret-key-123',
				})
			}),
		)

		it.effect('decodes various HTTP methods', () =>
			Effect.gen(function* () {
				const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

				for (const method of methods) {
					const spec = yield* Schema.decode(RequestSpec)({
						method,
						url: 'https://api.example.com',
					})
					expect(spec.method).toBe(method)
				}
			}),
		)

		it.effect('rejects missing required method field', () =>
			Effect.gen(function* () {
				const dto = {
					url: 'https://api.example.com',
				}

				const exit = yield* Effect.exit(
					Schema.decode(RequestSpec)(
						// @ts-expect-error Testing missing required field
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects missing required url field', () =>
			Effect.gen(function* () {
				const dto = {
					method: 'GET',
				}

				const exit = yield* Effect.exit(
					Schema.decode(RequestSpec)(
						// @ts-expect-error Testing missing required field
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid method type', () =>
			Effect.gen(function* () {
				const dto = {
					method: 123 as unknown as string,
					url: 'https://api.example.com',
				}

				const exit = yield* Effect.exit(Schema.decode(RequestSpec)(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes and decodes round-trip', () =>
			Effect.gen(function* () {
				const original = {
					body: '{"test": true}',
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
					url: 'https://api.example.com/test',
				}

				const decoded = yield* Schema.decode(RequestSpec)(original)
				const encoded = yield* Schema.encode(RequestSpec)(decoded)

				expect(encoded).toEqual(original)
			}),
		)
	})

	describe('RequestSpecWithoutBody', () => {
		it.effect('decodes valid spec with required fields only', () =>
			Effect.gen(function* () {
				const dto = {
					method: 'GET',
					url: 'https://api.example.com/endpoint',
				}

				const spec = yield* Schema.decode(RequestSpecWithoutBody)(dto)

				expect(spec.method).toBe('GET')
				expect(spec.url).toBe('https://api.example.com/endpoint')
				expect(spec.bodySnippet).toBeUndefined()
				expect(spec.headers).toBeUndefined()
			}),
		)

		it.effect('decodes spec with all optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					bodySnippet: 'Request body preview (truncated)...',
					headers: {
						'Content-Type': 'application/json',
						'X-Request-Id': 'abc-123',
					},
					method: 'POST',
					url: 'https://api.example.com/endpoint',
				}

				const spec = yield* Schema.decode(RequestSpecWithoutBody)(dto)

				expect(spec.method).toBe('POST')
				expect(spec.url).toBe('https://api.example.com/endpoint')
				expect(spec.bodySnippet).toBe('Request body preview (truncated)...')
				expect(spec.headers).toEqual({
					'Content-Type': 'application/json',
					'X-Request-Id': 'abc-123',
				})
			}),
		)

		it.effect('has bodySnippet instead of body', () =>
			Effect.gen(function* () {
				const dto = {
					bodySnippet: 'Snippet of request body',
					method: 'POST',
					url: 'https://api.example.com',
				}

				const spec = yield* Schema.decode(RequestSpecWithoutBody)(dto)

				expect(spec.bodySnippet).toBe('Snippet of request body')
				// @ts-expect-error body should not exist on RequestSpecWithoutBody
				expect(spec.body).toBeUndefined()
			}),
		)

		it.effect('rejects missing required fields', () =>
			Effect.gen(function* () {
				const dto = {
					bodySnippet: 'Preview',
				}

				const exit = yield* Effect.exit(
					Schema.decode(RequestSpecWithoutBody)(
						// @ts-expect-error Testing missing required fields
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('encodes and decodes round-trip', () =>
			Effect.gen(function* () {
				const original = {
					bodySnippet: 'Body preview...',
					headers: { 'Content-Type': 'text/plain' },
					method: 'PUT',
					url: 'https://api.example.com/update',
				}

				const decoded = yield* Schema.decode(RequestSpecWithoutBody)(original)
				const encoded = yield* Schema.encode(RequestSpecWithoutBody)(decoded)

				expect(encoded).toEqual(original)
			}),
		)
	})

	describe('RequestSpec vs RequestSpecWithoutBody', () => {
		it.effect('RequestSpec has body field', () =>
			Effect.gen(function* () {
				const spec = yield* Schema.decode(RequestSpec)({
					body: 'Full request body',
					method: 'POST',
					url: 'https://api.example.com',
				})

				expect(spec.body).toBe('Full request body')
			}),
		)

		it.effect('RequestSpecWithoutBody has bodySnippet field', () =>
			Effect.gen(function* () {
				const spec = yield* Schema.decode(RequestSpecWithoutBody)({
					bodySnippet: 'Body snippet',
					method: 'POST',
					url: 'https://api.example.com',
				})

				expect(spec.bodySnippet).toBe('Body snippet')
			}),
		)
	})
})
