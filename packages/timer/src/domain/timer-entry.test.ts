import { describe, expect, it } from 'bun:test'

import type * as Message from '@event-service-agent/contracts/messages'
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'

import { TimerEntry } from './timer-entry.ts'

describe('TimerEntry', () => {
	const tenantId = TenantId('tenant-123')
	const serviceCallId = ServiceCallId('service-456')
	const correlationId = CorrelationId('corr-123')

	/** Helper to create command with ISO8601 string (simulating external message) */
	const makeScheduleTimerCommand = (dueAtIso: Iso8601DateTime): Message.ScheduleTimer => ({
		dueAt: dueAtIso,
		serviceCallId,
		tenantId,
		type: 'ScheduleTimer',
	})

	describe('make', () => {
		const now = DateTime.unsafeNow()
		const dueAt = DateTime.add(now, { minutes: 1 })
		const dueAtIso = Iso8601DateTime(DateTime.formatIso(dueAt))

		it('creates a new schedule from ScheduleTimer command', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)

			// Act
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, now)

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

			// Act
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, now, correlationId)

			// Assert
			expect(Option.isSome(scheduledTimer.correlationId)).toBe(true)
			expect(Option.getOrThrow(scheduledTimer.correlationId)).toBe(correlationId)
		})
	})

	describe('markReached', () => {
		const scheduledNow = DateTime.unsafeNow()
		const dueAt = DateTime.add(scheduledNow, { minutes: 1 })
		const dueAtIso = Iso8601DateTime(DateTime.formatIso(dueAt))
		const reachedNow = DateTime.add(scheduledNow, { minutes: 1 })

		it('transitions ScheduledTimer to ReachedTimer', () => {
			// Arrange
			const scheduledTimerCommand = makeScheduleTimerCommand(dueAtIso)
			const scheduledTimer = TimerEntry.make(scheduledTimerCommand, scheduledNow)

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer._tag).toBe('Reached')
			expect(DateTime.Equivalence(reachedTimer.reachedAt, reachedNow)).toBe(true)
		})

		it('preserves all original timer fields', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, scheduledNow, correlationId)

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
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, scheduledNow)

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer).not.toBe(scheduledTimer) // Different references (immutability)
		})
	})

	describe('isDue', () => {
		const scheduledNow = DateTime.unsafeNow()
		const dueAt = DateTime.add(scheduledNow, { minutes: 1 })
		const dueAtIso = Iso8601DateTime(DateTime.formatIso(dueAt))
		const scheduleTimerCommand = makeScheduleTimerCommand(dueAtIso)
		const scheduledTimer = TimerEntry.make(scheduleTimerCommand, scheduledNow)

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
