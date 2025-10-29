import * as Schema from 'effect/Schema'

import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'
import { ServiceCallId } from '../../shared/service-call-id.schema.ts'
import { TenantId } from '../../shared/tenant-id.schema.ts'
import { ErrorMeta, ResponseMeta } from '../common/metadata.schema.ts'
import { RequestSpecWithoutBody } from '../http/request-spec.schema.ts'

/** Orchestration Events */
export class ServiceCallSubmitted extends Schema.TaggedClass<ServiceCallSubmitted>()('ServiceCallSubmitted', {
	name: Schema.String,
	requestSpec: RequestSpecWithoutBody,
	serviceCallId: ServiceCallId,
	submittedAt: Iso8601DateTime,
	tags: Schema.optional(Schema.Array(Schema.String)),
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export class ServiceCallScheduled extends Schema.TaggedClass<ServiceCallScheduled>()('ServiceCallScheduled', {
	dueAt: Iso8601DateTime,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export class ServiceCallRunning extends Schema.TaggedClass<ServiceCallRunning>()('ServiceCallRunning', {
	serviceCallId: ServiceCallId,
	startedAt: Iso8601DateTime,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export class ServiceCallSucceeded extends Schema.TaggedClass<ServiceCallSucceeded>()('ServiceCallSucceeded', {
	finishedAt: Iso8601DateTime,
	responseMeta: ResponseMeta,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export class ServiceCallFailed extends Schema.TaggedClass<ServiceCallFailed>()('ServiceCallFailed', {
	errorMeta: ErrorMeta,
	finishedAt: Iso8601DateTime,
	serviceCallId: ServiceCallId,
	tenantId: TenantId,
}) {
	static readonly decode = Schema.decode(this)

	static readonly encode = Schema.encode(this)
}

export const OrchestrationEvents = Schema.Union(
	ServiceCallSubmitted,
	ServiceCallScheduled,
	ServiceCallRunning,
	ServiceCallSucceeded,
	ServiceCallFailed,
)

export type OrchestrationEvents = Schema.Schema.Type<typeof OrchestrationEvents>
