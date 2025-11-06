/**
 * Schedule Timer Workflow
 *
 * Processes ScheduleTimer commands from the Orchestration module. This workflow
 * creates a new timer aggregate in Scheduled state, persisting it for future
 * polling and firing.
 *
 * **Architecture Pattern**: Command-triggered workflow
 * - Input: ScheduleTimer command (from Orchestration module)
 * - Output: Persisted ScheduledTimer aggregate (no event published yet)
 * - Idempotency: Handled by persistence layer (upsert on tenantId + serviceCallId)
 *
 * **Context Requirements**:
 * This workflow requires MessageMetadata to be provisioned by the command handler:
 * - correlationId: Traces back to originating request (e.g., user API call)
 * - causationId: Identifies the envelope that triggered this workflow
 *
 * The handler extracts metadata from the command envelope and passes it via
 * Effect.provideService, enabling full distributed tracing.
 *
 * **Design Decision — Why MessageMetadata via Context**:
 * We pass MessageMetadata through Effect Context rather than as a workflow parameter
 * because it represents cross-cutting infrastructure concern (tracing), not domain
 * data. This keeps the workflow signature focused on domain inputs (the command).
 *
 * Alternative considered: Pass metadata as workflow parameter
 * - Rejected because: Mixes domain concerns with infrastructure concerns
 * - Benefit of Context approach: Clear separation, workflow signature stays pure
 *
 * @see docs/design/modules/timer.md — Timer module responsibilities
 * @see docs/decisions/ADR-0006-idempotency.md — Idempotency strategy
 */

import * as Effect from 'effect/Effect'

import { MessageMetadata } from '@event-service-agent/platform/context'
import type * as Messages from '@event-service-agent/schemas/messages'

import * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * Schedule a timer to fire at a specified future time
 *
 * Creates a ScheduledTimer aggregate and persists it. The timer will be picked
 * up by the polling workflow when its dueAt time is reached.
 *
 * **Workflow Steps**:
 * 1. Extract MessageMetadata from Context (correlationId, causationId for tracing)
 * 2. Get current time for registeredAt timestamp
 * 3. Create ScheduledTimer aggregate with all domain data
 * 4. Persist timer (upsert based on tenantId + serviceCallId)
 *
 * **Idempotency**: Persistence layer handles idempotency via upsert. Calling
 * this workflow multiple times with the same (tenantId, serviceCallId) will
 * update the timer with new values (dueAt, registeredAt, correlationId).
 *
 * **Error Handling**:
 * - PersistenceError: Propagated to caller for retry/alerting
 * - No validation errors: Command is pre-validated by schema before reaching workflow
 *
 * @param command - ScheduleTimer command with tenantId, serviceCallId, dueAt
 * @returns Effect that succeeds when timer is persisted
 * @throws PersistenceError - When save operation fails
 * @requires MessageMetadata - Correlation/causation context from command envelope (injected by handler)
 * @requires ClockPort - For current timestamp
 * @requires TimerPersistencePort - For persistence
 *
 * @example Handler usage (provisions MessageMetadata from envelope)
 * ```typescript
 * // Command handler extracts metadata and provisions it
 * yield* eventBus.subscribeToScheduleTimerCommands((command, metadata) =>
 *   scheduleTimerWorkflow(command).pipe(
 *     Effect.provideService(MessageMetadata, metadata)
 *   )
 * )
 * ```
 */
export const scheduleTimerWorkflow: (
	command: Messages.Orchestration.Commands.ScheduleTimer.Type,
) => Effect.Effect<void, Ports.PersistenceError, MessageMetadata | Ports.ClockPort | Ports.TimerPersistencePort> =
	Effect.fn('Timer.ScheduleTimer')(function* ({ dueAt, serviceCallId, tenantId }) {
		const { causationId, correlationId } = yield* MessageMetadata
		const clock = yield* Ports.ClockPort
		const persistence = yield* Ports.TimerPersistencePort

		yield* Effect.annotateCurrentSpan({
			causationId,
			correlationId,
			dueAt,
			serviceCallId,
			tenantId,
		})

		const registeredAt = yield* clock.now()

		const scheduledTimer = new Domain.ScheduledTimer({
			correlationId,
			dueAt,
			registeredAt,
			serviceCallId,
			tenantId,
		})

		yield* persistence.save(scheduledTimer)
	})
