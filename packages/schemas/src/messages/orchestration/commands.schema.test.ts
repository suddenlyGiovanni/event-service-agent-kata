import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { ServiceCallId, TenantId } from '../../shared/index.ts'
import * as Orchestration from './index.ts'

describe('ScheduleTimer Command Schema', () => {
	const serviceCallId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6b' as const
	const tenantId = '01931b66-7d50-7c8a-b762-9d2d3e4e5f6a' as const
	const dueAt = '2025-10-28T12:00:00.000Z' as const

	describe('Schema Validation', () => {
		it.effect('decodes valid command with all fields', () =>
			Effect.gen(function* () {
				// Arrange: Valid wire format DTO
				const dto = {
					_tag: Orchestration.Commands.ScheduleTimer.Tag,
					dueAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Commands.ScheduleTimer.Dto

				// Act: Decode from wire format
				const command = yield* Orchestration.Commands.ScheduleTimer.decode(dto)

				// Assert: All fields validated and branded (dueAt is now DateTime.Utc)
				expect(command._tag).toBe(Orchestration.Commands.ScheduleTimer.Tag)

				expect(command.tenantId).toBe(dto.tenantId)
				expect(command.serviceCallId).toBe(dto.serviceCallId)

				expect(DateTime.isDateTime(command.dueAt)).toBe(true)
				expect(DateTime.isUtc(command.dueAt)).toBe(true)
				expect(DateTime.Equivalence(command.dueAt, DateTime.unsafeMake(dto.dueAt))).toBe(true)
			}),
		)

		it.effect('rejects invalid tenantId format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Commands.ScheduleTimer.Tag,
					dueAt,
					serviceCallId,
					tenantId: 'not-a-uuid',
				} satisfies Orchestration.Commands.ScheduleTimer.Dto

				const exit = yield* Effect.exit(Orchestration.Commands.ScheduleTimer.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid serviceCallId format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Commands.ScheduleTimer.Tag,
					dueAt,
					serviceCallId: 'not-a-uuid',
					tenantId,
				} satisfies Orchestration.Commands.ScheduleTimer.Dto

				const exit = yield* Effect.exit(Orchestration.Commands.ScheduleTimer.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects invalid dueAt format', () =>
			Effect.gen(function* () {
				const dto = {
					_tag: Orchestration.Commands.ScheduleTimer.Tag,
					dueAt: 'not-a-date',
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Commands.ScheduleTimer.Dto

				const exit = yield* Effect.exit(Orchestration.Commands.ScheduleTimer.decode(dto))
				expect(Exit.isFailure(exit)).toBe(true)
			}),
		)

		it.effect('rejects missing _tag', () =>
			Effect.gen(function* () {
				const dto = {
					dueAt,
					serviceCallId,
					tenantId,
					// @ts-expect-error Testing missing _tag
				} satisfies Orchestration.Commands.ScheduleTimer.Dto

				const exit = yield* Effect.exit(
					Orchestration.Commands.ScheduleTimer.decode(
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
					// @ts-expect-error Testing wrong _tag
					_tag: 'WrongTag',
					dueAt,
					serviceCallId,
					tenantId,
				} satisfies Orchestration.Commands.ScheduleTimer.Dto

				const exit = yield* Effect.exit(
					Orchestration.Commands.ScheduleTimer.decode(
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
				// Arrange: Construct domain command with DateTime.Utc
				const dueAt = yield* DateTime.make('2025-10-28T12:00:00.000Z')
				const original: Orchestration.Commands.ScheduleTimer.Type = new Orchestration.Commands.ScheduleTimer({
					dueAt,
					serviceCallId: ServiceCallId.make(serviceCallId),
					tenantId: TenantId.make(tenantId),
				})

				// Act: Encode to DTO (DateTime → string) then decode back (string → DateTime)
				const encoded: Orchestration.Commands.ScheduleTimer.Dto =
					yield* Orchestration.Commands.ScheduleTimer.encode(original)

				const decoded: Orchestration.Commands.ScheduleTimer.Type =
					yield* Orchestration.Commands.ScheduleTimer.decode(encoded)

				// Assert: Decoded matches original
				expect(decoded._tag).toBe(original._tag)
				expect(decoded.tenantId).toBe(original.tenantId)
				expect(decoded.serviceCallId).toBe(original.serviceCallId)

				// ✅ CORRECT: Use DateTime.Equivalence for DateTime.Utc comparison
				expect(DateTime.Equivalence(decoded.dueAt, original.dueAt)).toBe(true)
			}),
		)
	})
})
