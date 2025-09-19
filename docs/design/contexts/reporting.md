# Reporting Context

Responsibility

- Maintain denormalized read models for queries (Executions List, Execution Detail).

Read Models

- Executions List: per tenant row per service call with summary fields.
- Execution Detail: full timeline for a single service call.

Data Flow

- Consume domain events from `EventStorePort` in-order per aggregate and project into `ReadStore`.
- Track a projection position/cursor for idempotent, resumable processing.

Ports

- EventStore.subscribe(fromPosition?)
- ReadStore.upsert, ReadStore.transact

Sequence (Consume → Project → Upsert)

```mermaid
sequenceDiagram
  autonumber
  participant REPORTING as Reporting
  participant STORE as EventStore
  participant READ as ReadStore
  link REPORTING: Doc @ ./reporting.md
  link STORE: Port @ ../ports.md#eventstoreport
  link READ: Port @ ../ports.md#readstore

  STORE-->>REPORTING: event + position
  REPORTING-->>REPORTING: map -> {list,detail} changes
  REPORTING->>READ: upsert(list)
  REPORTING->>READ: upsert(detail)
  REPORTING->>READ: save cursor(position)
```

Queries

- API layer queries `ReadStore` via Reporting to serve endpoints.

## Ports Used

- [EventStore](../ports.md#eventstoreport) (consume)
- [ReadStore](../ports.md#readstore)
