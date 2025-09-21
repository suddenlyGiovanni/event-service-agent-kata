# ADR-0004: Database Choice (SQLite vs Postgres)

Status: Proposed

Problem

- Choose the DB engine for MVP and outline a migration path.

Context

- Queries: list/detail with filters; multi-tenancy with leading tenantId in indexes; outbox in same DB.

Options

1. SQLite with migrations; fast local dev.
2. PostgreSQL; production-grade from day one.

Decision (TBD)

- Lean SQLite for MVP with an adapter path to Postgres.

Consequences (TBD)

- Quicker start; plan for migration when scaling.
