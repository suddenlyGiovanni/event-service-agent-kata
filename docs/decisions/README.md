# Decisions (ADRs)

Purpose

- Capture implementation-affecting decisions separately from domain design.
- Keep each ADR small. Start with the Problem and Context only; decide later.

Workflow

- Draft: create a new `ADR-XXXX-*.md` with Status: Proposed and fill Problem + Context.
- Review: discuss options in PR or issue; do not mix multiple decisions in one ADR.
- Accept: when decided, update Status to Accepted and add Decision + Consequences.
- Evolve: if the decision changes, create a new ADR and mark the old one Superseded.

Status

- Proposed: Problem and Context captured, not decided yet.
- Accepted: Decision taken; include Decision and Consequences sections.
- Superseded: Replaced by a newer ADR (link both ways).

Conventions

- IDs are sequential: `ADR-0001`, `ADR-0002`, …
- Filenames are `ADR-XXXX-short-title.md`.
- Reference ADRs from Kanban/Plan like `[adr: ADR-0001]`.

Index

- [adr: ADR-0001](./ADR-0001-broker-topics-partitions.md): Broker choice, topics, and partitioning — Proposed
- [adr: ADR-0002](./ADR-0002-event-store-and-concurrency.md): Event store model and optimistic concurrency — Proposed
- [adr: ADR-0003](./ADR-0003-message-envelopes-and-versioning.md): Message envelope schema and versioning — Proposed
- [adr: ADR-0004](./ADR-0004-outbox-append-then-publish.md): Outbox for append-then-publish ordering — Proposed
- [adr: ADR-0005](./ADR-0005-api-contracts-and-idempotency.md): API contracts (submit, list, detail) and idempotency — Proposed
- [adr: ADR-0006](./ADR-0006-timer-persistence-and-due-delivery.md): Timer persistence and due-time delivery — Proposed
- [adr: ADR-0007](./ADR-0007-read-store-and-projection-cursoring.md): Read store and projection cursoring — Proposed
- [adr: ADR-0008](./ADR-0008-privacy-redaction-snippets.md): Privacy, redaction, and body/header snippets — Proposed
- [adr: ADR-0009](./ADR-0009-http-execution-policy-and-errors.md): HTTP execution policy and error taxonomy — Proposed
- [adr: ADR-0010](./ADR-0010-observability-baseline.md): Observability baseline (correlation, causation, logs/metrics) — Proposed

Links

- Plan: [`../plan/plan.md`](../plan/plan.md)
- Kanban: [`../plan/kanban.md`](../plan/kanban.md)
