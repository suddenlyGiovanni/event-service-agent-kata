/**
 * Schedule Timer Workflow
 *
 * Processes ScheduleTimer commands from the Orchestration module. This workflow creates a new timer aggregate in
 * Scheduled state, persisting it for future polling and firing.
 *
 * **Architecture Pattern**: Command-triggered workflow
 *
 * - Input: ScheduleTimer command (from Orchestration module)
 * - Output: Persisted ScheduledTimer aggregate (no event published yet)
 * - Idempotency: Handled by persistence layer (upsert on tenantId + serviceCallId)
 *
 * **Context Requirements**: This workflow requires MessageMetadata to be provisioned by the command handler:
 *
 * - CorrelationId: Traces back to originating request (e.g., user API call)
 * - CausationId: Identifies the envelope that triggered this workflow
 *
 * The handler extracts metadata from the command envelope and passes it via Effect.provideService, enabling full
 * distributed tracing.
 *
 * **Design Decision — Why MessageMetadata via Context**: We pass MessageMetadata through Effect Context rather than as
 * a workflow parameter because it represents cross-cutting infrastructure concern (tracing), not domain data. This
 * keeps the workflow signature focused on domain inputs (the command).
 *
 * Alternative considered: Pass metadata as workflow parameter
 *
 * - Rejected because: Mixes domain concerns with infrastructure concerns
 * - Benefit of Context approach: Clear separation, workflow signature stays pure
 *
 * @see docs/design/modules/timer.md — Timer module responsibilities
 * @see docs/decisions/ADR-0006-idempotency.md — Idempotency strategy
 */

import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { MessageMetadata } from '@event-service-agent/platform/context'
import type * as Messages from '@event-service-agent/schemas/messages'

import * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * Schedule a timer to fire at a specified future time
 *
 * See file-level documentation above for comprehensive details on:
 *
 * - Architecture pattern and workflow steps
 * - Idempotency strategy
 * - Error handling approach
 * - MessageMetadata Context requirements
 */
export const scheduleTimerWorkflow = Effect.fn('Timer.ScheduleTimer')(function* (
	command: Messages.Orchestration.Commands.ScheduleTimer,
): Effect.fn.Return<void, Ports.PersistenceError, Ports.TimerPersistencePort | Ports.ClockPort | MessageMetadata> {
	const { causationId, correlationId } = yield* MessageMetadata
	const clock = yield* Ports.ClockPort
	const persistence = yield* Ports.TimerPersistencePort

	yield* Effect.annotateCurrentSpan({
		causationId: Option.getOrUndefined(causationId),
		correlationId: Option.getOrUndefined(correlationId),
		dueAt: command.dueAt,
		serviceCallId: command.serviceCallId,
		tenantId: command.tenantId,
	})

	const registeredAt = yield* clock.now()

	const scheduledTimer = new Domain.ScheduledTimer({
		correlationId,
		dueAt: command.dueAt,
		registeredAt,
		serviceCallId: command.serviceCallId,
		tenantId: command.tenantId,
	})

	yield* persistence.save(scheduledTimer)
})
