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

-

Links

- Kanban: [`../plan/kanban.md`](../plan/kanban.md)
