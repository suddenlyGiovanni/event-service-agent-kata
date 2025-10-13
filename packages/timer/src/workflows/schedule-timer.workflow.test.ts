import { describe, it } from 'bun:test'

import { scheduleTimerWorkflow } from './schedule-timer.workflow.ts'

describe('scheduleTimerWorkflow', () => {
	describe('Happy Path', () => {
		// Given: Valid ScheduleTimer command
		// When: Workflow executes
		// Then: TimerEntry persisted with correct values

		it.todo('should create and persist timer entry', () => {})

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
