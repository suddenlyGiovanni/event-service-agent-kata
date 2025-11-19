# Kanban

[← Back to Plan](README.md) | [← Documentation Home](../index.md)

---

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

- (PL-2) Orchestration core domain model and transitions [Orchestration]
- (PL-3) Broker adapter implementation + local broker setup [infra]
- (PL-5) Execution module with mock HttpClientPort [Execution]
- (PL-6) Persistence adapter (SQLite) and migrations [infra]
- (PL-7) API server with submit/list/detail routes [Api]

## Doing (WIP ≤ 2)

<!-- Only what you're actively working on. Move one item at a time. -->

- (PL-4.6) SQLite persistence adapter [Timer] — Consolidate test suite: remove duplicate `inMemory` describe block, keep only `Test` (SQLite :memory:)

<!-- Move the top Ready item here when you start it. Keep ≤ 2. -->

## Blocked

<!-- Item is waiting on something (decision, dependency). Note the blocker briefly. -->

- (PL-9) Observability baseline [adr: [ADR-0009]] [infra] — blocked by [adr: [ADR-0002]]

## Done (recent)

- (PL-24) Implement MessageMetadata Context for correlationId propagation [Timer] [platform] [docs] [adr: [ADR-0013]] — **COMPLETE**: PR#37 merged (Nov 6, 2025). Option E (Ambient Context) implementation. Created `MessageMetadata` Context.Tag with `correlationId`/`causationId` fields. Updated `TimerEventBusPort` signatures to require `MessageMetadata` in R parameter (asymmetric pattern). Refactored both workflows (`pollDueTimersWorkflow`, `scheduleTimerWorkflow`) to provision Context. Updated 22 tests, activated 2 correlation propagation tests. Fixed broken distributed tracing after PL-23. Removed false `makeEnvelope` references from 6 docs (ADR-0011, ADR-0009, 4 design docs). Updated to dual-level observability strategy (Phase 1 complete, Phase 2 planned). 280/282 tests passing. **Commit**: 3d49ca6
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

- **PL-4.6 IN PROGRESS** (Nov 19, 2025): SQLite persistence adapter for Timer. Branch `timer/pl-4.6-sqlite-persistence`.
- **Phase Progress**:
  - **Phase 0: Bootstrap prerequisite (Steps 1-3)** - ✅ **COMPLETE**
  - **Phase 1: Add SQLite adapter (Steps 4-14)** - ✅ **COMPLETE**
  - **Phase 2: Consolidate test suite (Steps 15-17)** - 🔄 **IN PROGRESS**
    - [x] Migrate existing tests from `inMemory` → `Adapters.TimerPersistence.Test` (SQLite :memory:)
    - [x] Delete deprecated `inMemory` HashMap implementation (189 lines removed)
    - [x] Export `Adapters.TimerPersistence.Test` and verify integration (325 tests passing)
    - [ ] **NEXT**: Remove duplicate `inMemory` describe block from test file
    - [ ] **NEXT**: Consolidate into single `Test` describe block (SQLite :memory: only)
    - [ ] **NEXT**: Verify full test coverage maintained (currently 33 tests in persistence suite)
- **Completed Work** (Nov 19, 2025):
  - Made correlationId optional in schema (aligns with domain Option type)
  - Created `withServiceCall` test fixture helper (idempotent FK insertion)
  - Migrated all tests to `it.scoped()` pattern (54 tests across 4 files)
  - Removed HashMap adapter implementation (single source of truth: SQLite)
  - Removed obsolete skipped tests (decode errors, invalid dueAt format)
  - Fixed Effect.fn return type syntax in workflows
  - 8 atomic commits preserving git history
- **Current State**:
  - `timer-persistence.adapter.test.ts` has TWO describe blocks:
    - `describe('inMemory')` - 13 tests using BaseTestLayers (SQL.Test)
    - `describe('Test')` - 20 tests using BaseTestLayers (SQL.Test)
  - Both test suites now use identical infrastructure (SQLite :memory:)
  - Duplication exists for safety (ensuring coverage during migration)
- **Next Action**: Consolidate test suite by removing `inMemory` describe block, verify all 33 test cases covered in unified `Test` suite

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
[ADR-0013]: ../decisions/ADR-0013-correlation-propagation.md
