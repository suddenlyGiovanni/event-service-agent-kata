import * as Effect from 'effect/Effect'

import type { ScheduledTimer } from '../domain/timer-entry.domain.ts'
import {
	ClockPort,
	type PersistenceError,
	type PublishError,
	TimerEventBusPort,
	TimerPersistencePort,
} from '../ports/index.ts'

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
	PersistenceError, // Only findDue can fail
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

	// TODO: Add observability when Logger service is available
	// - Log failures for monitoring
	// - Annotate span with metrics (dueCount, processed, failed)
	if (failures.length > 0) {
		// yield* Effect.logError(`Timer processing failures: ${failures.length}/${dueTimers.length}`)
	}
})
