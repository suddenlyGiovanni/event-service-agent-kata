# Implementation Plan

[← Back to Plan](README.md) | [← Documentation Home](../index.md)

---

Purpose

- Translate the domain and design into a phased, low-risk delivery plan.
- Favor small, verifiable milestones with tests and runnable demos.

Current Focus

- Milestone 1 — Contracts & Scaffolding: [ADR-0003] accepted (periodic polling, 5s interval, shared DB with strong boundaries, publish-then-update pattern). [ADR-0004] accepted (single shared database `event_service.db` with module-specific ports/adapters). Timer will be broker-agnostic with SQLite persistence.
- Defining message ADTs and port interfaces in TypeScript, aligned to `docs/design/messages.md` and `docs/design/ports.md`.
- Next: Create schemas and platform package structure with message types (ScheduleTimer, DueTimeReached, SubmitServiceCall, etc.) and port interfaces (EventBusPort, TimerPort, PersistencePort, etc.).

Principles

- Functional TypeScript, DMMF modeling, Effect runtime and layers.
- Single-writer Orchestration; DB is source of truth; outbox after-commit events.
- Multi-tenancy everywhere; key by `(tenantId, serviceCallId)`; preserve per-aggregate order.

Milestones (aligned to Gates)

1. Contracts & Scaffolding

- Define message ADTs and port interfaces in TypeScript, aligned to `docs/design/messages.md` and `docs/design/ports.md`.
- Set up Bun workspaces (packages: `schemas`, `platform`, later module packages).
- Acceptance: type-check passes; unit tests cover message constructors and basic validation.

1. Orchestration Core (Pure)

- Model `ServiceCall` aggregate as discriminated union; legal transitions only.
- Implement handlers for intents/events: `SubmitServiceCall`, `DueTimeReached`, `Execution*` mapping to domain updates.
- Ports as dependencies (Clock, Persistence, Outbox, EventBus, Timer) via Effect layers; keep core pure where possible.
- Acceptance: property-based/unit tests verify transitions; idempotency/guards for `dueAt`.

1. Messaging Adapter (Broker from Day One) [Gate 02 — [ADR-0002]]

- Implement `EventBusPort` adapter for the chosen broker (see [ADR-0002]) with partition/subject routing by `tenantId.serviceCallId`.
- Provide a lightweight docker-compose or devcontainer for local broker.
- Acceptance: adapter integration tests verify ordering and at-least-once semantics in dev.

1. Timer Strategy Implementation [Gate 03 — [ADR-0003]]

- If broker supports delayed messages, implement broker-based delay for `DueTimeReached`.
- Else, implement a minimal durable timer service that publishes `DueTimeReached` via the broker.
- Acceptance: scheduled calls fire at/after `dueAt` with at-least-once; Orchestration guards start.

1. Execution Worker (HTTP)

- Implement Execution module with `HttpClientPort` adapter:
  - Mock client for offline tests.
  - Real client (e.g., undici/fetch) optional.
- Acceptance: emits `ExecutionStarted` then exactly one of `ExecutionSucceeded`/`ExecutionFailed`.

1. Persistence Adapter (MVP) [Gate 04 → 05 — [ADR-0004], [ADR-0005]]

- Database structure decided ([ADR-0004] Accepted): single shared `event_service.db` with module-specific ports/adapters. Simple schema reflecting domain state and outbox table.
- Implement `PersistencePort` guarded updates and basic list/detail queries (with filters: status, tags, date).
- Acceptance: migrations applied; API can read; Orchestration writes transactional with outbox append.

1. API Edge [Gate 06 → 07 — [ADR-0006], [ADR-0007]]

- Minimal HTTP server with routes from `modules/api.md`; validate input; publish `SubmitServiceCall`.
- Read models served directly from domain DB; add pagination and filters.
- Acceptance: curl/HTTPie scripts demonstrate submission, listing, and details; Location header returns canonical URL.

1. Redaction & Idempotency [Gate 06]

- Implement `bodySnippet` truncation/redaction and response snippet policy.
- Compute `serviceCallId` from `(tenantId, idempotencyKey)` when provided; otherwise generate UUID and treat as best-effort uniqueness.
- Acceptance: tests for redaction; idempotent submission within tenant.

1. Outbox Dispatcher [Gate 08 — [ADR-0008]]

- Implement outbox table usage and background dispatcher publishing to the broker (batching, marking dispatched).
- Acceptance: domain events are published after commit with preserved per-aggregate ordering.

1. Observability Baseline [Gate 09 — [ADR-0009][ADR-0009]]

- Structured logs with correlation IDs; minimal metrics (counts/latency) per module.
- Tracing optional once message bus is chosen.
- Acceptance: logs include `tenantId`, `serviceCallId`, `correlationId`.

1. Hardening & Demos

- Negative path tests, timeouts, and watchdog behavior for long-running `Running` state.
- Demo scripts and a minimal UI page (optional) to visualize states.

Sequencing & Dependencies (Gates) — see also [Gates Index][GATES]

- Gate 01 (Topology) precedes Gate 02 (Broker) and Gate 03 (Timer).
- Gate 02 precedes messaging adapter work; Gate 03 defines timer implementation path.
- Gate 04 (DB) precedes Gate 05 (Schema), which precedes Persistence adapter.
- Gate 06 (Idempotency) and Gate 07 (API mapping) precede API implementation.
- Gate 08 (Outbox) is required before E2E publication; Gate 09 (Observability) wires cross-cutting concerns.

Testing Strategy

- Unit tests first (orchestration transitions, redaction, idempotency); allow in-process fakes only for pure unit scope.
- Integration tests against the real broker (containerized) and DB adapter; timer path tested per Gate 03 choice.
- Adapter-specific tests (DB, HTTP client) and end-to-end flows.

Acceptance Criteria Summary

- Milestone 3: Broker adapter integration verifies ordered, at-least-once delivery using the chosen broker.
- Timer emits at/after `dueAt` via broker delay or durable timer; Orchestration guards duplicates and illegal transitions.
- Outbox dispatcher publishes committed domain events reliably in order.
- API lists and filters by status/tags/date directly from DB.

Risks & Mitigations

- Messaging choice impacts ops and scheduling → contain via `EventBusPort`; decide broker family early (Gate 02).
- DB schema evolution → start with MVP tables, migrations, and indexes; isolate via `PersistencePort`.
- Clock/timer accuracy → use monotonic scheduling where possible; guard at Orchestration.

Deliverables

- Packages: `schemas`, `platform`, `orchestration`, `execution`, `timer`, `api`, `adapters`.
- Broker adapter package aligned to [ADR-0002]; docker-compose for local broker.

---

[ADR-0001]: ../decisions/ADR-0001-topology.md
[ADR-0002]: ../decisions/ADR-0002-broker.md
[ADR-0003]: ../decisions/ADR-0003-timer.md
[ADR-0004]: ../decisions/ADR-0004-database.md
[ADR-0005]: ../decisions/ADR-0005-schema.md
[ADR-0006]: ../decisions/ADR-0006-idempotency.md
[ADR-0007]: ../decisions/ADR-0007-api.md
[ADR-0008]: ../decisions/ADR-0008-outbox.md
[ADR-0009]: ../decisions/ADR-0009-observability.md
[GATES]: ../decisions/README.md

- Demo scripts: curl/HTTPie commands to submit, list, and fetch details.
- ADRs documenting key choices and open questions.
