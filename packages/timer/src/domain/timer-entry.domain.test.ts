import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'

import type * as Message from '@event-service-agent/contracts/messages'
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { ScheduledTimer, TimerEntry } from './timer-entry.domain.ts'

describe('TimerEntry', () => {
	const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
	const serviceCallId = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')
	const correlationId = CorrelationId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2')

	/** Helper to create command with ISO8601 string (simulating external message) */
	const makeScheduleTimerCommand = (dueAtIso: Iso8601DateTime.Type): Message.Orchestration.Commands.ScheduleTimer => ({
		dueAt: dueAtIso,
		serviceCallId,
		tenantId,
		type: 'ScheduleTimer',
	})

	describe('Schema.decode(ScheduledTimer)', () => {
		const now = DateTime.unsafeNow()
		const dueAt = DateTime.add(now, { minutes: 1 })
		const dueAtIso = Iso8601DateTime.make(DateTime.formatIso(dueAt))
		const nowIso = DateTime.formatIso(now)

		it('creates a new schedule from ScheduleTimer command', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)

			// Act: Use Schema.decode directly
			const scheduledTimer = Schema.decodeSync(ScheduledTimer)({
				_tag: 'Scheduled' as const,
				dueAt: scheduleTimerCommand.dueAt,
				registeredAt: nowIso,
				serviceCallId: scheduleTimerCommand.serviceCallId,
				tenantId: scheduleTimerCommand.tenantId,
			})

			// Assert
			expect(scheduledTimer).toBeDefined()
			expect(scheduledTimer._tag).toBe('Scheduled')
			expect(scheduledTimer.tenantId).toBe(scheduleTimerCommand.tenantId)
			expect(scheduledTimer.serviceCallId).toBe(scheduleTimerCommand.serviceCallId)
			expect(DateTime.Equivalence(scheduledTimer.dueAt, dueAt)).toBe(true)
			expect(DateTime.Equivalence(scheduledTimer.registeredAt, now)).toBe(true)
			expect(Option.isNone(scheduledTimer.correlationId)).toBe(true)
		})

		it('preserves correlationId when provided', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)

			// Act: Use Schema.decode with correlationId
			const scheduledTimer = Schema.decodeSync(ScheduledTimer)({
				_tag: 'Scheduled' as const,
				correlationId,
				dueAt: scheduleTimerCommand.dueAt,
				registeredAt: nowIso,
				serviceCallId: scheduleTimerCommand.serviceCallId,
				tenantId: scheduleTimerCommand.tenantId,
			})

			// Assert
			expect(Option.isSome(scheduledTimer.correlationId)).toBe(true)
			expect(Option.getOrThrow(scheduledTimer.correlationId)).toBe(correlationId)
		})
	})

	describe('markReached', () => {
		const scheduledNow = DateTime.unsafeNow()
		const scheduledNowIso = DateTime.formatIso(scheduledNow)
		const dueAt = DateTime.add(scheduledNow, { minutes: 1 })
		const dueAtIso = Iso8601DateTime.make(DateTime.formatIso(dueAt))
		const reachedNow = DateTime.add(scheduledNow, { minutes: 1 })

		it('transitions ScheduledTimer to ReachedTimer', () => {
			// Arrange
			const scheduledTimerCommand = makeScheduleTimerCommand(dueAtIso)
			const scheduledTimer = Schema.decodeSync(ScheduledTimer)({
				_tag: 'Scheduled' as const,
				dueAt: scheduledTimerCommand.dueAt,
				registeredAt: scheduledNowIso,
				serviceCallId: scheduledTimerCommand.serviceCallId,
				tenantId: scheduledTimerCommand.tenantId,
			})

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer._tag).toBe('Reached')
			expect(DateTime.Equivalence(reachedTimer.reachedAt, reachedNow)).toBe(true)
		})

		it('preserves all original timer fields', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)
			const scheduledTimer = Schema.decodeSync(ScheduledTimer)({
				_tag: 'Scheduled' as const,
				correlationId,
				dueAt: scheduleTimerCommand.dueAt,
				registeredAt: scheduledNowIso,
				serviceCallId: scheduleTimerCommand.serviceCallId,
				tenantId: scheduleTimerCommand.tenantId,
			})

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer.tenantId).toBe(scheduledTimer.tenantId)
			expect(reachedTimer.serviceCallId).toBe(scheduledTimer.serviceCallId)
			expect(DateTime.Equivalence(reachedTimer.dueAt, scheduledTimer.dueAt)).toBe(true)
			expect(DateTime.Equivalence(reachedTimer.registeredAt, scheduledTimer.registeredAt)).toBe(true)
			expect(Option.isSome(reachedTimer.correlationId)).toBe(true)
			expect(Option.getOrThrow(reachedTimer.correlationId)).toBe(correlationId)
		})

		it('returns a new immutable object', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)
			const scheduledTimer = Schema.decodeSync(ScheduledTimer)({
				_tag: 'Scheduled' as const,
				dueAt: scheduleTimerCommand.dueAt,
				registeredAt: scheduledNowIso,
				serviceCallId: scheduleTimerCommand.serviceCallId,
				tenantId: scheduleTimerCommand.tenantId,
			})

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer).not.toBe(scheduledTimer) // Different references (immutability)
		})
	})

	describe('isDue', () => {
		const scheduledNow = DateTime.unsafeNow()
		const scheduledNowIso = DateTime.formatIso(scheduledNow)
		const dueAt = DateTime.add(scheduledNow, { minutes: 1 })
		const dueAtIso = Iso8601DateTime.make(DateTime.formatIso(dueAt))
		const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)
		const scheduledTimer = Schema.decodeSync(ScheduledTimer)({
			_tag: 'Scheduled' as const,
			dueAt: scheduleTimerCommand.dueAt,
			registeredAt: scheduledNowIso,
			serviceCallId: scheduleTimerCommand.serviceCallId,
			tenantId: scheduleTimerCommand.tenantId,
		})

		it('returns true when current time equals dueAt', () => {
			expect(TimerEntry.isDue(scheduledTimer, dueAt)).toBe(true)
		})

		it('returns true when current time is after dueAt', () => {
			const afterDueAt = DateTime.add(dueAt, { seconds: 5 })

			expect(TimerEntry.isDue(scheduledTimer, afterDueAt)).toBe(true)
		})

		it('returns false when current time is before dueAt', () => {
			const beforeDueAt = DateTime.subtract(dueAt, { seconds: 5 })

			expect(TimerEntry.isDue(scheduledTimer, beforeDueAt)).toBe(false)
		})
	})
})
