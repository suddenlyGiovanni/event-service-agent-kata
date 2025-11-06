/**
 * Poll Due Timers Workflow
 *
 * Periodically checks for timers that have reached their due time and fires them
 * by publishing DueTimeReached events. This is the core of the timer service's
 * event-driven architecture.
 *
 * **Architecture Pattern**: Polling-based workflow
 * - Trigger: Time-based (cron job, scheduled task, infinite loop with delay)
 * - Input: Current time (from ClockPort)
 * - Output: Published DueTimeReached events for all due timers
 *
 * **Design Decision — Polling vs Push**:
 * We use polling (periodic findDue queries) instead of push-based timers because:
 * 1. **Resilience**: Survives crashes and restarts (timers are durable in DB)
 * 2. **Scalability**: Can process batches efficiently, tune batch size
 * 3. **Simplicity**: No in-memory timer wheel, no state synchronization
 * 4. **Predictability**: Query performance is measurable and tunable via indexes
 *
 * Trade-off: Higher latency (polling interval) vs push-based (instant firing)
 * - Accepted because: Service call scheduling doesn't require sub-second precision
 * - Mitigation: Poll interval tunable based on latency requirements (e.g., every 5s)
 *
 * **Error Handling Strategy**:
 * Uses Effect.partition to collect all failures instead of fail-fast. This ensures:
 * - Successful timers are processed and marked as fired
 * - Failed timers remain Scheduled for retry on next poll
 * - Partial batch success enables forward progress even with failures
 *
 * Alternative considered: Fail-fast on first error
 * - Rejected because: Single failing timer blocks entire batch
 * - Current approach: Better availability and resilience
 *
 * **Idempotency Strategy**:
 * Each timer is processed exactly once even across failures:
 * 1. Timer found by findDue (WHERE status = 'Scheduled')
 * 2. Event published (may fail)
 * 3. Timer marked as Reached (idempotency marker)
 * 4. On retry: findDue excludes Reached timers (won't re-process)
 *
 * @see docs/design/modules/timer.md — Two-operation pattern explanation
 * @see docs/decisions/ADR-0006-idempotency.md — Idempotency key design
 * @see docs/decisions/ADR-0003-timer.md — Polling interval trade-offs
 */

import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { round } from 'effect/Number'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { MessageMetadata } from '@event-service-agent/platform/context'
import * as Messages from '@event-service-agent/schemas/messages'

import type * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'

/**
 * BatchProcessingError — Aggregated failures from batch timer processing
 *
 * Raised when one or more timers fail to process during a batch poll.
 * Contains detailed failure information for observability and retry policies.
 *
 * **Domain Semantics**:
 * - Failed timers remain in Scheduled state (will retry on next poll)
 * - Successful timers transition to Reached (won't retry)
 * - Caller can inspect failures for alerting, backoff, or circuit breaking
 *
 * **Why aggregate errors instead of propagating first failure**:
 * Enables partial batch success. If 99 timers succeed and 1 fails, the 99
 * are marked as Reached and won't reprocess. Only the 1 failure retries.
 *
 * Alternative: Fail-fast on first error (propagate first failure immediately)
 * - Rejected because: Blocks batch processing, reduces availability
 * - Current approach: Better throughput and resilience
 */
export class BatchProcessingError extends Schema.TaggedError<BatchProcessingError>()('BatchProcessingError', {
	/** Number of timers that failed to process */
	failedCount: Schema.Number,
	/** Array of failures for detailed logging/debugging */
	failures: Schema.Array(Schema.Unknown),
	/** Total number of timers attempted */
	totalCount: Schema.Number,
}) {}

/**
 * Process a single due timer by publishing its event and marking it as fired
 *
 * **Processing Order — Publish BEFORE markFired**:
 * Event is published FIRST, then timer is marked as fired. This ordering ensures
 * at-least-once delivery semantics:
 *
 * 1. If publish succeeds + markFired succeeds: ✅ Normal case, event delivered once
 * 2. If publish succeeds + markFired fails: ✅ Timer retries, event delivered twice (idempotent consumer handles)
 * 3. If publish fails: ✅ Timer remains Scheduled, retry on next poll
 *
 * Alternative: Mark fired BEFORE publish
 * - Rejected because: If publish fails, event is lost (timer is already marked Reached)
 * - Current approach: Guarantees at-least-once delivery at cost of possible duplicates
 *
 * **Metadata Strategy — No causationId for timer firing**:
 * Timer firing is NOT caused by a command/event, but by time passage. Therefore:
 * - causationId: None (no specific message triggered this)
 * - correlationId: From timer aggregate (traces back to original scheduling request)
 *
 * This enables tracing timer events back to the original request that scheduled them,
 * while correctly indicating that the firing itself is time-driven, not message-driven.
 *
 * @param timer - The scheduled timer to process
 * @returns Effect that succeeds when timer is processed
 * @throws PublishError - When event publishing fails
 * @throws PersistenceError - When marking as fired fails
 */
const processTimerFiring = Effect.fn('Timer.ProcessTimerFiring')(function* (timer: Domain.ScheduledTimer) {
	const eventBus = yield* Ports.TimerEventBusPort
	const persistence = yield* Ports.TimerPersistencePort
	const clock = yield* Ports.ClockPort

	const now = yield* clock.now()

	yield* Effect.annotateCurrentSpan({
		'timer.dueAt': DateTime.formatIsoDateUtc(timer.dueAt),
		'timer.serviceCallId': timer.serviceCallId,
		'timer.tenantId': timer.tenantId,
	})

	const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
		reachedAt: now,
		serviceCallId: timer.serviceCallId,
		tenantId: timer.tenantId,
	})

	/*
	 * Publish event FIRST (before marking as fired) to ensure at-least-once delivery.
	 * If publishing fails, timer stays Scheduled and will retry on next poll.
	 *
	 * MessageMetadata for timer firing:
	 * - correlationId: From timer aggregate (traces to original scheduling request)
	 * - causationId: None (firing is time-driven, not message-driven)
	 */
	yield* eventBus.publishDueTimeReached(dueTimeReachedEvent).pipe(
		Effect.provideService(MessageMetadata, {
			causationId: Option.none(),
			correlationId: timer.correlationId,
		}),
	)

	yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now)

	yield* Effect.logDebug('Timer fired successfully', {
		dueAt: DateTime.formatIsoDateUtc(timer.dueAt),
		serviceCallId: timer.serviceCallId,
		tenantId: timer.tenantId,
	})
})

/**
 * Poll for due timers and process them in a batch
 *
 * **Workflow Steps**:
 * 1. Get current time
 * 2. Query for all timers with dueAt <= now (findDue)
 * 3. Process each timer: publish event + mark as fired
 * 4. Collect successes and failures separately
 * 5. Report metrics and propagate failures (if any)
 *
 * **Concurrency Strategy — Sequential Processing (concurrency: 1)**:
 * Timers are processed one at a time to preserve partition key ordering in the
 * message broker. Concurrent processing could reorder DueTimeReached events for
 * the same serviceCallId, violating ordering guarantees.
 *
 * Trade-off: Lower throughput (sequential) vs ordering guarantees
 * - Accepted because: Per-aggregate ordering is critical for correctness
 * - Mitigation: Batch size tunable, can run multiple pollers in parallel (different tenants)
 *
 * Alternative: Concurrent processing (concurrency: 10)
 * - Rejected because: Could reorder events within same partition key
 * - See ADR-0002 for broker ordering guarantees
 *
 * **Early Return — Empty Batch Optimization**:
 * If no timers are due, return immediately without processing. This avoids:
 * - Unnecessary partition/logging operations
 * - Event bus calls when there's no work
 * - Metric noise from empty batches
 *
 * @returns Effect that succeeds when all timers process successfully
 * @throws PersistenceError - When findDue query fails (infrastructure error)
 * @throws BatchProcessingError - When one or more timers fail to process
 * @requires TimerEventBusPort - For publishing events
 * @requires TimerPersistencePort - For querying and updating timers
 * @requires ClockPort - For current time
 *
 * @example Scheduled polling (every 5 seconds)
 * ```typescript
 * // Run indefinitely with 5-second interval
 * Effect.repeat(
 *   pollDueTimersWorkflow(),
 *   Schedule.fixed('5 seconds')
 * ).pipe(
 *   Effect.provide(timerLayers),
 *   Effect.retry(Schedule.exponential('1 second')) // Retry on failures
 * )
 * ```
 */
export const pollDueTimersWorkflow: () => Effect.Effect<
	void,
	Ports.PersistenceError | BatchProcessingError,
	Ports.TimerEventBusPort | Ports.TimerPersistencePort | Ports.ClockPort
> = Effect.fn('Timer.PollDueTimersWorkflow')(function* () {
	const persistence = yield* Ports.TimerPersistencePort
	const clock = yield* Ports.ClockPort

	const now = yield* clock.now()
	const dueTimers = yield* persistence.findDue(now)

	yield* Effect.annotateCurrentSpan({
		'timer.operation': 'batch-processing',
		'timer.workflow': 'poll-due-timers',
	})

	yield* Effect.logInfo('Polling due timers', {
		dueCount: Chunk.size(dueTimers),
		timestamp: DateTime.formatIso(now),
	})

	/*
	 * Early return if no timers due (optimization).
	 * Avoids unnecessary partition, logging, and event bus operations.
	 */
	if (Chunk.isEmpty(dueTimers)) {
		yield* Effect.logDebug('No due timers found')
		return
	}

	/*
	 * Use partition (not forEach) to collect ALL failures separately.
	 * This ensures partial batch success: processed timers are marked fired,
	 * failed timers remain Scheduled for retry on next poll.
	 *
	 * Trade-off: Higher memory usage for large batches vs better resilience.
	 * - Memory impact: Stores all failures in array until batch completes
	 * - Benefit: Forward progress even with failures, no head-of-line blocking
	 *
	 * Process sequentially (concurrency: 1) to preserve partition key ordering.
	 * Kafka guarantees order only within a partition; concurrent processing
	 * could reorder DueTimeReached events for same serviceCallId.
	 * See ADR-0002 for broker ordering guarantees.
	 */
	const [failures, successes] = yield* Effect.partition(dueTimers, processTimerFiring, {
		concurrency: 1,
	})

	yield* Effect.logInfo('Timer batch processing completed', {
		failedCount: failures.length,
		successCount: successes.length,
		totalCount: Chunk.size(dueTimers),
	})

	if (failures.length > 0) {
		yield* Effect.logWarning('Timer batch processing had failures', {
			failedCount: failures.length,
			failureRate: round((failures.length / Chunk.size(dueTimers)) * 100, 1),
			totalCount: Chunk.size(dueTimers),
		})

		return yield* Effect.fail(
			new BatchProcessingError({
				failedCount: failures.length,
				failures,
				totalCount: Chunk.size(dueTimers),
			}),
		)
	}

	yield* Effect.logInfo('All timers processed successfully', {
		processedCount: successes.length,
	})
})
