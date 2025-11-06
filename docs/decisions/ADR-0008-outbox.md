# ADR-0008: Outbox Pattern & Dispatcher

Status: Proposed

Problem

- Publish domain events reliably after DB commit with per-aggregate ordering and at-least-once semantics.

Context

- Orchestration is the single writer. Events must be appended transactionally and dispatched via the broker without loss or duplication.

Options

1. Transactional outbox table with background dispatcher (polling/batching) marking `dispatchedAt`.
2. DB-specific features (logical decoding/CDC) to stream changes directly.

Decision (TBD)

- Use transactional outbox for MVP. Dispatcher batches by `(tenantId, aggregateId)` order, publishes to broker, marks dispatched in the same transaction or with idempotent updates.
- **Identity prerequisite:** Aggregate IDs (ServiceCallId) must be application-generated BEFORE DB insert to enable outbox pattern. Events in outbox reference ServiceCallId, which must exist at insert time. See [ADR-0010][ADR-0010] for identity generation strategy.

Consequences (TBD)

- Simple, portable, and fits MVP DBs. Later we can evolve to CDC if needed.
- Application-generated IDs enable natural outbox pattern (no chicken-and-egg problem with DB-generated IDs).

## Related Decisions

- [ADR-0010: Identity Generation][ADR-0010] — Why IDs must be application-generated for outbox pattern

[ADR-0010]: ./ADR-0010-identity.md
