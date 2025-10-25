import * as Effect from 'effect/Effect'

import { ClockPort, TimerEventBusPort, TimerPersistencePort } from '../ports/index.ts'

export const pollDueTimersWorkflow: () => Effect.Effect<
	void,
	never,
	TimerPersistencePort | TimerEventBusPort | ClockPort
> = Effect.fn('Timer.PollDueTimers')(function* () {
	// @ts-expect-error TODO: use the persistence port
	const _persistence = yield* TimerPersistencePort
	// @ts-expect-error TODO: use the event bus port
	const _eventBus = yield* TimerEventBusPort
	// @ts-expect-error TODO use the clock port
	const _clock = yield* ClockPort
	// TODO: implement in PL-4.4

	yield* Effect.void
})
