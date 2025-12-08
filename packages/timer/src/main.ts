import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'

import { MessageMetadata } from '@event-service-agent/platform/context'

import * as Adapters from './adapters/index.ts'
import * as Ports from './ports/index.ts'
import { PollingWorker } from './workers/index.ts'
import * as Workflows from './workflows/index.ts'

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
const TimerLive = pipe(
	Layer.merge(Adapters.TimerPersistence.Live, Adapters.TimerEventBus.Live),
	Layer.provideMerge(Adapters.Clock.Live),
	Layer.provide(Adapters.Platform.UUID7.Default),
)

export const _main = Effect.gen(function* () {
	// Fork polling worker in local scope — interrupted when scope closes
	yield* Effect.forkScoped(PollingWorker.run)

	const eventBus = yield* Ports.TimerEventBusPort

	// Run command subscription in main fiber (blocks until broker closes)
	yield* eventBus
		.subscribeToScheduleTimerCommands((command, metadata) =>
			Workflows.scheduleTimerWorkflow(command).pipe(
				Effect.provideService(MessageMetadata, metadata),
				Effect.retry(Schedule.compose(Schedule.exponential(Duration.millis(100)), Schedule.recurs(3))),
			),
		)
		.pipe(Effect.withSpan('Timer.CommandSubscription.run'))
})

/**
 * Timer module main program entry point
 *
 * The sole public API of the Timer module. Runs concurrently:
 *
 * 1. **Polling worker** (scoped fiber): Queries for due timers every 5 seconds,
 *    publishes `DueTimeReached` events, marks timers as fired
 * 2. **Command subscription** (main fiber): Listens for ScheduleTimer commands,
 *    persists timers via {@link Workflows.scheduleTimerWorkflow}
 *
 * **Fiber semantics**: Polling runs in a scoped fiber — its lifetime is tied
 * to the local scope. When the scope closes (graceful shutdown, broker disconnect),
 * the polling fiber is automatically interrupted. This ensures clean resource cleanup.
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
 * @returns Effect that runs indefinitely, processing commands and polling for due timers
 *
 * @see {@link PollingWorker.run} — Polling loop with error recovery
 * @see {@link commandSubscription} — Command handler with retry
 * @see docs/design/modules/timer.md — Module responsibilities
 * @see ADR-0003 — Polling interval (5s) rationale
 */
export const main = Effect.fn('Timer.main')(
	() => _main,
	(effect) => effect.pipe(Effect.provide(TimerLive)),
)
