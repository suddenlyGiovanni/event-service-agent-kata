import * as Layer from 'effect/Layer'

import * as Adapters from './adapters/index.ts'

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
	Layer.provide(Adapters.Clock.Live),
	Layer.provide(Adapters.Platform.UUID7.Default),
)

// biome-ignore lint/complexity/noUselessEmptyExport: <explanation>
export {}
