import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import type { ScheduledTimer } from '../domain/timer-entry.domain.ts'
import {
	ClockPort,
	type PersistenceError,
	type PublishError,
	TimerEventBusPort,
	TimerPersistencePort,
} from '../ports/index.ts'

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
 * @param firedAt - The timestamp when the timer fired
 * @returns Effect that completes when both operations succeed
 */
const processTimerFiring: (
	timer: ScheduledTimer,
) => Effect.Effect<void, PublishError | PersistenceError, TimerEventBusPort | ClockPort | TimerPersistencePort> =
	Effect.fn('Timer.ProcessTimerFiring')(function* (timer: ScheduledTimer) {
		const eventBus = yield* TimerEventBusPort
		const persistence = yield* TimerPersistencePort
		const clock = yield* ClockPort

		const now = yield* clock.now()

		// Publish event first
		yield* eventBus.publishDueTimeReached(timer, now)

		// Then mark as fired
		yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now)
	})

export const pollDueTimersWorkflow: () => Effect.Effect<
	void,
	PersistenceError | BatchProcessingError, // findDue can fail (infra) | batch failures (domain)
	TimerPersistencePort | ClockPort | TimerEventBusPort
> = Effect.fn('Timer.PollDueTimersWorkflow')(function* () {
	const persistence = yield* TimerPersistencePort
	const clock = yield* ClockPort

	const now = yield* clock.now()
	const dueTimers = yield* persistence.findDue(now)

	// Use partition for error accumulation: process all timers, collect failures separately
	// Error channel is never for partition - workflow doesn't fail on individual timer errors
	const [failures, _successes] = yield* Effect.partition(dueTimers, processTimerFiring, {
		concurrency: 1,
	})

	// Propagate failures to error channel for caller to handle (retry policies, alerting, etc.)
	if (failures.length > 0) {
		return yield* Effect.fail(
			new BatchProcessingError({
				failedCount: failures.length,
				failures,
				totalCount: dueTimers.length,
			}),
		)
	}

	// Success: all timers processed (return void, successes forgotten)
})
