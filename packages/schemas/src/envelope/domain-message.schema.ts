/**
 * DomainMessage - Union of all domain messages (events + commands)
 *
 * **Architecture Note**: This centralized union avoids circular dependencies.
 * Each module's events are defined in schemas/src/messages/<module>/ and imported here.
 *
 * **Key Benefit**: By having all schemas in one package, we can use the actual Effect Schemas
 * instead of duplicating DTO shapes. The envelope payload will have full type power:
 * branded types, pattern matching, and single-phase decode.
 *
 * Currently includes:
 * - Timer: DueTimeReached
 *
 * TODO (PL-14): Add remaining messages as modules are implemented:
 * - Orchestration: ServiceCallSubmitted, ServiceCallScheduled, ServiceCallRunning,
 *                 ServiceCallSucceeded, ServiceCallFailed, StartExecution, ScheduleTimer
 * - Execution: ExecutionStarted, ExecutionSucceeded, ExecutionFailed
 * - API: SubmitServiceCall
 *
 * @see ADR-0012 for rationale (centralized schemas avoid circular dependencies)
 */

import * as Schema from 'effect/Schema'

import { DueTimeReached } from '../messages/timer/events.schema.ts'

/**
 * DomainMessage Schema Union
 *
 * Uses actual Effect Schemas (not DTO shapes), preserving full type power.
 * After decode, envelope.payload will have branded types and pattern matching support.
 */
export const DomainMessage = Schema.Union(
	// Timer Events
	DueTimeReached,
)

export declare namespace DomainMessage {
	/**
	 * Type - Union of all domain message types
	 */
	type Type = Schema.Schema.Type<typeof DomainMessage>

	/**
	 * Encoded - Union of all domain message DTOs
	 */
	type Encoded = Schema.Schema.Encoded<typeof DomainMessage>
}
