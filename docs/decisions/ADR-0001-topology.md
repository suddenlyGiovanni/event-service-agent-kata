# ADR-0001: Topology — Modular Monolith vs Minimal Services

Status: Proposed

Problem

- Decide how to structure deployment topology for the Service Agent BC and draw internal boundaries (API inside vs separate; early Execution worker split).

Context

- Modules: API, Orchestration (single writer), Execution (worker), Timer, adapters (DB, Bus, Outbox).
- MVP should be simple to operate and evolve to distributed if needed; ordering and single-writer constraints favor colocating Orchestration with DB.

Options

1. Modular Monolith (single process) with clear package boundaries; one deployable.
2. Minimal Services (2–3 processes): API+Orchestration together; Execution workers separate; optional Timer service. Real broker enables decoupling.

Decision (TBD)

- Prefer Option 1 for MVP; design boundaries and ports so Option 2 is a natural extraction. Decide if API remains inside or is a separate edge, and whether Execution should be split early.

Consequences (TBD)

- Faster iteration and simpler local demo; later scale-out by extracting Worker and/or API with minimal change.
