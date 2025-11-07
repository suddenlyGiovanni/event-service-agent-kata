import * as Schema from 'effect/Schema'

import { ServiceCallId, TenantId } from '../../shared/index.ts'

/**
 * Base fields common to all service call events across modules.
 *
 * This schema provides the fundamental identity fields that every service call event
 * must include, regardless of which module produces it (Timer, Orchestration, Execution, API).
 */
export const ServiceCallEventBase = Schema.Struct({
	/**
	 * Aggregate root identifier for the service call
	 *
	 * Links this event to a specific service call instance.
	 * Validated as UUID7 format at runtime.
	 */
	serviceCallId: ServiceCallId,

	/**
	 * Multi-tenancy identifier for data isolation
	 *
	 * All events must include tenantId for proper routing and data isolation.
	 * Validated as UUID7 format at runtime.
	 */
	tenantId: TenantId,
})
