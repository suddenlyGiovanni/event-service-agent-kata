import * as Context from 'effect/Context'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'

export interface ClockPort {
	/**
	 * Get current UTC time
	 *
	 * @returns Effect that produces current time when executed
	 */
	readonly now: () => Effect.Effect<DateTime.Utc>
}

export const ClockPort = Context.GenericTag<ClockPort>('@event-service-agent/timer/ClockPort')
