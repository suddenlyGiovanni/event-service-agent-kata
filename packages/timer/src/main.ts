import type * as Platform from '@effect/platform'
import type * as Sql from '@effect/sql'
import type { ConfigError } from 'effect/ConfigError'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'

import { MessageMetadata } from '@event-service-agent/platform/context'

import * as Adapters from './adapters/index.ts'
import * as Ports from './ports/index.ts'
import { PollingInterval, PollingWorker } from './workers/polling.worker.ts'
import * as Workflows from './workflows/index.ts'

/**
 * Timer service for managing scheduled timer lifecycle.
 *
 * Provides a long-running background service that:
 * 1. **Polls for due timers** every 5 seconds, publishing `DueTimeReached` events
 * 2. **Subscribes to ScheduleTimer commands** from the event bus
 *
 * ## Architecture
 *
 * Built using Effect.Service with scoped lifecycle management:
 * - Fibers are tied to the service's scope and terminated when scope closes
 * - All dependencies (persistence, clock, UUID) are pre-wired internally
 * - Only requires `EventBusPort` to be provided by caller
 *
 * ## Service Layers
 *
 * - **`Timer.Default`**: Production layer with SQLite, real clock, sequential UUID7
 * - **`Timer.Test`**: Test layer with in-memory storage, TestClock, predictable UUIDs
 *
 * ## Dependencies
 * **Required from caller**:
 * - `EventBusPort` — Message broker adapter (pending PL-3)
 *
 * @see docs/design/modules/timer.md — Module responsibilities
 * @see ADR-0003 — Polling interval rationale
 * @see ADR-0002 — Broker adapter decision
 */
export class Timer extends Context.Tag('@event-service-agent/timer/Timer')<Timer, void>() {
	/**
	 * @internal
	 */
	static readonly DefaultWithoutDependencies = Layer.scoped(
		Timer,
		/**
		 * Main timer service effect.
		 *
		 * Runs two concurrent operations:
		 * 1. **Polling worker** (scoped fiber): Checks for due timers every 5 seconds
		 * 2. **Command subscription** (main fiber): Listens for ScheduleTimer commands
		 *
		 * **Lifecycle**:
		 * - Polling fiber is forked in local scope (auto-interrupted on scope close)
		 * - Command subscription runs in main fiber (blocks until broker closes)
		 * - All port dependencies are pre-satisfied from captured context
		 *
		 * **Requirements after context provision**:
		 * - Only `Scope.Scope` remains (for forkScoped)
		 * - All port requirements (Persistence, EventBus, Clock) are satisfied
		 *
		 * @returns Effect that runs indefinitely until scope closes or broker disconnects
		 */
		Effect.gen(function* () {
			const eventBus = yield* Ports.TimerEventBusPort

			/**
			 * Fork polling worker in local scope — interrupted when scope closes
			 */
			yield* PollingWorker.Default.pipe(Layer.launch, Effect.forkScoped)

			/**
			 * Run command subscription in main fiber (blocks until broker closes)
			 */
			yield* eventBus
				.subscribeToScheduleTimerCommands((command, metadata) =>
					Workflows.scheduleTimerWorkflow(command).pipe(
						Effect.provideService(MessageMetadata, metadata),
						Effect.retry(Schedule.compose(Schedule.exponential(Duration.millis(100)), Schedule.recurs(3))),
					),
				)
				.pipe(Effect.withSpan('Timer.CommandSubscription.run'))
		}),
	)

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
	static readonly Live: Layer.Layer<
		Timer,
		| Ports.Platform.SubscribeError
		| Ports.PersistenceError
		| Sql.SqlError.SqlError
		| Sql.Migrator.MigrationError
		| ConfigError
		| Platform.Error.BadArgument
		| Platform.Error.SystemError,
		Ports.Platform.EventBusPort
	> = this.DefaultWithoutDependencies.pipe(
		Layer.provide(Adapters.TimerEventBus.Live),
		Layer.provide(Adapters.Clock.Live),
		Layer.provide(Adapters.TimerPersistence.Live),
		Layer.provide(Adapters.Platform.UUID7.Default),
		Layer.provide(PollingInterval.Default),
	)

	/**
	 * Test layer with in-memory persistence, TestClock, and sequential UUIDs.
	 *
	 * Provides a fully deterministic Timer service for integration testing:
	 * - **TimerPersistence.Test**: In-memory SQLite (`:memory:`) with auto-migrations
	 * - **Clock.Test**: TestClock for manual time control
	 * - **UUID7.Sequence**: Predictable, sequential UUIDs starting from 0
	 *
	 * **Still requires**:
	 * - `EventBusPort`: Provide a test event bus adapter
	 *
	 * **Deterministic behavior**:
	 * - Time only advances when `TestClock.adjust()` is called
	 * - UUIDs are sequential: `00000000-0000-7000-8000-000000000000`, `00000000-0000-7000-8000-000000000001`, etc.
	 * - No file I/O (all persistence in-memory)
	 *
	 * @see {@link Timer.Default} — Production layer with real dependencies
	 * @see packages/timer/src/test/main.integration.test.ts — Usage examples
	 */
	static readonly Test: Layer.Layer<
		Timer,
		| Platform.Error.SystemError
		| Sql.Migrator.MigrationError
		| Sql.SqlError.SqlError
		| Platform.Error.BadArgument
		| ConfigError
		| Ports.PersistenceError
		| Ports.Platform.SubscribeError,
		Ports.Platform.EventBusPort
	> = this.DefaultWithoutDependencies.pipe(
		Layer.provide(Adapters.TimerEventBus.Live),
		Layer.provide(Adapters.Clock.Test),
		Layer.provide(Adapters.Platform.UUID7.Sequence()),
		Layer.provide(Adapters.TimerPersistence.Test),
		Layer.provide(PollingInterval.Default),
	)
}
