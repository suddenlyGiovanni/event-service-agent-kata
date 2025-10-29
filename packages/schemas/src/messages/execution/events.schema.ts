import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { ResponseMeta, ErrorMeta } from '../common/metadata.schema.ts'

export class ExecutionStarted extends Schema.TaggedClass<ExecutionStarted>()('ExecutionStarted', {
  startedAt: Iso8601DateTime,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export class ExecutionSucceeded extends Schema.TaggedClass<ExecutionSucceeded>()('ExecutionSucceeded', {
  finishedAt: Iso8601DateTime,
  responseMeta: ResponseMeta,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export class ExecutionFailed extends Schema.TaggedClass<ExecutionFailed>()('ExecutionFailed', {
  finishedAt: Iso8601DateTime,
  errorMeta: ErrorMeta,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export const ExecutionEvents = Schema.Union(ExecutionStarted, ExecutionSucceeded, ExecutionFailed)

export type ExecutionEvents = Schema.Schema.Type<typeof ExecutionEvents>
