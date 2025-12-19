import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'

import * as Workflows from '../workflows/index.ts'

export class PollingInterval extends Context.Tag('@event-service-agent/timer/workers/polling.worker/PollingInterval')<
	PollingInterval,
	{ readonly interval: Duration.DurationInput }
>() {
	static readonly Default = Layer.succeed(this, { interval: Duration.seconds(5) })
}

/**
 * Polling worker for Timer module
 *
 * Wraps {@link Workflows.pollDueTimersWorkflow} with:
 * - Error recovery: catches workflow errors, logs recovery, continues polling
 * - Scheduled repetition: runs every 5s per ADR-0003
 *
 * **Error handling strategy**: Errors are logged at `debug` level here because
 * the workflow already logs with full context at `warn` level. This log signals
 * that recovery happened and polling continues.
 *
 * **Future**: Will be extracted to `@effect/platform` Worker for isolation.
 * Current structure prepares for that extraction with minimal changes.
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
 *
 * @see {@link Workflows.pollDueTimersWorkflow} — Core polling logic
 * @see ADR-0003 — Polling interval rationale
 */
export const run = Effect.flatMap(PollingInterval, ({ interval }) =>
	Workflows.pollDueTimersWorkflow().pipe(
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
		Effect.repeat(Schedule.fixed(interval)),
		Effect.withSpan('Timer.PollingWorker.run'),
		Effect.andThen(Effect.never),
	),
) // TODO: probably we want to return Effect.never?

export class PollingWorker extends Context.Tag('@event-service-agent/timer/workers/polling.worker/PollingWorker')<
	PollingWorker,
	never
>() {
	static readonly Default = Layer.effect(this, run)
}
