import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import * as Adapters from './adapters/index.ts'
import { PollingWorker } from './workers/index.ts'

// import type * as Ports from './ports/index.ts'

/**
 * Timer module production layer composition
 *
 * Composes Timer adapters with their platform dependencies:
 *
 * - {@link Adapters.TimerPersistence.Live} — SQLite file-backed storage
 * - {@link Adapters.TimerEventBus.Live} — Event publishing via EventBusPort
 * - {@link Adapters.Clock.Live} — Real system time
 *
 * **Unsatisfied dependency**: `EventBusPort` remains in `R` channel.
 * Caller must provide a broker adapter (PL-3) or mock for testing.
 *
 * @internal Not part of public API
 *
 * @see docs/design/modules/timer.md — Module responsibilities
 * @see ADR-0002 — Broker adapter decision (pending)
 */
const TimerLive = Layer.merge(Adapters.TimerPersistence.Live, Adapters.TimerEventBus.Live).pipe(
	Layer.provideMerge(Adapters.Clock.Live),
	Layer.provide(Adapters.Platform.UUID7.Default),
)

/**
 * Timer module main program entry point
 *
 * The sole public API of the Timer module. Starts the polling loop that:
 *
 * 1. Queries for due timers every 5 seconds
 * 2. Publishes `DueTimeReached` events for each due timer
 * 3. Marks timers as fired (Scheduled → Reached)
 * 4. Recovers from errors and continues polling
 *
 * **Usage**: Run this Effect with a provided `EventBusPort` adapter:
 *
 * ```typescript ignore
 * import { main } from "@event-service-agent/timer"
 * import { EventBusPort } from "@event-service-agent/platform/ports"
 *
 * // Provide broker adapter and run
 * main().pipe(
 *   Effect.provide(EventBusPortLive),
 *   Effect.runPromise,
 * )
 * ```
 *
 * **Unsatisfied dependency**: Requires `EventBusPort` from caller.
 * All other dependencies (persistence, clock, UUID) are composed internally.
 *
 * @public
 *
 * @returns Effect that runs indefinitely, polling for due timers
 *
 * @see {@link PollingWorker.run} — Polling loop with error recovery
 * @see docs/design/modules/timer.md — Module responsibilities
 * @see ADR-0003 — Polling interval (5s) rationale
 */
export const main = Effect.fn('Timer.main')(
	() => Effect.asVoid(PollingWorker.run()),
	(effect) => effect.pipe(Effect.provide(TimerLive)),
)
