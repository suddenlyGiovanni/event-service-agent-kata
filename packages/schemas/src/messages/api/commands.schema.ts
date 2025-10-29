import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { RequestSpec } from '../http/request-spec.schema.ts'

export class SubmitServiceCall extends Schema.TaggedClass<SubmitServiceCall>()('SubmitServiceCall', {
	dueAt: Iso8601DateTime,
	idempotencyKey: Schema.optional(Schema.String),
	name: Schema.String,
	requestSpec: RequestSpec,
	tags: Schema.optional(Schema.Array(Schema.String)),
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export const ApiCommands = Schema.Union(SubmitServiceCall)

export type ApiCommands = Schema.Schema.Type<typeof ApiCommands>
