# ADR-0005: Schema & Indexing

Status: Proposed

Problem

- Define domain tables, indexes, tag model, and outbox storage to support efficient queries and reliable, ordered event publication.

Context

- Multi-tenant: all primary keys and indexes must lead with `tenantId`.
- API queries filter by status, tags, and date ranges; read models come straight from the write DB initially.
- Outbox pattern requires an append-only table with ordered dispatch per aggregate key.

Options

1. Normalized tags: `service_call_tags(tenantId, serviceCallId, tag)`; domain table leads with `tenantId`; targeted composite indexes.
2. JSON/BLOB tags: array/JSON in `service_calls` with DB-specific indexing (e.g., GIN). Less portable.

Decision (TBD)

- Prefer normalized tag join table for portability. Define indexes: `(tenantId, status, createdAt DESC)`, `(tenantId, dueAt)`, and for tags `(tenantId, tag, createdAt DESC)`.
- Outbox table columns: `(tenantId, aggregateType, aggregateId, seq, payload, createdAt, dispatchedAt NULLABLE)` with unique `(tenantId, aggregateId, seq)`.

Consequences (TBD)

- Simple, portable queries; predictable performance. Outbox supports ordered dispatch and retries without duplication.
