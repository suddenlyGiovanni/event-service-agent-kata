# Early Plan (MVP)

<!-- *** Purpose: single-page guide for what to decide and do first. Keep it short. *** -->

## Scope Now

- Broker-first comms between all bounded contexts; API is a separate process; Core is a modular monolith behind a broker.
- ES-first: Event Store is source of truth; projections build read models; at-least-once semantics; per-aggregate ordering.

## Decisions To Lock (before coding)

<!-- *** Check each item off as you accept it and/or link an ADR. *** -->

- [ ] **Broker choice & topics/partitions** [adr: ADR-0001]  
       Recommendation: Kafka/Redpanda; partition key `aggregateId` (serviceCallId); DLQ per consumer group.
- [ ] **Event store tech & concurrency** [adr: ADR-0002]  
       Recommendation: Postgres append-only streams; optimistic `expectedVersion` on append; stream key `(tenantId, serviceCallId)`.
- [ ] **Outbox strategy** (append→publish) [adr: ADR-0004]  
       Recommendation: single-table outbox in same DB; background publisher publishes in stream order.
- [ ] **Message envelope schema** [adr: ADR-0003]  
       Fields: `messageId, tenantId, aggregateType, aggregateId, type, timestamp, correlationId, causationId, schemaVersion`; events carry `version`.
- [ ] **Idempotency scope & API behavior** [adr: ADR-0005]  
       Scope `(tenantId, idempotencyKey) → serviceCallId`; first call 202; replay 200/208 with same id.
- [ ] **Timer persistence & delivery** [adr: ADR-0006]  
       Persist `(tenantId, serviceCallId, dueAt)`; at-least-once `DueTimeReached`; boot scan to re-enqueue overdue.
- [ ] **Read store & projection cursoring** [adr: ADR-0007]  
       Recommendation: Postgres tables; per-projection checkpoint; idempotent upserts keyed by `(tenantId, id)`.
- [ ] **Privacy/redaction policy** [adr: ADR-0008]  
       Snippet ≤ 8KB; header allowlist; redact sensitive values consistently.
- [ ] **HTTP execution policy** [adr: ADR-0009]  
       2xx = success; others = failure; timeout 10s; capture latency and snippet.
- [ ] **Observability baseline** [adr: ADR-0010]  
       Correlation/causation propagation; logs at command receive, append, publish, consume, upsert; consumer lag metric.

## First Vertical Slices (end-to-end)

<!-- *** Each slice is independently demoable. *** -->

1. Submit-now → Execute → Projected  
   Acceptance: exactly one attempt; list/detail show `Succeeded|Failed` within N seconds.
2. Submit-future (dueAt>now) → Timer → Execute  
   Acceptance: at-least-once `DueTimeReached`; no duplicate execution.
3. Idempotent submit (replay)  
   Acceptance: same `serviceCallId` returned; no duplicate events; stable state.
4. List filtering (status, tags, date)  
   Acceptance: filters work per tenant; paginated results.

## Minimal Task List (ordered)

<!-- *** Keep ≤ 8 items. Reference ADRs. *** -->

- [ ] Draft [adr: ADR-0001]: Broker choice, topics, partitions          
- [ ] Draft [adr: ADR-0002]: Event store model & optimistic concurrency
- [ ] Draft [adr: ADR-0003]: Envelope schema (headers, versioning)
- [ ] Draft [adr: ADR-0004]: Outbox (append→publish ordering)
- [ ] Draft [adr: ADR-0005]: API contracts (submit, list, detail)
- [ ] Draft [adr: ADR-0006]: Timer persistence & boot scan
- [ ] Draft [adr: ADR-0007]: Read store + projection cursoring
- [ ] Draft [adr: ADR-0008]: Privacy/redaction/snippet policy

## Definition of Ready (to start coding)

- Decisions above Accepted (or defaults explicitly noted).
- API request/response DTOs fixed for the three endpoints.
- Topics/partitions created; DB migrations drafted for streams/outbox/read models.

## Definition of Done (MVP slice)

- E2E demo for selected slice is repeatable; handlers idempotent under duplicates.
- Projections resume from checkpoint after restart; outbox drains reliably.
- Basic logs with correlation/causation present; tenant scoping enforced.

## Risks (now) & Mitigations

- Skipping outbox → lost events on publish failure  
   Mitigation: implement outbox first.
- Projection lag → API reads stale data  
   Mitigation: accept eventual consistency; for submit, return 202 with Location.
- Local broker friction  
   Mitigation: provide a one-liner dev compose; keep topics minimal.

---

### Pointers

- [Design](../design)
- [Decisions](../decisions/README.md) (ADRs)
- [Kanban](./kanban.md)


<!-- ADRs -->


[adr: ADR-0001]: ../decisions/ADR-0001-broker-topics-partitions.md
[adr: ADR-0002]: ../decisions/ADR-0002-event-store-and-concurrency.md
[adr: ADR-0003]: ../decisions/ADR-0003-message-envelopes-and-versioning.md
[adr: ADR-0004]: ../decisions/ADR-0004-outbox-append-then-publish.md
[adr: ADR-0005]: ../decisions/ADR-0005-api-contracts-and-idempotency.md
[adr: ADR-0006]: ../decisions/ADR-0006-timer-persistence-and-due-delivery.md
[adr: ADR-0007]: ../decisions/ADR-0007-read-store-and-projection-cursoring.md
[adr: ADR-0008]: ../decisions/ADR-0008-privacy-redaction-snippets.md
[adr: ADR-0009]: ../decisions/ADR-0009-http-execution-policy-and-errors.md
[adr: ADR-0010]: ../decisions/ADR-0010-observability-baseline.md
