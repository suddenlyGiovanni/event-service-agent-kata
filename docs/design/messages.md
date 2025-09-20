# Messages Catalog

## Purpose

- Canonical catalog of commands and events across contexts.
- Each entry lists type, producer(s), consumer(s), and payload schema.
- Conventions unify naming, metadata, and versioning.

## Conventions

- Type: `command` | `event`.
- Identity: all messages include `tenantId` and `serviceCallId` when applicable.
- Metadata: may include `correlationId`, `causationId`, `idempotencyKey` (for public commands), and `occurredAt`/`scheduledAt` timestamps as relevant.
- ~~Versioning: start at `v1`; breaking changes create `v2` alongside `v1` until migration.~~

## Semantics

- Identity: each message has a unique `messageId`; aggregate identity is `(tenantId, serviceCallId)`.
- Ordering: per-aggregate ordering is preserved by broker partition key `tenantId.serviceCallId`; consumers must be idempotent.
- Transport: broker-first; domain events are published after Orchestration commits DB changes (via outbox dispatcher).

## Index by Context

- Orchestration:
  - Commands in: [SubmitServiceCall]
  - Commands out: [StartExecution], [ScheduleTimer]
  - Events out: [ServiceCallSubmitted], [ServiceCallScheduled], [ServiceCallRunning], [ServiceCallSucceeded], [ServiceCallFailed]
- Execution:
  - Commands in: [StartExecution]
  - Events out: [ExecutionStarted], [ExecutionSucceeded], [ExecutionFailed]
- Timer:
  - Commands in: [ScheduleTimer]
  - Events out: [DueTimeReached]
- API (Edge):
  - Commands out: [SubmitServiceCall]

## Index by Type

- Commands:
  - [SubmitServiceCall] — create and schedule a service call;
  - [StartExecution] — trigger a single execution attempt;
  - [ScheduleTimer] — request a due signal at/after `dueAt`.
- Events:
  - [ServiceCallSubmitted] — submission accepted;
  - [ServiceCallScheduled] — dueAt recorded/eligible;
  - [ServiceCallRunning] — attempt started (domain state);
  - [ServiceCallSucceeded] — domain state finalized as Succeeded;
  - [ServiceCallFailed] — domain state finalized as Failed;
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
  - requestSpec: { method: string, url: string, headers?: object, bodySnippet?: string }

### ScheduleTimer

- Type: command (internal)
- Produced by: [Orchestration]
- Consumed by: [Timer]
- Purpose: request a due signal at/after `dueAt`
- Payload:
  - tenantId: string
  - serviceCallId: string
  - dueAt: datetime (ISO8601)

## Events

### ServiceCallSubmitted

- Type: event
- Produced by: [Orchestration]
- Consumed by: interested observers
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
- Consumed by: interested observers, Orchestration policies
- Purpose: record schedule eligibility
- Payload:
  - tenantId: string
  - serviceCallId: string
  - dueAt: datetime (ISO8601)

### ServiceCallRunning

- Type: event
- Produced by: [Orchestration]
- Consumed by: interested observers
- Purpose: mark execution as running at domain level
- Payload:
  - tenantId: string
  - serviceCallId: string
  - startedAt: datetime (ISO8601)

### ServiceCallSucceeded

- Type: event
- Produced by: [Orchestration]
- Consumed by: interested observers
- Purpose: mark successful completion at domain level
- Payload:
  - tenantId: string
  - serviceCallId: string
  - finishedAt: datetime (ISO8601)
  - responseMeta: { status: number, headers?: object, bodySnippet?: string, latencyMs?: number }

### ServiceCallFailed

- Type: event
- Produced by: [Orchestration]
- Consumed by: interested observers
- Purpose: mark failed completion at domain level
- Payload:
  - tenantId: string
  - serviceCallId: string
  - finishedAt: datetime (ISO8601)
  - errorMeta: { kind: string, message?: string, details?: object, latencyMs?: number }

### DueTimeReached

- Type: event
- Produced by: [Timer] (or Orchestration fast-path)
- Consumed by: [Orchestration]
- Purpose: signal that time to start execution has arrived
- Payload:
  - tenantId: string
  - serviceCallId: string
  - reachedAt?: datetime (ISO8601)

### ExecutionStarted

- Type: event
- Produced by: [Execution]
- Consumed by: [Orchestration]
- Purpose: mark execution as running
- Payload:
  - tenantId: string
  - serviceCallId: string
  - startedAt: datetime (ISO8601)

### ExecutionSucceeded

- Type: event
- Produced by: [Execution]
- Consumed by: [Orchestration]
- Purpose: record successful outcome
- Payload:
  - tenantId: string
  - serviceCallId: string
  - finishedAt: datetime (ISO8601)
  - responseMeta: { status: number, headers?: object, bodySnippet?: string, latencyMs?: number }

### ExecutionFailed

- Type: event
- Produced by: [Execution]
- Consumed by: [Orchestration]
- Purpose: record failed outcome
- Payload:
  - tenantId: string
  - serviceCallId: string
  - finishedAt: datetime (ISO8601)
  - errorMeta: { kind: string, message?: string, details?: object, latencyMs?: number }

Notes

- At-least-once delivery: consumers must be idempotent.
- Privacy: `requestSpec.body` and response bodies may be truncated/sanitized; expose `bodySnippet` only.
- Fast-path: Orchestration may publish `DueTimeReached` immediately if `dueAt <= now` to avoid unnecessary timer registration.



<!-- Commands -->

[DueTimeReached]: #duetimereached
[ScheduleTimer]: #scheduletimer
[StartExecution]: #startexecution
[SubmitServiceCall]: #submitservicecall

<!-- Events -->

[ExecutionFailed]: #executionfailed
[ExecutionStarted]: #executionstarted
[ExecutionSucceeded]: #executionsucceeded
[ServiceCallFailed]: #servicecallfailed
[ServiceCallRunning]: #servicecallrunning
[ServiceCallScheduled]: #servicecallscheduled
[ServiceCallSubmitted]: #servicecallsubmitted
[ServiceCallSucceeded]: #servicecallsucceeded

<!-- Bounded Context -->

[API]: ./contexts/api.md
[Execution]: ./contexts/execution.md
[Orchestration]: ./contexts/orchestration.md
[Timer]: ./contexts/timer.md
