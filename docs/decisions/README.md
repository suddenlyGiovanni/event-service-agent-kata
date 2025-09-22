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

Core ADRs (canonical)

- ADR-0001: [Topology — Modular Monolith vs Minimal Services][ADR-0001]
- ADR-0002: [Message Broker Family (dev/prod)][ADR-0002]
- ADR-0003: [Timer Strategy][ADR-0003]
- ADR-0004: [Database Choice (SQLite vs Postgres)][ADR-0004]
- ADR-0005: [Schema & Indexing][ADR-0005]
- ADR-0006: [Idempotency Strategy][ADR-0006]
- ADR-0007: [API HTTP Mapping][ADR-0007]
- ADR-0008: [Outbox Pattern & Dispatcher][ADR-0008]
- ADR-0009: [Observability Baseline][ADR-0009]

Gates Index

Ordered Gates (Decision Flow)

- Gate 01 — Topology → [ADR-0001]
- Gate 02 — Broker → [ADR-0002]
- Gate 03 — Timer → [ADR-0003]
- Gate 04 — Database → [ADR-0004]
- Gate 05 — Schema → [ADR-0005]
- Gate 06 — Idempotency → [ADR-0006]
- Gate 07 — API → [ADR-0007]
- Gate 08 — Outbox → [ADR-0008]
- Gate 09 — Observability → [ADR-0009]

Checklist

- [x] Gate 01 — Topology (Status: Accepted)
- [ ] Gate 02 — Broker (Status: Proposed)
- [ ] Gate 03 — Timer (Status: Proposed)
- [ ] Gate 04 — Database (Status: Proposed)
- [ ] Gate 05 — Schema (Status: Proposed)
- [ ] Gate 06 — Idempotency (Status: Proposed)
- [ ] Gate 07 — API (Status: Proposed)
- [ ] Gate 08 — Outbox (Status: Proposed)
- [ ] Gate 09 — Observability (Status: Proposed)

Links

- Kanban: [`../plan/kanban.md`](../plan/kanban.md)

---

[ADR-0001]: ADR-0001-topology.md
[ADR-0002]: ADR-0002-broker.md
[ADR-0003]: ADR-0003-timer.md
[ADR-0004]: ADR-0004-database.md
[ADR-0005]: ADR-0005-schema.md
[ADR-0006]: ADR-0006-idempotency.md
[ADR-0007]: ADR-0007-api.md
[ADR-0008]: ADR-0008-outbox.md
[ADR-0009]: ADR-0009-observability.md
