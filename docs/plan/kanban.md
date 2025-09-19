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

- [ ] PL-? …

## Ready

<!--
Prioritized queue.
    Pull the top item into Doing. Avoid more than 7 items.
    Link ADRs like [adr: ADR-0001]; add tags like [infra] or [Api].
-->

- [ ] PL-1 Broker choice & topics/partitions [adr: ADR-0001] [infra]
- [ ] PL-2 Event store & optimistic concurrency [adr: ADR-0002] [infra]
- [ ] PL-3 Message envelope schema (headers, versioning) [adr: ADR-0003] [contracts]
- [ ] PL-4 Outbox (append→publish ordering) [adr: ADR-0004] [infra]
- [ ] PL-5 API contracts (submit, list, detail) [adr: ADR-0005] [Api]
- [ ] PL-6 Timer persistence & boot scan [adr: ADR-0006] [Timer]
- [ ] PL-7 Read store & projection cursoring [adr: ADR-0007] [Reporting]
- [ ] PL-8 Privacy/redaction/snippet policy [adr: ADR-0008] [contracts]

## Doing (WIP ≤ 2)

<!-- Only what you're actively working on. Move one item at a time. -->

<!-- Move the top Ready item here when you start it. Keep ≤ 2. -->

## Blocked

<!-- Item is waiting on something (decision, dependency). Note the blocker briefly. -->

- [ ] PL-9 Observability baseline [adr: ADR-0010] [infra] — blocked by [adr: ADR-0003]

## Done (recent)

<!-- Keep last few wins visible. Archive older items by copying them to an Archive section/file if desired. -->

## Notes (today)

<!-- 2-3 bullets max. What you focus on, current risks, next up. -->

- Focus: Lock ADRs 0001–0004 (broker, event store, envelope, outbox)
- Risks/Blocks: Observability ADR depends on envelope; local broker setup friction
- Next up: Draft [adr: ADR-0005] (API), [adr: ADR-0006] (Timer)

---

### Legend

<!--
Minimal legend.
- ID: `PL-#` (plan item)
- Tags: [Api], [Orchestration], [Execution], [Timer], [Reporting], `infra`, `contracts`
- ADR link: `[adr: ADR-000x]` refers to docs/decisions/ADR-000x-\*.md
- WIP: Doing ≤ 2; Ready ≤ 7
-->

[Api]: ../design/contexts/api.md
[Orchestration]: ../design/contexts/orchestration.md
[Execution]: ../design/contexts/execution.md
[Timer]: ../design/contexts/timer.md
[Reporting]: ../design/contexts/reporting.md

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
