import { describe, expect, it } from 'bun:test'

import type * as Message from '@event-service-agent/contracts/messages'
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { TimerEntry } from './timer-entry.ts'

describe('TimerEntry', () => {
	const tenantId = TenantId('tenant-123')
	const serviceCallId = ServiceCallId('service-456')
	const nowEpoch = Date.now()
	const ONE_MINUTE_MS = 60000

	const makeScheduleTimerCommand = (dueAtMs: number): Message.ScheduleTimer => ({
		dueAt: Iso8601DateTime(new Date(dueAtMs).toISOString()),
		serviceCallId,
		tenantId,
		type: 'ScheduleTimer',
	})

	describe('make', () => {
		const dueAtMs = nowEpoch + ONE_MINUTE_MS
		const now = Iso8601DateTime(new Date(nowEpoch).toISOString())

		it('creates a new schedule from ScheduleTimer command', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtMs)

			// Act
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, now)

			// Assert
			expect(scheduledTimer).toBeDefined()
			expect(scheduledTimer.state).toBe('Scheduled')
			expect(scheduledTimer.tenantId).toBe(scheduleTimerCommand.tenantId)
			expect(scheduledTimer.serviceCallId).toBe(scheduleTimerCommand.serviceCallId)
			expect(scheduledTimer.dueAt).toBe(scheduleTimerCommand.dueAt)
			expect(scheduledTimer.registeredAt).toBe(now)
			expect(scheduledTimer.correlationId).toBeUndefined()
		})

		it('preserves correlationId when provided', () => {
			const correlationId = CorrelationId('corr-123')
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtMs)

			// Act
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, now, correlationId)

			// Assert
			expect(scheduledTimer.correlationId).toBe(correlationId)
		})
	})

	describe('markReached', () => {
		const dueAtMs = nowEpoch + ONE_MINUTE_MS
		const scheduledNow = Iso8601DateTime(new Date(nowEpoch).toISOString())
		const reachedNow = Iso8601DateTime(new Date(nowEpoch + ONE_MINUTE_MS).toISOString())
		const correlationId = CorrelationId('corr-456')

		it('transitions ScheduledTimer to ReachedTimer', () => {
			// Arrange
			const scheduledTimerCommand = makeScheduleTimerCommand(dueAtMs)
			const scheduledTimer = TimerEntry.make(scheduledTimerCommand, scheduledNow)

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer.state).toBe('Reached')
			expect(reachedTimer.reachedAt).toBe(reachedNow)
		})

		it('preserves all original timer fields', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtMs)
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, scheduledNow, correlationId)

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer.tenantId).toBe(scheduledTimer.tenantId)
			expect(reachedTimer.serviceCallId).toBe(scheduledTimer.serviceCallId)
			expect(reachedTimer.dueAt).toBe(scheduledTimer.dueAt)
			expect(reachedTimer.registeredAt).toBe(scheduledTimer.registeredAt)
			expect(reachedTimer.correlationId).toBe(correlationId)
		})

		it('returns a new immutable object', () => {
			// Arrange
			const scheduleTimerCommand = makeScheduleTimerCommand(dueAtMs)
			const scheduledTimer = TimerEntry.make(scheduleTimerCommand, scheduledNow)

			// Act
			const reachedTimer = TimerEntry.markReached(scheduledTimer, reachedNow)

			// Assert
			expect(reachedTimer).not.toBe(scheduledTimer) // Different references (immutability)
		})
	})
})
