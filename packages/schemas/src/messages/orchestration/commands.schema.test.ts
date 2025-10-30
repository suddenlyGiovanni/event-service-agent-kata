import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { ServiceCallId, TenantId } from '../../shared/index.ts'
import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import * as Commands from './commands.schema.ts'

describe('ScheduleTimer Command Schema', () => {
	describe('Schema Validation', () => {
		it.effect('decodes valid command with all fields', () =>
			Effect.gen(function* () {
				// Arrange: Valid wire format DTO
				const dto = {
					_tag: 'ScheduleTimer' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				// Act: Decode from wire format
				const command = yield* Commands.ScheduleTimer.decode(dto)

				// Assert: All fields validated and branded
				expect(command._tag).toBe('ScheduleTimer')
				expect(command.tenantId).toBe(dto.tenantId)
				expect(command.serviceCallId).toBe(dto.serviceCallId)
				expect(command.dueAt).toBe(dto.dueAt)
			}),
		)

		it.effect('rejects invalid tenantId format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ScheduleTimer' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: 'not-a-uuid',
				}

				const exit = yield* Effect.exit(Commands.ScheduleTimer.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid serviceCallId format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ScheduleTimer' as const,
					dueAt: '2025-10-28T12:00:00.000Z',
					serviceCallId: 'not-a-uuid',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Commands.ScheduleTimer.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid dueAt format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'ScheduleTimer' as const,
					dueAt: 'not-a-date',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(Commands.ScheduleTimer.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects missing _tag', () =>
			Effect.gen(function* () {
				const dto = {
					dueAt: '2025-10-28T12:00:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(
					Commands.ScheduleTimer.decode(
						//@ts-expect-error Testing missing _tag
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects wrong _tag', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: 'WrongTag',
					dueAt: '2025-10-28T12:00:00.000Z',
					serviceCallId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b',
					tenantId: '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a',
				}

				const exit = yield* Effect.exit(
					Commands.ScheduleTimer.decode(
						// @ts-expect-error Testing wrong _tag
						dto,
					),
				)
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)
	})

	describe('Round-trip Encoding', () => {
		it.effect('survives encode → decode round-trip', () =>
			Effect.gen(function* () {
				// Arrange: Construct domain command
				const original = new Commands.ScheduleTimer({
					dueAt: Iso8601DateTime.make('2025-10-28T12:00:00.000Z'),
					serviceCallId: ServiceCallId.make('01931b66-7d50-7c8a-b762-9d2d3e4e5f6b'),
					tenantId: TenantId.make('01931b66-7d50-7c8a-b762-9d2d3e4e5f6a'),
				})

				// Act: Encode to DTO then decode back
				const encoded = yield* Commands.ScheduleTimer.encode(original)
				const decoded = yield* Commands.ScheduleTimer.decode(encoded)

				// Assert: Decoded matches original
				expect(decoded._tag).toBe(original._tag)
				expect(decoded.tenantId).toBe(original.tenantId)
				expect(decoded.serviceCallId).toBe(original.serviceCallId)
				expect(decoded.dueAt).toBe(original.dueAt)
			}),
		)
	})
})
