# ADR-0006: Idempotency Strategy

Status: Proposed

Problem

- Ensure idempotent submission and processing across API, Orchestration, and broker delivery with multi-tenant keys.

Context

- Clients may send `idempotencyKey`. We derive or assign `serviceCallId` and must reject/accept duplicates deterministically.
- Consumers (Execution, Timer) must handle at-least-once delivery without duplicating effects.

Options

1. Derive `serviceCallId = hash(tenantId, idempotencyKey)`, unique per tenant; if absent, generate ULID/UUID.
2. Keep separate natural key `(tenantId, idempotencyKey)` with unique index; map to internal `serviceCallId`.

Decision (TBD)

- Prefer Option 2 for clarity: store both `serviceCallId` (UUID v7, see [ADR-0010][ADR-0010]) and `idempotencyKey` (optional) with unique `(tenantId, idempotencyKey)` when provided.
- API returns 202 with Location on first submit; subsequent same-key returns 200/202 pointing to existing resource.
- Orchestration enforces idempotent transitions; Outbox deduplicates via unique `(tenantId, aggregateId, seq)`.
- **Identity generation:** ServiceCallId is application-generated (not DB-generated) to enable idempotency checks before insert. See [ADR-0010][ADR-0010] for full rationale.

Consequences (TBD)

- Clear external contract for idempotency; internal IDs remain stable; duplicates are cheap to detect.
- Application-generated IDs enable immediate availability for logging, events, and outbox (no DB roundtrip needed).

## Related Decisions

- [ADR-0010: Identity Generation][ADR-0010] — ServiceCallId generation strategy and UUID v7 rationale

[ADR-0010]: ./ADR-0010-identity.md
