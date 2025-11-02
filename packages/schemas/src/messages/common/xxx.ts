import * as Schema from 'effect/Schema'

import { ServiceCallId, TenantId } from '../../shared/index.ts'

// FIXME: find a better name for this
export const X = Schema.Struct({
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
