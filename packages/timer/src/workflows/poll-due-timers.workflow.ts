/**
 * Poll Due Timers Workflow
 *
 * Periodically checks for timers that have reached their due time and fires them by publishing DueTimeReached events.
 * This is the core of the timer service's event-driven architecture.
 *
 * **Architecture Pattern**: Polling-based workflow
 *
 * - Trigger: Time-based (cron job, scheduled task, infinite loop with delay)
 * - Input: Current time (from ClockPort)
 * - Output: Published DueTimeReached events for all due timers
 *
 * **Design Decision — Polling vs Push**: We use polling (periodic findDue queries) instead of push-based timers
 * because:
 *
 * 1. **Resilience**: Survives crashes and restarts (timers are durable in DB)
 * 2. **Scalability**: Can process batches efficiently, tune batch size
 * 3. **Simplicity**: No in-memory timer wheel, no state synchronization
 * 4. **Predictability**: Query performance is measurable and tunable via indexes
 *
 * Trade-off: Higher latency (polling interval) vs push-based (instant firing)
 *
 * - Accepted because: Service call scheduling doesn't require sub-second precision
 * - Mitigation: Poll interval tunable based on latency requirements (e.g., every 5s)
 *
 * **Error Handling Strategy**: Uses Effect.partition to collect all failures instead of fail-fast. This ensures:
 *
 * - Successful timers are processed and marked as fired
 * - Failed timers remain Scheduled for retry on next poll
 * - Partial batch success enables forward progress even with failures
 *
 * Alternative considered: Fail-fast on first error
 *
 * - Rejected because: Single failing timer blocks entire batch
 * - Current approach: Better availability and resilience
 *
 * **Idempotency Strategy**: Each timer is processed exactly once even across failures:
 *
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
 * Raised when one or more timers fail to process during a batch poll. Contains detailed failure information for
 * observability and retry policies.
 *
 * **Domain Semantics**:
 *
 * - Failed timers remain in Scheduled state (will retry on next poll)
 * - Successful timers transition to Reached (won't retry)
 * - Caller can inspect failures for alerting, backoff, or circuit breaking
 *
 * **Why aggregate errors instead of propagating first failure**: Enables partial batch success. If 99 timers succeed
 * and 1 fails, the 99 are marked as Reached and won't reprocess. Only the 1 failure retries.
 *
 * Alternative: Fail-fast on first error (propagate first failure immediately)
 *
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
 * **Processing Order — Publish BEFORE markFired**: Event is published FIRST, then timer is marked as fired. This
 * ordering ensures at-least-once delivery semantics:
 *
 * 1. If publish succeeds + markFired succeeds: ✅ Normal case, event delivered once
 * 2. If publish succeeds + markFired fails: ✅ Timer retries, event delivered twice (idempotent consumer handles)
 * 3. If publish fails: ✅ Timer remains Scheduled, retry on next poll
 *
 * Alternative: Mark fired BEFORE publish
 *
 * - Rejected because: If publish fails, event is lost (timer is already marked Reached)
 * - Current approach: Guarantees at-least-once delivery at cost of possible duplicates
 *
 * **Metadata Strategy — No causationId for timer firing**: Timer firing is NOT caused by a command/event, but by time
 * passage. Therefore:
 *
 * - CausationId: None (no specific message triggered this)
 * - CorrelationId: From timer aggregate (traces back to original scheduling request)
 *
 * This enables tracing timer events back to the original request that scheduled them, while correctly indicating that
 * the firing itself is time-driven, not message-driven.
 *
 * @param timer - The scheduled timer to process
 *
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
	 * CRITICAL SECTION: publish + markFired must complete atomically.
	 *
	 * Wrapped in Effect.uninterruptible to prevent interruption (e.g., shutdown)
	 * between publish and markFired. If interrupted after publish but before markFired:
	 * - Event is delivered to downstream consumers
	 * - Timer remains Scheduled (not marked as Reached)
	 * - On restart: timer fires again → duplicate event
	 *
	 * By making this uninterruptible, we ensure:
	 * - Either both operations complete (normal case)
	 * - The effect can be interrupted before it starts, but not during execution
	 * - Never: publish succeeds, markFired skipped due to interruption
	 *
	 * Note: This does NOT make the operations transactional. If markFired fails
	 * after publish succeeds, the event is still delivered (at-least-once).
	 * But that's a failure, not an interruption—handled by retry logic.
	 *
	 * MessageMetadata for timer firing:
	 * - correlationId: From timer aggregate (traces to original scheduling request)
	 * - causationId: None (firing is time-driven, not message-driven)
	 */
	yield* Effect.uninterruptible(
		Effect.gen(function* () {
			yield* eventBus.publishDueTimeReached(dueTimeReachedEvent).pipe(
				Effect.provideService(MessageMetadata, {
					causationId: Option.none(),
					correlationId: timer.correlationId,
				}),
			)

			yield* persistence.markFired({
				key: { serviceCallId: timer.serviceCallId, tenantId: timer.tenantId },
				reachedAt: now,
			})
		}),
	)

	yield* Effect.logDebug('Timer fired successfully', {
		dueAt: DateTime.formatIsoDateUtc(timer.dueAt),
		serviceCallId: timer.serviceCallId,
		tenantId: timer.tenantId,
	})
})

/**
 * Poll for due timers and process them in a batch
 *
 * See file-level documentation above for comprehensive details on:
 *
 * - Workflow steps and processing order
 * - Concurrency strategy (sequential for ordering)
 * - Error handling (partition for partial success)
 * - Early return optimization
 * - Design trade-offs (polling vs push, fail-fast vs error accumulation)
 */
export const pollDueTimersWorkflow = Effect.fn('Timer.PollDueTimersWorkflow')(function* () {
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

		return yield* new BatchProcessingError({
			failedCount: failures.length,
			failures,
			totalCount: Chunk.size(dueTimers),
		})
	}

	yield* Effect.logInfo('All timers processed successfully', {
		processedCount: successes.length,
	})
})
