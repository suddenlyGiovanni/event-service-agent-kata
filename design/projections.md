# Projections (Essentials)

Purpose

- Define minimal read models and how events update them in ES-first MVP.

## Read Models

- Executions List (per tenant)

  - id: `serviceCallId`
  - tenantId
  - name
  - status: `Scheduled|Running|Succeeded|Failed`
  - dueAt?: datetime
  - submittedAt: datetime
  - startedAt?: datetime
  - finishedAt?: datetime
  - tags?: string[]

- Execution Detail (per tenant + serviceCallId)
  - id: `serviceCallId`
  - tenantId
  - name
  - request: { method, url, headers?, bodySnippet? }
  - status
  - submittedAt, dueAt?
  - startedAt?, finishedAt?
  - responseMeta?: { status, headers?, bodySnippet?, latencyMs? }
  - errorMeta?: { kind, message?, details?, latencyMs? }

## Event → Upsert Mapping

### [ServiceCallSubmitted]

- List: create { status: Scheduled, submittedAt, name, tags }
- Detail: create { request, submittedAt, name, tags }

### [ServiceCallScheduled]

- List: set { dueAt }
- Detail: set { dueAt }

### [ExecutionStarted]

- List: set { status: Running, startedAt }
- Detail: set { status: Running, startedAt }

### [ExecutionSucceeded]

- List: set { status: Succeeded, finishedAt }
- Detail: set { status: Succeeded, finishedAt, responseMeta }

### [ExecutionFailed]

- List: set { status: Failed, finishedAt }
- Detail: set { status: Failed, finishedAt, errorMeta }

## Position Tracking

- Maintain a per-projection cursor/position for the event store stream.
- On restart, resume from the last persisted position.

## Rebuild

- To rebuild, reset the projection and reprocess events from position 0.
- During rebuild, serve stale data or gate queries as needed.

Notes

- Read models are tenant-scoped; include `tenantId` in keys.
- Consumers must be idempotent and tolerate at-least-once delivery.

[ServiceCallSubmitted]: ./messages.md#servicecallsubmitted
[ServiceCallScheduled]: ./messages.md#servicecallscheduled
[ExecutionStarted]: ./messages.md#executionstarted
[ExecutionSucceeded]: ./messages.md#executionsucceeded
[ExecutionFailed]: ./messages.md#executionfailed
