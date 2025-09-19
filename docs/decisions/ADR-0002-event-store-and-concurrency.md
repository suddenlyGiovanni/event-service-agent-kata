# ADR-0002: Event store model and optimistic concurrency

Status: Proposed
Date: 2025-09-19

## Problem

We need a durable source of truth for domain events (ES-first posture). The store must support append-only streams per aggregate, efficient load for folding state, and optimistic concurrency with expected version checks. The data model (stream identity shape, versioning) and technology choice will impact correctness, rebuild speed, and operational complexity.

## Context

- Per-aggregate ordering and versioned appends are required by Orchestration/Execution.
- Tenancy requires keys that scope by `tenantId`.
- Rebuilds and projections rely on complete, ordered event history.
