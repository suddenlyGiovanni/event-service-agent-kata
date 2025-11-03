import { describe, expect, expectTypeOf, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import * as Api from './index.ts'

describe('SubmitServiceCall Command Schema', () => {
	// Extract test data constants
	const dueAt = '2025-10-28T12:00:00.000Z'
	const tenantId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a'
	const name = 'Test Service Call'
	const requestSpec = {
		body: JSON.stringify({ key: 'value' }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST' as const,
		url: 'https://api.example.com/endpoint',
	}

	describe('Schema Validation', () => {
		it.effect('decodes valid command with all required fields', () =>
			Effect.gen(function* () {
				// Arrange: Valid wire format DTO
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					name,
					requestSpec,
					tenantId,
				} satisfies Api.Commands.SubmitServiceCall.Dto

				// Act: Decode from wire format
				const command: Api.Commands.SubmitServiceCall.Type = yield* Api.Commands.SubmitServiceCall.decode(dto)

				// Assert: All fields validated (dueAt is now DateTime.Utc)
				expectTypeOf(command).toEqualTypeOf<Api.Commands.SubmitServiceCall.Type>()
				expect(command._tag).toBe(Api.Commands.SubmitServiceCall.Tag)
				expect(command.tenantId).toBe(dto.tenantId)
				expect(command.name).toBe(dto.name)

				// ✅ CORRECT: Test domain type (DateTime.Utc), not encoded format
				expect(DateTime.isDateTime(command.dueAt)).toBe(true)
				expect(DateTime.isUtc(command.dueAt)).toBe(true)

				expect(command.requestSpec.url).toBe(dto.requestSpec.url)
				expect(command.requestSpec.method).toBe(dto.requestSpec.method)
			}),
		)

		it.effect('decodes command with optional fields', () =>
			Effect.gen(function* () {
				const idempotencyKey = 'unique-key-123'
				const tags = ['urgent', 'production']

				// Arrange: Valid DTO with optional fields
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					idempotencyKey,
					name,
					requestSpec,
					tags,
					tenantId,
				} satisfies Api.Commands.SubmitServiceCall.Dto

				const command: Api.Commands.SubmitServiceCall.Type = yield* Api.Commands.SubmitServiceCall.decode(dto)

				expectTypeOf(command).toEqualTypeOf<Api.Commands.SubmitServiceCall.Type>()
				expect(command.idempotencyKey).toBe(idempotencyKey)
				expect(command.tags).toEqual(tags)
			}),
		)

		it.effect('decodes command without optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					name,
					requestSpec,
					tenantId,
				} satisfies Api.Commands.SubmitServiceCall.Dto

				const command: Api.Commands.SubmitServiceCall.Type = yield* Api.Commands.SubmitServiceCall.decode(dto)

				expectTypeOf(command).toEqualTypeOf<Api.Commands.SubmitServiceCall.Type>()
				expect(command.idempotencyKey).toBeUndefined()
				expect(command.tags).toBeUndefined()
			}),
		)

		it.effect('rejects invalid tenantId format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					name: 'Test',
					requestSpec: {
						body: '{}',
						method: 'POST' as const,
						url: 'https://api.example.com',
					},
					tenantId: 'not-a-uuid',
				} as Api.Commands.SubmitServiceCall.Dto

				const exit = yield* Effect.exit(Api.Commands.SubmitServiceCall.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid dueAt format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt: 'not-a-date',
					name: 'Test',
					requestSpec: {
						body: '{}',
						method: 'POST' as const,
						url: 'https://api.example.com',
					},
					tenantId,
				} as Api.Commands.SubmitServiceCall.Dto

				const exit = yield* Effect.exit(Api.Commands.SubmitServiceCall.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects missing required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					tenantId,
				}

				const exit = yield* Effect.exit(
					Api.Commands.SubmitServiceCall.decode(
						// @ts-expect-error Testing missing fields
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid requestSpec (missing required fields)', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					name: 'Test',
					requestSpec: {
						// Missing method and url
						body: '{}',
					},
					tenantId,
				}

				const exit = yield* Effect.exit(
					Api.Commands.SubmitServiceCall.decode(
						// @ts-expect-error Testing invalid requestSpec
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})

	describe('Encoding', () => {
		it.effect('encodes domain instance to DTO', () =>
			Effect.gen(function* () {
				// Arrange: Create domain instance via decode
				const domainCommand: Api.Commands.SubmitServiceCall.Type = yield* Api.Commands.SubmitServiceCall.decode({
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					name,
					requestSpec,
					tenantId,
				} satisfies Api.Commands.SubmitServiceCall.Dto)

				// Act: Encode back to DTO
				const dto: Api.Commands.SubmitServiceCall.Dto = yield* Api.Commands.SubmitServiceCall.encode(domainCommand)

				// Assert: DTO matches original structure
				expectTypeOf(dto).toEqualTypeOf<Api.Commands.SubmitServiceCall.Dto>()
				expect(dto._tag).toBe(Api.Commands.SubmitServiceCall.Tag)
				expect(dto.tenantId).toBe(tenantId)
				expect(dto.name).toBe(name)
			}),
		)
	})

	describe('Union Type', () => {
		it.effect('Commands union accepts SubmitServiceCall', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Api.Commands.SubmitServiceCall.Tag,
					dueAt,
					name: 'Test',
					requestSpec: {
						body: '{}',
						method: 'POST' as const,
						url: 'https://api.example.com',
					},
					tenantId,
				} satisfies Api.Commands.SubmitServiceCall.Dto

				const command = yield* Schema.decode(Api.Commands.Commands)(dto)
				expect(command._tag).toBe(Api.Commands.SubmitServiceCall.Tag)
			}),
		)
	})
})
