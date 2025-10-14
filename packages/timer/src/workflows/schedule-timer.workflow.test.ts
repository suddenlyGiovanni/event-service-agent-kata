import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import type * as Messages from '@event-service-agent/contracts/messages'
import { Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { ClockPortTest } from '#/adapters/clock.adapter.ts'
import {  TimerPersistence } from '#/adapters/timer-persistence.adapter.ts'
import { ClockPort } from '#/ports/clock.port.ts'
import { TimerPersistencePort } from '#/ports/timer-persistence.port.ts'

import { scheduleTimerWorkflow } from './schedule-timer.workflow.ts'

describe('scheduleTimerWorkflow', () => {
	describe('Happy Path', () => {
		// Given: Valid ScheduleTimer command
		// When: Workflow executes
		// Then: TimerEntry persisted with correct values

		it.effect('should create and persist timer entry', () =>
			Effect.gen(function* () {
				const tenantId = yield* TenantId.decodeEither('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
				const serviceCallId = yield* ServiceCallId.decodeEither('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')
				// const correlationId = yield* CorrelationId.decodeEither('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2')

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

				// Assert: TimerEntry persisted with correct values
				const maybeScheduledTimer = yield* persistence.find(tenantId, serviceCallId)

				expect(Option.isSome(maybeScheduledTimer)).toBe(true)

				const timer = Option.getOrThrow(maybeScheduledTimer)
				expect(timer.tenantId).toBe(tenantId)
				expect(timer.serviceCallId).toBe(serviceCallId)
				expect(timer._tag).toBe('Scheduled')
				expect(DateTime.Equivalence(timer.dueAt, DateTime.unsafeMake(dueAt))).toBe(true)
				expect(DateTime.Equivalence(timer.registeredAt, now)).toBe(true)
			}).pipe(
				// Merge layers to avoid lifecycle issues
				Effect.provide(Layer.merge(TimerPersistence.inMemory, ClockPortTest)),
			),
		)

		it.todo('should use current time for registeredAt', () => {})

		it.todo('should set status to `Scheduled`', () => {})
	})

	describe('Metadata', () => {
		// Given: Command with correlationId
		// When: Workflow executes
		// Then: CorrelationId included in persisted entry

		it.todo('should include correlationId when provided', () => {})

		it.todo('should work without correlationId', () => {})
	})

	describe('Edge Cases', () => {
		// Given: ScheduleTimer with dueAt in past
		// When: Workflow executes
		// Then: Timer still persisted (no fast-path logic)

		it.todo('should persist timer even if already due', () => {})
	})

	describe('Idempotency', () => {
		// Given: Same command executed twice
		// When: Both workflow invocations run
		// Then: Both succeed (port handles upsert)

		it.todo('should succeed when called multiple times', () => {})
	})

	describe('Error Handling', () => {
		// Given: TimerPersistencePort throws PersistenceError
		// When: Workflow executes
		// Then: Error propagates to caller
		it.todo('should propagate persistence errors', () => {})

		// Given: Invalid ISO8601 dueAt
		// When: Workflow tries to create TimerEntry
		// Then: Domain model validation fails
		it.todo('should fail on invalid dueAt format', () => {})
	})
})
