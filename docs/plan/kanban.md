# Kanban

<!--
Purpose:
    A tiny, self-managed Kanban:
    edit by moving items between sections.
    Keep it short.
-->

WIP limits: Doing ≤ 2. Keep Ready small (≤ 7).

## Inbox

<!--
Raw ideas/tasks.
    Triage here, then move to Ready.
    Use IDs like PL-#.
    Keep this short.
-->

- (PL-13) Choose broker adapter details for dev/prod parity [adr: [ADR-0002]]
- (PL-20) Confirm monolith boundaries (API inside vs separate; Execution worker split) [adr: [ADR-0001]]
- (PL-9) Observability baseline [adr: [ADR-0009]] [infra] — blocked by [adr: [ADR-0002]]

## Ready

<!--
Prioritized queue.
    Pull the top item into Doing. Avoid more than 7 items.
    Link ADRs like [adr: ADR-0001]; add tags like [infra] or [Api].
-->

- (PL-4.6) SQLite persistence adapter [Timer] — Deferred until after Schema migration (PL-14)
- (PL-2) Orchestration core domain model and transitions [Orchestration]
- (PL-3) Broker adapter implementation + local broker setup [infra]
- (PL-5) Execution module with mock HttpClientPort [Execution]
- (PL-6) Persistence adapter (SQLite) and migrations [infra]
- (PL-7) API server with submit/list/detail routes [Api]
- (PL-8) Redaction & idempotency utilities + tests [contracts]

## Doing (WIP ≤ 2)

<!-- Only what you're actively working on. Move one item at a time. -->

- [x] (PL-14.1) Document package split decision [contracts] [adr: [ADR-0012]] — COMPLETE: ADR-0012 created, documents schemas/platform split rationale
- [x] (PL-14.2) Create @event-service-agent/schemas package [schemas]
- [ ] (PL-14.3) Rename contracts → platform + update refs [platform]
- [ ] (PL-14.4) Update module dependencies + imports [all modules] — After PL-14.3
- [ ] (PL-14.5) Update documentation (ADRs, design docs) [docs] — After PL-14.4

<!-- Move the top Ready item here when you start it. Keep ≤ 2. -->

## Blocked

<!-- Item is waiting on something (decision, dependency). Note the blocker briefly. -->

- (PL-9) Observability baseline [adr: [ADR-0009]] [infra] — blocked by [adr: [ADR-0002]]

## Done (recent)

- (PL-4.4) Polling worker workflow + tests [Timer] — COMPLETE: pollDueTimersWorkflow with Effect.fn, BatchProcessingError for partial failures, Effect.partition continue-on-error semantics, observability (spans + structured logging), 13/13 tests passing (53 total timer tests)
- (PL-4.5) In-memory test adapters [Timer] — PR ready: Full state machine persistence (Scheduled → Reached), 16/16 tests passing, two-operation query model (findScheduledTimer/find), Effect.acquireRelease lifecycle, idempotency guarantees
- (PL-4.3) ScheduleTimer workflow + tests [Timer] — PR #25: scheduleTimerWorkflow with Effect.fn, 8/9 tests passing, TimerPersistence.inMemory adapter (Layer.effect + Ref + HashMap)
- (PL-4.2) Port interfaces (Clock, EventBus, Persistence) [Timer] — PR #20 merged
- (PL-4.1) TimerEntry domain model + tests [Timer] — PR #19 merged: Effect Schema with TaggedClass, DateTime.Utc, all tests passing
- (PL-1) Scaffold `contracts` package with message and port types [contracts] — PR #17 merged: 5 branded types, 3 commands, 9 events, MessageEnvelope
- (PL-22) Migrate from Node.js + pnpm to Bun runtime [infra] — Runtime migration complete
- (PL-12) Database structure decision (shared vs separate files) — Accepted [adr: [ADR-0004]]
- (PL-19) Timer delegation strategy (custom vs broker delay) — Accepted [adr: [ADR-0003]]
- (PL-21) Correct NATS delay capability evaluation in ADR-0002 — PR merged

<!-- Keep last few wins visible. Archive older items by copying them to an Archive section/file if desired. -->

## Notes (today)

- Focus: PL-14.2 🚀 NEXT — Creating @event-service-agent/schemas package (extract all Effect Schemas)
- Strategy: Per ADR-0012, split contracts into schemas (all Effect Schemas) + platform (ports + routing)
- Migration: 5 phases documented in ADR-0012. Currently on phase 2 (create schemas package).
- Branch: `contracts/pl-14-schema-migration`

<!-- 2-3 bullets max. What you focus on, current risks, next up. -->

---

### Legend

<!--
Minimal legend.
- ID: `PL-#` (plan item)
- Tags: [Api], [Orchestration], [Execution], [Timer], `infra`, `contracts`
 - ADR link: `[adr: ADR-000x]` may be written using reference-style links.
- WIP: Doing ≤ 2; Ready ≤ 7
-->

[Api]: ../design/modules/api.md
[Orchestration]: ../design/modules/orchestration.md
[Execution]: ../design/modules/execution.md
[Timer]: ../design/modules/timer.md

<!-- ADRs -->

---

[ADR-0001]: ../decisions/ADR-0001-topology.md
[ADR-0002]: ../decisions/ADR-0002-broker.md
[ADR-0011]: ../decisions/ADR-0011-message-schemas.md
[ADR-0012]: ../decisions/ADR-0012-package-structure.md
[ADR-0003]: ../decisions/ADR-0003-timer.md
[ADR-0004]: ../decisions/ADR-0004-database.md
[ADR-0005]: ../decisions/ADR-0005-schema.md
[ADR-0006]: ../decisions/ADR-0006-idempotency.md
[ADR-0007]: ../decisions/ADR-0007-api.md
[ADR-0008]: ../decisions/ADR-0008-outbox.md
[ADR-0009]: ../decisions/ADR-0009-observability.md
[ADR-0010]: ../decisions/ADR-0010-identity.md
[ADR-0011]: ../decisions/ADR-0011-message-schemas.md
