/**
 * API module messages
 */
import * as Api from './api/index.ts'
/**
 * Execution module messages
 */
import * as Execution from './execution/index.ts'
/**
 * Orchestration module messages
 */
import * as Orchestration from './orchestration/index.ts'
/**
 * Timer module messages
 */
import * as Timer from './timer/index.ts'

/**
 * Union of all message tag discriminators across all modules
 *
 * Used for exhaustive pattern matching and runtime type guards.
 */
export type Tag =
	| Api.Commands.Tag
	| Execution.Events.Tag
	| Orchestration.Events.Tag
	| Orchestration.Commands.Tag
	| Timer.Events.Tag

export { Api, Execution, Orchestration, Timer }
