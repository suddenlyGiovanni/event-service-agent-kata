import * as Effect from 'effect/Effect'

import {
	ClockPort,
	type PersistenceError,
	type PublishError,
	TimerEventBusPort,
	TimerPersistencePort,
} from '../ports/index.ts'

export const pollDueTimersWorkflow: () => Effect.Effect<
	void,
	PersistenceError | PublishError,
	TimerPersistencePort | TimerEventBusPort | ClockPort
> = Effect.fn('Timer.PollDueTimers')(function* () {
	const persistence = yield* TimerPersistencePort
	const eventBus = yield* TimerEventBusPort
	const clock = yield* ClockPort

	const now = yield* clock.now()

	const dueTimers = yield* persistence.findDue(now)

	// Process each timer sequentially
	for (const timer of dueTimers) {
		// Publish event first
		yield* eventBus.publishDueTimeReached(timer, now)

		// Then mark as fired
		yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now)
	}
})
