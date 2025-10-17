import { describe, expect, it } from '@effect/vitest'
import { assertNone } from '@effect/vitest/utils'
import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as TestClock from 'effect/TestClock'

import type * as Messages from '@event-service-agent/contracts/messages'
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { ClockPortTest } from '#/adapters/clock.adapter.ts'
import { TimerPersistence } from '#/adapters/timer-persistence.adapter.ts'
import { TimerEntry } from '#/domain/timer-entry.domain.ts'
import { ClockPort } from '#/ports/clock.port.ts'
import { PersistenceError, TimerPersistencePort } from '#/ports/timer-persistence.port.ts'

import { scheduleTimerWorkflow } from './schedule-timer.workflow.ts'

describe('scheduleTimerWorkflow', () => {
	const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
	const serviceCallId = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')
	const correlationId = CorrelationId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2')

	describe('Happy Path', () => {
		// Given: Valid ScheduleTimer command
		// When: Workflow executes
		// Then: TimerEntry persisted with correct values

		it.effect('should create and persist timer entry', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				// TODO: the construction of the command as a object literal is not ideal.
				// 			I should consider adding a schema validation step here to ensure the command is well-formed.
				// 			If the command is valid, then the domain layer should be able to handle it without having to do any validation.
				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				// Arrange: Mock dependencies (ClockPort, TimerPersistencePort)
				// 	- ClockPort.now() returns fixed time
				const persistence = yield* TimerPersistencePort

				// Act: Execute workflow with sample command
				yield* scheduleTimerWorkflow({ command })
				yield* TestClock.adjust('4 minutes')

				// Assert: TimerEntry persisted with correct values
				const maybeScheduledTimer = yield* persistence.findScheduledTimer(tenantId, serviceCallId)

				expect(Option.isSome(maybeScheduledTimer)).toBe(true)

				const timer = Option.getOrThrow(maybeScheduledTimer)
				expect(timer.tenantId).toBe(tenantId)
				expect(timer.serviceCallId).toBe(serviceCallId)

				expect(DateTime.Equivalence(timer.dueAt, DateTime.unsafeMake(dueAt))).toBe(true)
			}).pipe(
				// Merge layers to avoid lifecycle issues
				Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest)),
			),
		)

		it.effect('should use current time for registeredAt', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				// dueAt is 5 minutes from now
				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				const persistence = yield* TimerPersistencePort

				// Act
				yield* scheduleTimerWorkflow({ command })
				yield* TestClock.adjust('4 minutes')

				// Assert: registeredAt should equal clock.now()
				const maybeScheduledTimer = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
				const timer = Option.getOrThrow(maybeScheduledTimer)

				expect(DateTime.Equivalence(timer.registeredAt, now)).toBe(true)
			}).pipe(Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest))),
		)

		it.effect('should set status to `Scheduled`', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				const persistence = yield* TimerPersistencePort

				// Act
				yield* scheduleTimerWorkflow({ command })
				yield* TestClock.adjust('4 minutes')

				// Assert: status should be 'Scheduled'
				const maybeScheduledTimer = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
				expect(Option.isSome(maybeScheduledTimer)).toBe(true)

				const timer = Option.getOrThrow(maybeScheduledTimer)
				expect(TimerEntry.isScheduled(timer)).toBe(true)
			}).pipe(Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest))),
		)
	})

	describe('Metadata', () => {
		// Given: Command with correlationId
		// When: Workflow executes
		// Then: CorrelationId included in persisted entry

		it.effect('should include correlationId when provided', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				const persistence = yield* TimerPersistencePort

				// Act: Pass correlationId to workflow
				yield* scheduleTimerWorkflow({ command, correlationId })
				yield* TestClock.adjust('4 minutes')

				// Assert: correlationId should be Some(correlationId)
				const maybeScheduledTimer = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
				const timer = Option.getOrThrow(maybeScheduledTimer)

				expect(Option.isSome(timer.correlationId)).toBe(true)
				expect(Option.getOrThrow(timer.correlationId)).toBe(correlationId)
			}).pipe(Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest))),
		)

		it.effect('should work without correlationId', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				const persistence = yield* TimerPersistencePort

				// Act: Don't pass correlationId
				yield* scheduleTimerWorkflow({ command })
				yield* TestClock.adjust('4 minutes')

				// Assert: correlationId should be None
				const maybeScheduledTimer = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
				const timer = Option.getOrThrow(maybeScheduledTimer)

				expect(Option.isNone(timer.correlationId)).toBe(true)
			}).pipe(Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest))),
		)
	})

	describe('Edge Cases', () => {
		// Given: ScheduleTimer with dueAt in past
		// When: Workflow executes
		// Then: Timer still persisted (no fast-path logic)

		it.effect('should persist timer even if already due', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const persistence = yield* TimerPersistencePort
				const now = yield* clock.now()

				// Set dueAt to 5 minutes in the PAST
				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.subtract({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				// Act:
				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer
				yield* scheduleTimerWorkflow({ command })

				// Assert: Timer should still be persisted (no fast-path optimization)
				const maybeScheduledTimer = yield* persistence.find(tenantId, serviceCallId)

				expect(Option.isSome(maybeScheduledTimer)).toBe(true)
				const timer = Option.getOrThrow(maybeScheduledTimer)
				expect(timer._tag).toBe('Scheduled')
				expect(DateTime.lessThan(timer.dueAt, now)).toBe(true) // Verify dueAt is in past
			}).pipe(Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest))),
		)
	})

	describe('Idempotency', () => {
		// Given: Same command executed twice
		// When: Both workflow invocations run
		// Then: Both succeed (port handles upsert)

		it.effect('should succeed when called multiple times', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				const persistence = yield* TimerPersistencePort

				// Act: Execute workflow TWICE with same command
				yield* scheduleTimerWorkflow({ command, correlationId })
				yield* TestClock.adjust('1 second')
				yield* scheduleTimerWorkflow({ command }) // Should not fail (upsert semantics)

				// Assert: Timer exists (second call didn't error)
				const maybeScheduledTimer = yield* persistence.findScheduledTimer(tenantId, serviceCallId)

				expect(Option.isSome(maybeScheduledTimer)).toBe(true)

				const timer = Option.getOrThrow(maybeScheduledTimer)

				assertNone(timer.correlationId) // correlationId should be None as the second call didn't pass it and it overrides the first call's value

				expect(DateTime.Equivalence(timer.registeredAt, DateTime.add(now, { seconds: 1 }))).toBe(true)
			}).pipe(Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest))),
		)
	})

	describe('Error Handling', () => {
		// Given: TimerPersistencePort throws PersistenceError
		// When: Workflow executes
		// Then: Error propagates to caller
		it.effect('should propagate persistence errors', () =>
			Effect.gen(function* () {
				const clock = yield* ClockPort
				const now = yield* clock.now()

				const dueAt: Iso8601DateTime.Type = pipe(
					now,
					DateTime.add({ minutes: 5 }),
					DateTime.formatIso,
					Iso8601DateTime.make,
				)

				const command = {
					dueAt,
					serviceCallId,
					tenantId,
					type: 'ScheduleTimer',
				} satisfies Messages.Orchestration.Commands.ScheduleTimer

				// Act & Assert: Workflow should fail with PersistenceError
				const result = yield* Effect.either(scheduleTimerWorkflow({ command }))

				expect(Either.isLeft(result)).toBe(true)
				if (Either.isLeft(result)) {
					expect(result.left._tag).toBe('PersistenceError')
					if (result.left._tag === 'PersistenceError') {
						expect(result.left.operation).toBe('save')
					}
				}
			}).pipe(
				Effect.provide(
					Layer.merge(
						// Create a failing persistence layer inline
						Layer.succeed(
							TimerPersistencePort,
							TimerPersistencePort.of({
								delete: () => Effect.void,
								find: () => Effect.succeed(Option.none()),
								findDue: () => Effect.succeed(Chunk.empty()),
								findScheduledTimer: () => Effect.succeed(Option.none()),
								markFired: () => Effect.void,
								save: () =>
									Effect.fail(
										new PersistenceError({
											cause: 'Simulated database failure',
											operation: 'save',
										}),
									),
							}),
						),
						ClockPortTest,
					),
				),
			),
		)

		// Given: Invalid ISO8601 dueAt
		// When: Workflow tries to create TimerEntry
		// Then: Domain model validation fails
		// NOTE: This test is skipped because DateTime.unsafeMake throws on invalid input.
		//       To properly handle this, we'd need to add Schema validation to the workflow input
		//       or use DateTime.make (safe constructor) in TimerEntry.make.
		//       Tracking as TODO in workflow implementation.
		it.skip('should fail on invalid dueAt format', () => {})
	})
})
