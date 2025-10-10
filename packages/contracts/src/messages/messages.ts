/** biome-ignore-all lint/suspicious/noConstEnum: const enums provide type-only discriminators with zero runtime overhead, matching declare namespace intent */
import type * as Types from 'effect/Types'

import type { RequestSpec, RequestSpecWithoutBody } from '../types/http.type.ts'
import type { Iso8601DateTime, ServiceCallId, TenantId } from '../types/shared.type.ts'

/**
 * ResponseMeta - Metadata about a successful HTTP response
 *
 * Privacy & Size Constraints:
 * - `bodySnippet` is truncated/sanitized before storage and transmission
 * - Sensitive headers may be excluded or redacted
 * - Full response body is stored separately if needed for debugging
 */
interface ResponseMeta {
	/** HTTP status code (2xx range for success in MVP) */
	readonly status: number
	/** Selected response headers (may be filtered for privacy) */
	readonly headers?: Record<string, string>
	/**
	 * Truncated/sanitized response body preview
	 *
	 * Limited to a small size (e.g., first 1KB) for observability.
	 * Sensitive data is redacted. Full body stored separately if retention is required.
	 */
	readonly bodySnippet?: string
	/** Request duration in milliseconds (from HttpClientPort measurement) */
	readonly latencyMs?: number
}

/**
 * ErrorMeta - Metadata about a failed execution
 *
 * Privacy & Size Constraints:
 * - `details` may be sanitized to remove sensitive information
 * - Stack traces and internal errors are logged separately, not transmitted in events
 * - Error messages are safe for observability (no secrets/credentials)
 */
interface ErrorMeta {
	/**
	 * Error classification (e.g., 'NetworkError', 'Timeout', 'HttpError', 'ValidationError')
	 *
	 * Used for metrics aggregation and retry decisions.
	 */
	readonly kind: string
	/** Human-readable error message (sanitized, no sensitive data) */
	readonly message?: string
	/**
	 * Additional error context (sanitized)
	 *
	 * May include status codes, error codes, or diagnostic hints.
	 * Stack traces and sensitive data are excluded.
	 */
	readonly details?: Record<string, unknown>
	/** Request duration before failure in milliseconds */
	readonly latencyMs?: number
}

/**
 * Event - Base type for all domain events
 *
 * Events represent facts that have already occurred in the system (past tense).
 * They are immutable records of state changes that other modules can react to.
 *
 * All events include:
 * - `type`: Discriminator for the specific event type (e.g., 'ServiceCallSubmitted')
 * - `tenantId`: Multi-tenancy identifier for data isolation
 * - `serviceCallId`: Aggregate root identifier for correlation and tracing
 *
 * Events are:
 * - Published by modules after successful state transitions
 * - Consumed by other modules to maintain eventual consistency
 * - Never modified after creation (immutable)
 *
 * @template T - The specific event type discriminator
 *
 * @example
 * ```typescript
 * interface ServiceCallSubmitted extends Event<'ServiceCallSubmitted'> {
 *   readonly name: string
 *   readonly submittedAt: Iso8601DateTime.Type
 * }
 * ```
 */
interface Event<T extends Type> {
	readonly type: `${T}`
	readonly tenantId: TenantId.Type
	readonly serviceCallId: ServiceCallId.Type
}

/**
 * Command - Base type for all commands
 *
 * Commands represent imperative requests to perform an action in the system.
 * They trigger state changes and may succeed or fail based on business rules.
 *
 * Most commands include:
 * - `type`: Discriminator for the specific command type (e.g., 'StartExecution')
 * - `tenantId`: Multi-tenancy identifier for data isolation
 * - `serviceCallId`: Identifier of the service call to operate on
 *
 * Exception: Commands that **create** new aggregates (e.g., `SubmitServiceCall`)
 * use `Omit<Command<T>, 'serviceCallId'>` to exclude the serviceCallId field,
 * since the ID doesn't exist yet and will be generated during processing.
 *
 * Commands are:
 * - Published by one module to trigger actions in another
 * - Consumed by the target module's command handlers
 * - May be rejected if business rules are not satisfied
 *
 * @template T - The specific command type discriminator
 *
 * @example
 * ```typescript
 * // Command that operates on existing aggregate
 * interface StartExecution extends Command<'StartExecution'> {
 *   readonly requestSpec: RequestSpecWithoutBody
 * }
 *
 * // Command that creates new aggregate (no serviceCallId yet)
 * interface SubmitServiceCall extends Omit<Command<'SubmitServiceCall'>, 'serviceCallId'> {
 *   readonly name: string
 *   readonly dueAt: Iso8601DateTime.Type
 * }
 * ```
 */
interface Command<T extends Type> {
	readonly type: `${T}`
	readonly tenantId: TenantId.Type

	readonly serviceCallId: ServiceCallId.Type
}

export declare namespace Orchestration {
	namespace Events {
		const enum Type {
			Submitted = 'ServiceCallSubmitted',
			Scheduled = 'ServiceCallScheduled',
			Running = 'ServiceCallRunning',
			Succeeded = 'ServiceCallSucceeded',
			Failed = 'ServiceCallFailed',
		}

		/**
		 * ServiceCallSubmitted - Submission accepted
		 *
		 * Produced by: Orchestration
		 */
		interface ServiceCallSubmitted extends Event<Type.Submitted> {
			/** Human-readable name for the service call */
			readonly name: string
			/** HTTP request specification (body excluded - stored separately) */
			readonly requestSpec: RequestSpecWithoutBody
			/** Timestamp when the service call was submitted (ISO8601) */
			readonly submittedAt: Iso8601DateTime.Type
			/** Optional tags for categorization and filtering */
			readonly tags?: readonly string[]
		}

		/**
		 * ServiceCallScheduled - DueAt recorded/eligible
		 *
		 * Produced by: Orchestration
		 */
		interface ServiceCallScheduled extends Event<Type.Scheduled> {
			/** Timestamp when execution should start (ISO8601) */
			readonly dueAt: Iso8601DateTime.Type
		}

		/**
		 * ServiceCallRunning - Execution started at domain level
		 *
		 * Produced by: Orchestration
		 */
		interface ServiceCallRunning extends Event<Type.Running> {
			/** Timestamp when execution began (ISO8601) */
			readonly startedAt: Iso8601DateTime.Type
		}

		/**
		 * ServiceCallSucceeded - Successful completion at domain level
		 *
		 * Produced by: Orchestration
		 */
		interface ServiceCallSucceeded extends Event<Type.Succeeded> {
			/** Timestamp when execution completed successfully (ISO8601) */
			readonly finishedAt: Iso8601DateTime.Type
			/** HTTP response metadata (status, headers, latency, body snippet) */
			readonly responseMeta: ResponseMeta
		}

		/**
		 * ServiceCallFailed - Failed completion at domain level
		 *
		 * Produced by: Orchestration
		 */
		interface ServiceCallFailed extends Event<Type.Failed> {
			/** Timestamp when execution failed (ISO8601) */
			readonly finishedAt: Iso8601DateTime.Type
			/** Error details (kind, message, latency, additional context) */
			readonly errorMeta: ErrorMeta
		}

		type Events =
			| ServiceCallSubmitted
			| ServiceCallScheduled
			| ServiceCallRunning
			| ServiceCallSucceeded
			| ServiceCallFailed
	}

	namespace Commands {
		const enum Type {
			StartExecution = 'StartExecution',
			ScheduleTimer = 'ScheduleTimer',
		}

		/**
		 * StartExecution - Trigger HTTP execution for a scheduled ServiceCall
		 *
		 * Produced by: Orchestration
		 * Consumed by: Execution
		 *
		 * Note: Uses RequestSpecWithoutBody for the command payload. The full request body
		 * is stored separately in persistent storage (see storage contract definition) and retrieved by the Execution module using
		 * the serviceCallId. This avoids transmitting large payloads in commands/events.
		 */
		interface StartExecution extends Command<Type.StartExecution> {
			/**
			 * HTTP request specification (body excluded)
			 *
			 * The full request body is stored in the database and retrieved by serviceCallId.
			 * This keeps command payloads small and avoids large messages in the broker.
			 */
			readonly requestSpec: RequestSpecWithoutBody
		}

		/**
		 * ScheduleTimer - Request a due signal at/after dueAt
		 *
		 * Produced by: Orchestration
		 * Consumed by: Timer
		 */
		interface ScheduleTimer extends Command<Type.ScheduleTimer> {
			/** Timestamp when the timer should fire (ISO8601) */
			readonly dueAt: Iso8601DateTime.Type
		}

		type Commands = StartExecution | ScheduleTimer
	}

	type Messages = Events.Events | Commands.Commands
	type Type = Events.Type | Commands.Type
}

export declare namespace Execution {
	namespace Events {
		const enum Type {
			Started = 'ExecutionStarted',
			Succeeded = 'ExecutionSucceeded',
			Failed = 'ExecutionFailed',
		}

		/**
		 * ExecutionStarted - Execution attempt started
		 *
		 * Produced by: Execution
		 * Consumed by: Orchestration
		 */
		interface ExecutionStarted extends Event<Type.Started> {
			/** Timestamp when HTTP request execution began (ISO8601) */
			readonly startedAt: Iso8601DateTime.Type
		}

		/**
		 * ExecutionSucceeded - Call succeeded
		 *
		 * Produced by: Execution
		 * Consumed by: Orchestration
		 */
		interface ExecutionSucceeded extends Event<Type.Succeeded> {
			/** Timestamp when HTTP request completed successfully (ISO8601) */
			readonly finishedAt: Iso8601DateTime.Type
			/** HTTP response metadata (status, headers, latency, body snippet) */
			readonly responseMeta: ResponseMeta
		}

		/**
		 * ExecutionFailed - Call failed
		 *
		 * Produced by: Execution
		 * Consumed by: Orchestration
		 */
		interface ExecutionFailed extends Event<Type.Failed> {
			/** Timestamp when HTTP request failed (ISO8601) */
			readonly finishedAt: Iso8601DateTime.Type
			/** Error details (kind, message, latency, additional context) */
			readonly errorMeta: ErrorMeta
		}

		type Events = ExecutionStarted | ExecutionSucceeded | ExecutionFailed
	}

	namespace Commands {
		type Type = never
		type Commands = never
	}

	type Type = Events.Type | Commands.Type
	type Messages = Events.Events | Commands.Commands
}

export declare namespace Timer {
	namespace Events {
		const enum Type {
			DueTimeReached = 'DueTimeReached',
		}

		/**
		 * DueTimeReached - Time to start execution has arrived
		 *
		 * Produced by: Timer (or Orchestration fast-path)
		 * Consumed by: Orchestration
		 */
		interface DueTimeReached extends Event<Type.DueTimeReached> {
			/**
			 * Optional timestamp when the due time was detected (ISO8601)
			 *
			 * May be omitted if the timer was immediately eligible (fast-path).
			 * When present, indicates polling worker detected the due time.
			 */
			readonly reachedAt?: Iso8601DateTime.Type
		}

		type Events = DueTimeReached
	}

	namespace Commands {
		type Type = never
		type Commands = never
	}

	type Type = Events.Type | Commands.Type

	type Messages = Events.Events | Commands.Commands
}

export declare namespace Api {
	namespace Events {
		type Type = never

		type Events = never
	}

	namespace Commands {
		const enum Type {
			Submit = 'SubmitServiceCall',
		}

		/**
		 * SubmitServiceCall - Create and schedule a new ServiceCall
		 *
		 * Produced by: API
		 * Consumed by: Orchestration
		 */
		interface SubmitServiceCall extends Omit<Command<Type.Submit>, 'serviceCallId'> {
			/** Human-readable name for the service call */
			readonly name: string
			/** Timestamp when execution should start (ISO8601) */
			readonly dueAt: Iso8601DateTime.Type
			/**
			 * Complete HTTP request specification (includes body)
			 *
			 * The body is stored separately in the database after submission.
			 * Subsequent commands/events use RequestSpecWithoutBody to keep payloads small.
			 */
			readonly requestSpec: RequestSpec
			/** Optional tags for categorization and filtering */
			readonly tags?: readonly string[]
			/**
			 * Optional idempotency key for duplicate detection
			 *
			 * If provided, duplicate submissions with the same key will be deduplicated.
			 * See ADR-0006 for idempotency strategy details.
			 */
			readonly idempotencyKey?: string
		}

		type Commands = SubmitServiceCall
	}

	type Type = Events.Type | Commands.Type

	type Messages = Events.Events | Commands.Commands
}

export type Type =
	| Orchestration.Type //
	| Execution.Type
	| Timer.Type
	| Api.Type

export type Events = Types.Simplify<
	| Orchestration.Events.Events //
	| Execution.Events.Events
	| Timer.Events.Events
	| Api.Events.Events
>

export type Commands = Types.Simplify<
	| Orchestration.Commands.Commands //
	| Execution.Commands.Commands
	| Timer.Commands.Commands
	| Api.Commands.Commands
>

export type Messages = Types.Simplify<
	| Orchestration.Messages //
	| Execution.Messages
	| Timer.Messages
	| Api.Messages
>
