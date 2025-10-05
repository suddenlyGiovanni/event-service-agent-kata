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

- (PL-2) Orchestration core domain model and transitions [Orchestration]
- (PL-3) Broker adapter implementation + local broker setup [infra]
- (PL-5) Execution module with mock HttpClientPort [Execution]
- (PL-6) Persistence adapter (SQLite) and migrations [infra]
- (PL-7) API server with submit/list/detail routes [Api]
- (PL-8) Redaction & idempotency utilities + tests [contracts]
- (PL-20) Confirm monolith boundaries (API inside vs separate; Execution worker split) [adr: [ADR-0001]]

## Doing (WIP ≤ 2)

<!-- Only what you're actively working on. Move one item at a time. -->

- (PL-4) Timer module with in-memory scheduler [Timer]

<!-- Move the top Ready item here when you start it. Keep ≤ 2. -->

## Blocked

<!-- Item is waiting on something (decision, dependency). Note the blocker briefly. -->

- (PL-9) Observability baseline [adr: [ADR-0009]] [infra] — blocked by [adr: [ADR-0002]]

## Done (recent)

- (PL-1) Scaffold `contracts` package with message and port types [contracts] — PR #17 merged: 5 branded types, 3 commands, 9 events, MessageEnvelope
- (PL-22) Migrate from Node.js + pnpm to Bun runtime [infra] — Runtime migration complete
- (PL-12) Database structure decision (shared vs separate files) — Accepted [adr: [ADR-0004]]
- (PL-19) Timer delegation strategy (custom vs broker delay) — Accepted [adr: [ADR-0003]]
- (PL-21) Correct NATS delay capability evaluation in ADR-0002 — PR merged
- (PL-18) Choose broker family — Accepted [adr: [ADR-0002]]
- (PL-17) Decide topology: modular monolith vs minimal services — Accepted [adr: [ADR-0001]]

<!-- Keep last few wins visible. Archive older items by copying them to an Archive section/file if desired. -->

## Notes (today)

- Focus: PL-4 🚀 IN PROGRESS — Timer module with periodic polling scheduler (5s interval) per [ADR-0003]. Implementing durable timer entries, Clock/EventBus ports, and DueTimeReached emission.
- Approach: Simple polling loop `WHERE dueAt <= now`, broker-agnostic, SQLite persistence with `(tenantId, serviceCallId)` key.
- Next steps: Create timer package structure, define TimerEntry model, implement scheduler loop with Effect.

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
[ADR-0003]: ../decisions/ADR-0003-timer.md
[ADR-0004]: ../decisions/ADR-0004-database.md
[ADR-0005]: ../decisions/ADR-0005-schema.md
[ADR-0006]: ../decisions/ADR-0006-idempotency.md
[ADR-0007]: ../decisions/ADR-0007-api.md
[ADR-0008]: ../decisions/ADR-0008-outbox.md
[ADR-0009]: ../decisions/ADR-0009-observability.md
