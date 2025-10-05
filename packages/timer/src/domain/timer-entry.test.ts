import { describe, expect, it } from 'bun:test'

import type * as Message from '@event-service-agent/contracts/messages'
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { TimerEntry } from './timer-entry.ts'

describe('TimerEntry', () => {
	const tenantId = TenantId('tenant-123')
	const serviceCallId = ServiceCallId('service-456')
	const nowEpoch = Date.now()
	const ONE_MINUTE_MS = 60000

	const createCommand = (dueAtMs: number, correlationId?: string): Message.ScheduleTimer => ({
		dueAt: Iso8601DateTime(new Date(dueAtMs).toISOString()),
		serviceCallId,
		tenantId,
		type: 'ScheduleTimer',
		...(correlationId && { correlationId: CorrelationId(correlationId) }),
	})

	describe('make', () => {
		const dueAtMs = nowEpoch + ONE_MINUTE_MS
		const now = Iso8601DateTime(new Date(nowEpoch).toISOString())

		it('creates a new schedule from ScheduleTimer command', () => {
			// Arrange
			const command = createCommand(dueAtMs)

			// Act
			const timer = TimerEntry.make(command, now)

			// Assert
			expect(timer).toBeDefined()
			expect(timer.state).toBe('Scheduled')
			expect(timer.tenantId).toBe(command.tenantId)
			expect(timer.serviceCallId).toBe(command.serviceCallId)
			expect(timer.dueAt).toBe(command.dueAt)
			expect(timer.registeredAt).toBe(now)
			expect(timer.correlationId).toBeUndefined()
		})

		it('preserves correlationId when provided', () => {
			// Arrange
			const command = createCommand(dueAtMs, 'corr-123')

			// Act
			const timer = TimerEntry.make(command, now)

			// Assert
			expect(timer.correlationId).toBe(CorrelationId('corr-123'))
		})
	})

	it.todo('has Scheduled state initially', () => {})
	it.todo('transitions to Reached when marked', () => {})
	it.todo('includes tenantId and serviceCallId as identity', () => {})
	it.todo('stores dueAt timestamp', () => {})
	it.todo('captures registeredAt on creation', () => {})
	it.todo('stores correlationId for tracing', () => {})
})
