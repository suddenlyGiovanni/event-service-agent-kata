import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'

import * as Adapters from './adapters/index.ts'
import { pollDueTimersWorkflow } from './workflows/poll-due-timers.workflow.ts'

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
 * Polling loop with error recovery
 *
 * Wraps {@link pollDueTimersWorkflow} with:
 * - Error recovery: catches workflow errors, logs recovery, continues polling
 * - Scheduled repetition: runs every 5s per ADR-0003
 *
 * **Error handling strategy**: Errors are logged at `debug` level here because
 * the workflow already logs with full context at `warn` level. This log signals
 * that recovery happened and polling continues.
 *
 * @internal Exported for testing purposes only
 *
 * @todo Identify proper error recovery strategy:
 *   - What are the failure modes? (transient vs permanent)
 *   - How do we classify them?
 *   - Should we implement circuit breaker / backoff?
 *   - If failed N times consecutively, should we panic?
 *
 * For now: log recovery and continue, relying on idempotency for retries.
 */
export const _pollDueTimersWorkflow = () =>
	pollDueTimersWorkflow().pipe(
		Effect.catchTags({
			BatchProcessingError: (err) =>
				Effect.logDebug('Recovered from BatchProcessingError, continuing polling', {
					failedCount: err.failedCount,
					totalCount: err.totalCount,
				}),
			PersistenceError: (err) =>
				Effect.logDebug('Recovered from PersistenceError, continuing polling', {
					message: err.message,
					operation: err.operation,
				}),
		}),
		Effect.repeat(Schedule.spaced(Duration.seconds(5))),
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
 * @see {@link pollDueTimersWorkflow} — Core polling logic
 * @see docs/design/modules/timer.md — Module responsibilities
 * @see ADR-0003 — Polling interval (5s) rationale
 */
export const main = Effect.fn('Timer.main')(
	() => Effect.asVoid(_pollDueTimersWorkflow()),
	(effect) => effect.pipe(Effect.provide(TimerLive)),
)
