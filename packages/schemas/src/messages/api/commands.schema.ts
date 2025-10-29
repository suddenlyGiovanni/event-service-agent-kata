import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { RequestSpec } from '../http/request-spec.schema.ts'

export class SubmitServiceCall extends Schema.TaggedClass<SubmitServiceCall>()('SubmitServiceCall', {
  tenantId: TenantId,
  name: Schema.String,
  dueAt: Iso8601DateTime,
  requestSpec: RequestSpec,
  tags: Schema.optional(Schema.Array(Schema.String)),
  idempotencyKey: Schema.optional(Schema.String),
}) {}

export const ApiCommands = Schema.Union(SubmitServiceCall)

export type ApiCommands = Schema.Schema.Type<typeof ApiCommands>
