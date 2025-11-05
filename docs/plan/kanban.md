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

- (PL-24) **P0 CRITICAL** — Implement MessageMetadata Context for correlationId propagation [Timer] [platform] [docs] [adr: [ADR-0013]] — **BLOCKS PR#36 MERGE**. See `docs/plan/correlation-context-implementation.md` for 14-task breakdown (~7h). Option E (Ambient Context) accepted. Fixes broken distributed tracing after PL-23 pure domain events refactoring. Updates 6 outdated docs that claim non-existent `makeEnvelope` helper exists.
- (PL-4.6) SQLite persistence adapter [Timer] — Deferred until after Schema migration (PL-14)
- (PL-2) Orchestration core domain model and transitions [Orchestration]
- (PL-3) Broker adapter implementation + local broker setup [infra]
- (PL-5) Execution module with mock HttpClientPort [Execution]
- (PL-6) Persistence adapter (SQLite) and migrations [infra]
- (PL-7) API server with submit/list/detail routes [Api]

## Doing (WIP ≤ 2)

<!-- Only what you're actively working on. Move one item at a time. -->

<!-- Move the top Ready item here when you start it. Keep ≤ 2. -->

## Blocked

<!-- Item is waiting on something (decision, dependency). Note the blocker briefly. -->

- (PL-9) Observability baseline [adr: [ADR-0009]] [infra] — blocked by [adr: [ADR-0002]]

## Done (recent)

- (PL-23) Refactor EventBusPort to use pure domain types [Timer] [architecture] — **COMPLETE**: Option B2 implementation with 15 commits across 4 phases. Port accepts pure domain events (`DueTimeReached`), adapter wraps in `MessageEnvelope`. Test layer refactoring (Phase 1-3): fixed composition → extracted base layers → migrated to `@effect/vitest layer()`. Workflow updated (TDD RED-GREEN): construct domain events before publishing. Final REFACTOR phase: extracted BaseTestLayers (10/13 tests simplified, 3 kept explicit for test isolation). All 282 tests passing. **Branch**: `timer/pl-23-pure-domain-events-at-port` (ready for merge).
- (PL-15) Migrate to Schema.DateTimeUtc [schemas, timer, platform] — PR #34 (draft): Completed all 5 migrations (DateTime.Utc, Option<T>, branded types, cross-field validation, naming consistency). 282 tests passing, backward compatible wire format, comprehensive documentation updates.
- (PL-14.2) Migrate platform message interfaces → `@event-service-agent/schemas` [schemas]
- (PL-14.5) Update documentation (ADRs, design docs) [docs] — COMPLETE: Updated ports.md reference to schemas package
- (PL-14.4) Update module dependencies + imports [all modules] — COMPLETE: All active modules (timer, schemas) updated; placeholder modules have no code yet
- (PL-14.3) Rename contracts → platform + update refs [platform] — COMPLETE: Package renamed, 7 READMEs added, all imports fixed, 142 tests passing
- (PL-14.2) Create @event-service-agent/schemas package [schemas] — IN PROGRESS: migrating remaining platform message interfaces to Effect Schemas
- (PL-14.1) Document package split decision [contracts] [adr: [ADR-0012]] — COMPLETE: ADR-0012 created, documents schemas/platform split rationale
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

- **PL-24 PLANNED**: Comprehensive implementation plan created for Option E (Ambient Context) - 14 tasks across 5 phases (~7h estimate). Discovered documentation lies: ADR-0011 + 3 design docs claim `makeEnvelope` helper exists but it doesn't (checked git log d16df59 + actual code). Reality: Timer manually constructs MessageEnvelope via Schema class. Orchestration/Execution are just TODOs.
- **Next**: Execute PL-24 (PR#36 P0 blocker) → Day 1: Core infra + test updates (Phases 1-2, ~3h). Day 2: Workflow implementation (Phase 3, ~2h). Day 3: Doc cleanup (Phases 4-5, ~2h). Then merge PR#36.
- **Context**: PR#36 has 3 NITPICK fixes pushed (ba1458d, fca3e75, 2149de9). P0 (correlationId) and P1 (docs) tracked in PL-24 plan. User chose full Effect solution (Context pattern) over explicit parameters.

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
[ADR-0013]: ../decisions/ADR-0013-correlation-propagation.md
