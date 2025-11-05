import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { round } from 'effect/Number'
import * as Schema from 'effect/Schema'

import * as Messages from '@event-service-agent/schemas/messages'

import type * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * Error representing batch processing failures during timer polling.
 *
 * This error is raised when one or more timers fail to process during a batch poll.
 * Individual timer failures are collected and propagated to the caller, enabling
 * retry policies, backoff strategies, and observability.
 *
 * Domain semantics:
 * - Failed timers remain in Scheduled state (retry on next poll)
 * - Successful timers are marked as Reached (forgotten)
 * - Caller can inspect failures and implement policies (retry, alert, etc.)
 */
export class BatchProcessingError extends Schema.TaggedError<BatchProcessingError>()('BatchProcessingError', {
	/** Number of timers that failed to process */
	failedCount: Schema.Number,
	/** Array of failures for detailed logging/debugging */
	failures: Schema.Array(Schema.Unknown),
	/** Total number of timers attempted */
	totalCount: Schema.Number,
}) {}

/**
 * Processes a single due timer by publishing its event and marking it as fired.
 *
 * @param timer - The scheduled timer to process
 * @returns Effect that succeeds when the timer is processed, or fails with PublishError or PersistenceError
 */
const processTimerFiring = Effect.fn('Timer.ProcessTimerFiring')(function* (timer: Domain.ScheduledTimer) {
	const eventBus = yield* Ports.TimerEventBusPort
	const persistence = yield* Ports.TimerPersistencePort
	const clock = yield* Ports.ClockPort

	const now = yield* clock.now()

	// Annotate span with timer metadata for tracing
	yield* Effect.annotateCurrentSpan({
		'timer.dueAt': DateTime.formatIsoDateUtc(timer.dueAt),
		'timer.serviceCallId': timer.serviceCallId,
		'timer.tenantId': timer.tenantId,
	})

	// Construct domain event
	const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
		reachedAt: now,
		serviceCallId: timer.serviceCallId,
		tenantId: timer.tenantId,
	})

	// Publish event first
	yield* eventBus.publishDueTimeReached(dueTimeReachedEvent)

	// Then mark as fired
	yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now)

	// Log successful processing
	yield* Effect.logDebug('Timer fired successfully', {
		dueAt: DateTime.formatIsoDateUtc(timer.dueAt),
		serviceCallId: timer.serviceCallId,
		tenantId: timer.tenantId,
	})
})

/**
 * Polls for due timers and processes them.
 *
 * Processes all due timers regardless of individual failures. Failed timers are collected
 * and reported via BatchProcessingError, allowing the caller to implement retry policies.
 *
 * @returns Effect that succeeds when all timers process successfully, or fails with
 *          PersistenceError (query failure) or BatchProcessingError (processing failures)
 */
export const pollDueTimersWorkflow: () => Effect.Effect<
	undefined,
	Ports.PersistenceError | BatchProcessingError,
	Ports.TimerEventBusPort | Ports.TimerPersistencePort | Ports.ClockPort
> = Effect.fn('Timer.PollDueTimersWorkflow')(function* () {
	const persistence = yield* Ports.TimerPersistencePort
	const clock = yield* Ports.ClockPort

	const now = yield* clock.now()
	const dueTimers = yield* persistence.findDue(now)

	// Annotate span with workflow metadata for tracing
	yield* Effect.annotateCurrentSpan({
		'timer.operation': 'batch-processing',
		'timer.workflow': 'poll-due-timers',
	})

	// Log batch start
	yield* Effect.logInfo('Polling due timers', {
		dueCount: Chunk.size(dueTimers),
		timestamp: DateTime.formatIso(now),
	})

	// Early return if no timers due
	if (Chunk.isEmpty(dueTimers)) {
		yield* Effect.logDebug('No due timers found')
		return
	}

	// Use partition for error accumulation: process all timers, collect failures separately
	// Error channel is never for partition - workflow doesn't fail on individual timer errors
	const [failures, successes] = yield* Effect.partition(dueTimers, processTimerFiring, {
		concurrency: 1,
	})

	// Log processing results
	yield* Effect.logInfo('Timer batch processing completed', {
		failedCount: failures.length,
		successCount: successes.length,
		totalCount: Chunk.size(dueTimers),
	})

	// Propagate failures to error channel for caller to handle (retry policies, alerting, etc.)
	if (failures.length > 0) {
		yield* Effect.logWarning('Timer batch processing had failures', {
			failedCount: failures.length,
			failureRate: round((failures.length / Chunk.size(dueTimers)) * 100, 1),
			totalCount: Chunk.size(dueTimers),
		})

		return yield* Effect.fail(
			new BatchProcessingError({
				failedCount: failures.length,
				failures,
				totalCount: Chunk.size(dueTimers),
			}),
		)
	}

	// Success: all timers processed
	yield* Effect.logInfo('All timers processed successfully', {
		processedCount: successes.length,
	})
})
