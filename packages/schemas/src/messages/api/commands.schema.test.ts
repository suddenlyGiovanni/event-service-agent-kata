import { describe, expect, expectTypeOf, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import * as Commands from './commands.schema.ts'

describe('SubmitServiceCall Command Schema', () => {
	describe('Schema Validation', () => {
		it.effect('decodes valid command with all required fields', () =>
			Effect.gen(function* () {
				// Arrange: Valid wire format DTO
				const dto = {
					_tag: 'SubmitServiceCall',
					dueAt: '2025-10-28T12:00:00.000Z',
					name: 'Test Service Call',
					requestSpec: {
						body: JSON.stringify({ key: 'value' }),
						headers: { 'Content-Type': 'application/json' },
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				} satisfies Commands.SubmitServiceCall.Dto

				// Act: Decode from wire format
				const command = yield* Commands.SubmitServiceCall.decode(dto)

				// Assert: All fields validated (dueAt is now DateTime.Utc)
				expectTypeOf(command).toEqualTypeOf<Commands.SubmitServiceCall.Type>()
				expect(command._tag).toBe('SubmitServiceCall')
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
					_tag: 'SubmitServiceCall',
					dueAt: '2025-10-28T12:00:00.000Z',
					idempotencyKey,
					name: 'Test Service Call',
					requestSpec: {
						body: JSON.stringify({ key: 'value' }),
						headers: { 'Content-Type': 'application/json' },
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					tags,
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				} satisfies Commands.SubmitServiceCall.Dto

				const command = yield* Commands.SubmitServiceCall.decode(dto)

				expectTypeOf(command).toEqualTypeOf<Commands.SubmitServiceCall.Type>()
				expect(command.idempotencyKey).toBe(idempotencyKey)
				expect(command.tags).toEqual(tags)
			}),
		)

		it.effect('decodes command without optional fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'SubmitServiceCall' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					name: 'Test Service Call',
					requestSpec: {
						body: JSON.stringify({ key: 'value' }),
						headers: { 'Content-Type': 'application/json' },
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				} satisfies Commands.SubmitServiceCall.Dto

				const command = yield* Commands.SubmitServiceCall.decode(dto)

				expectTypeOf(command).toEqualTypeOf<Commands.SubmitServiceCall.Type>()
				expect(command.idempotencyKey).toBeUndefined()
				expect(command.tags).toBeUndefined()
			}),
		)

		it.effect('rejects invalid tenantId format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'SubmitServiceCall' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					name: 'Test',
					requestSpec: {
						body: '{}',
						method: 'POST',
						url: 'https://api.example.com',
					},
					tenantId: 'not-a-uuid',
				} satisfies Commands.SubmitServiceCall.Dto

				const exit = yield* Effect.exit(Commands.SubmitServiceCall.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid dueAt format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'SubmitServiceCall' as const,
					dueAt: 'not-a-date',
					name: 'Test',
					requestSpec: {
						body: '{}',
						method: 'POST',
						url: 'https://api.example.com',
					},
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				} satisfies Commands.SubmitServiceCall.Dto

				const exit = yield* Effect.exit(Commands.SubmitServiceCall.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects missing required fields', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'SubmitServiceCall' as const,
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(
					Commands.SubmitServiceCall.decode(
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
					_tag: 'SubmitServiceCall' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					name: 'Test',
					requestSpec: {
						// Missing method and url
						body: '{}',
					},
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(
					Commands.SubmitServiceCall.decode(
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
				const domainCommand = yield* Commands.SubmitServiceCall.decode({
					_tag: 'SubmitServiceCall' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					name: 'Test Service Call',
					requestSpec: {
						body: JSON.stringify({ key: 'value' }),
						method: 'POST',
						url: 'https://api.example.com/endpoint',
					},
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				})

				// Act: Encode back to DTO
				const dto = yield* Commands.SubmitServiceCall.encode(domainCommand)

				// Assert: DTO matches original structure
				expectTypeOf(dto).toEqualTypeOf<Commands.SubmitServiceCall.Dto>()
				expect(dto._tag).toBe('SubmitServiceCall')
				expect(dto.tenantId).toBe('01931b66-7d50-7c8a-b762-9d2d3e4e5f6a')
				expect(dto.name).toBe('Test Service Call')
			}),
		)
	})

	describe('Union Type', () => {
		it.effect('Commands union accepts SubmitServiceCall', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'SubmitServiceCall' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					name: 'Test',
					requestSpec: {
						body: '{}',
						method: 'POST',
						url: 'https://api.example.com',
					},
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const command = yield* Schema.decode(Commands.Commands)(dto)
				expect(command._tag).toBe('SubmitServiceCall')
			}),
		)
	})
})
