import * as Effect from 'effect/Effect'

import { ClockPort, TimerEventBusPort, TimerPersistencePort } from '../ports/index.ts'

export const pollDueTimersWorkflow: () => Effect.Effect<
	void,
	never,
	TimerPersistencePort | TimerEventBusPort | ClockPort
> = Effect.fn('Timer.PollDueTimers')(function* () {
	const _persistence = yield* TimerPersistencePort
	const _eventBus = yield* TimerEventBusPort
	const _clock = yield* ClockPort
	// TODO: implement in PL-4.4

	yield* Effect.void
})
