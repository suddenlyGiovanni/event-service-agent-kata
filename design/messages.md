# Messages Catalog (Contracted)

Purpose

- Canonical catalog of commands and events across contexts.
- Each entry lists type, producer(s), consumer(s), and payload schema.
- Conventions unify naming, metadata, and versioning.

Conventions

- Type: `command` | `event`.
- Identity: all messages include `tenantId` and `serviceCallId` when applicable.
- Metadata: may include `correlationId`, `causationId`, `idempotencyKey` (for public commands), and `occurredAt`/`scheduledAt` timestamps as relevant.
- ~~Versioning: start at `v1`; breaking changes create `v2` alongside `v1` until migration.~~

Semantics (essentials)

- Identity: each event has a unique `eventId`; aggregate identity is `(tenantId, serviceCallId)`.
- Ordering: per-aggregate ordering is guaranteed by keying streams by `aggregateId = serviceCallId` (tenant included in stream partitioning or metadata), consumers must be idempotent.
- Transport: [EventStorePort] is the source of truth and event transport; consumers subscribe with cursors/positions.

Index by Context

- Orchestration:
  - [SubmitServiceCall],
  - [ServiceCallSubmitted],
  - [ServiceCallScheduled],
  - [StartExecution],
  - [RegisterTimer]
- Execution:
  - [StartExecution],
  - [ExecutionStarted],
  - [ExecutionSucceeded],
  - [ExecutionFailed]
- Timer:
  - [RegisterTimer],
  - [DueTimeReached]
- API (Edge):
  - [SubmitServiceCall]
- Reporting: consumes [Events]

Index by Type

- Commands:
  - [SubmitServiceCall] — create and schedule a service call;
  - [StartExecution] — trigger a single execution attempt;
  - [RegisterTimer] — request a due signal at/after `dueAt`.
- Events:
  - [ServiceCallSubmitted] — submission accepted;
  - [ServiceCallScheduled] — dueAt recorded/eligible;
  - [DueTimeReached] — time to start execution;
  - [ExecutionStarted] — attempt started;
  - [ExecutionSucceeded] — call succeeded;
  - [ExecutionFailed] — call failed.

## Commands

### SubmitServiceCall

- Type: command
- Produced by: [API]
- Consumed by: [Orchestration]
- Purpose: create and schedule a new ServiceCall
- Payload:
  - tenantId: string
  - name: string
  - dueAt: datetime (ISO8601)
  - requestSpec: { method: string, url: string, headers?: object, body?: string }
  - tags?: string[]
  - idempotencyKey?: string

### StartExecution

- Type: command (internal)
- Produced by: [Orchestration]
- Consumed by: [Execution]
- Purpose: start the HTTP execution for a scheduled ServiceCall
- Payload:
  - tenantId: string
  - serviceCallId: string

### RegisterTimer

- Type: command/port call (internal)
- Produced by: [Orchestration]
- Consumed by: [Timer] adapter
- Purpose: request a due signal at/after `dueAt`
- Payload:
  - tenantId: string
  - serviceCallId: string
  - dueAt: datetime (ISO8601)

## Events

### ServiceCallSubmitted

- Type: event
- Produced by: [Orchestration]
- Consumed by: [Reporting] (and interested observers)
- Purpose: acknowledge accepted submission
- Payload:
  - tenantId: string
  - serviceCallId: string
  - name: string
  - requestSpec: { method: string, url: string, headers?: object, bodySnippet?: string }
  - submittedAt: datetime (ISO8601)
  - tags?: string[]

### ServiceCallScheduled

- Type: event
- Produced by: [Orchestration]
- Consumed by: [Reporting], [Orchestration] policies
- Purpose: record schedule eligibility
- Payload:
  - tenantId: string
  - serviceCallId: string
  - dueAt: datetime (ISO8601)

### DueTimeReached

- Type: event
- Produced by: [Timer] adapter (or Orchestration fast-path)
- Consumed by: [Orchestration]
- Purpose: signal that time to start execution has arrived
- Payload:
  - tenantId: string
  - serviceCallId: string
  - reachedAt?: datetime (ISO8601)

### ExecutionStarted

- Type: event
- Produced by: [Execution]
- Consumed by: [Orchestration], [Reporting]
- Purpose: mark execution as running
- Payload:
  - tenantId: string
  - serviceCallId: string
  - startedAt: datetime (ISO8601)

### ExecutionSucceeded

- Type: event
- Produced by: [Execution]
- Consumed by: [Orchestration], [Reporting]
- Purpose: record successful outcome
- Payload:
  - tenantId: string
  - serviceCallId: string
  - finishedAt: datetime (ISO8601)
  - responseMeta: { status: number, headers?: object, bodySnippet?: string, latencyMs?: number }

### ExecutionFailed

- Type: event
- Produced by: [Execution]
- Consumed by: [Orchestration], [Reporting]
- Purpose: record failed outcome
- Payload:
  - tenantId: string
  - serviceCallId: string
  - finishedAt: datetime (ISO8601)
  - errorMeta: { kind: string, message?: string, details?: object, latencyMs?: number }

Notes

- At-least-once delivery: consumers must be idempotent.
- Privacy: `requestSpec.body` and response bodies may be truncated/sanitized; expose `bodySnippet` in events/read models only.
- Fast-path: Orchestration may publish `DueTimeReached` immediately if `dueAt <= now` to avoid unnecessary timer registration.

[Events]: #events

<!-- Events / Commands -->

[SubmitServiceCall]: #submitservicecall
[ServiceCallSubmitted]: #servicecallsubmitted
[ServiceCallScheduled]: #servicecallscheduled
[StartExecution]: #startexecution
[RegisterTimer]: #registertimer
[ExecutionStarted]: #executionstarted
[ExecutionSucceeded]: #executionsucceeded
[ExecutionFailed]: #executionfailed
[DueTimeReached]: #duetimereached

<!-- Bounded Contex -->

[Execution]: ./contexts/execution.md
[Orchestration]: ./contexts/orchestration.md
[Reporting]: ./contexts/reporting.md
[Timer]: ./contexts/timer.md
[API]: ./contexts/api.md

<!-- Ports -->

[EventStorePort]: ./ports.md#eventstoreport
