/**
 * DomainMessage - Union of all domain messages (events + commands)
 *
 * This centralized union avoids circular dependencies by having all schemas
 * in a single package. The envelope payload has full Effect Schema type power:
 * branded types, pattern matching, and single-phase decode.
 *
 * @see ADR-0012 for rationale
 */

import * as Schema from 'effect/Schema'

import { Api, Execution, Orchestration, Timer } from '../messages/index.ts'

/**
 * DomainMessage Schema Union
 *
 * Uses actual Effect Schemas (not DTO shapes), preserving full type power.
 * After decode, envelope.payload will have branded types and pattern matching support.
 */
export const DomainMessage = Schema.Union(
	Timer.Events.Events,
	Orchestration.Commands.Commands,
	Orchestration.Events.Events,
	Execution.Events.Events,
	Api.Commands.Commands,
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
