import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { RequestSpecWithoutBody } from '../http/request-spec.schema.ts'
import { ResponseMeta, ErrorMeta } from '../common/metadata.schema.ts'

/** Orchestration Events */
export class ServiceCallSubmitted extends Schema.TaggedClass<ServiceCallSubmitted>()('ServiceCallSubmitted', {
  name: Schema.String,
  requestSpec: RequestSpecWithoutBody,
  submittedAt: Iso8601DateTime,
  tags: Schema.optional(Schema.Array(Schema.String)),
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export class ServiceCallScheduled extends Schema.TaggedClass<ServiceCallScheduled>()('ServiceCallScheduled', {
  dueAt: Iso8601DateTime,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export class ServiceCallRunning extends Schema.TaggedClass<ServiceCallRunning>()('ServiceCallRunning', {
  startedAt: Iso8601DateTime,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export class ServiceCallSucceeded extends Schema.TaggedClass<ServiceCallSucceeded>()('ServiceCallSucceeded', {
  finishedAt: Iso8601DateTime,
  responseMeta: ResponseMeta,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export class ServiceCallFailed extends Schema.TaggedClass<ServiceCallFailed>()('ServiceCallFailed', {
  finishedAt: Iso8601DateTime,
  errorMeta: ErrorMeta,
  serviceCallId: ServiceCallId,
  tenantId: TenantId,
}) {}

export const OrchestrationEvents = Schema.Union(
  ServiceCallSubmitted,
  ServiceCallScheduled,
  ServiceCallRunning,
  ServiceCallSucceeded,
  ServiceCallFailed,
)

export type OrchestrationEvents = Schema.Schema.Type<typeof OrchestrationEvents>
