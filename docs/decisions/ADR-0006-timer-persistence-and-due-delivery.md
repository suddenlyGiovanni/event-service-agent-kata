# ADR-0006: Timer persistence and due-time delivery

Status: Proposed
Date: 2025-09-19

## Problem

We need a reliable way to persist scheduled due times and deliver `DueTimeReached` triggers via the broker with at-least-once semantics. The approach must handle process restarts (boot scan and re-enqueue), de-duplication in Orchestration, and avoid duplicate executions.

## Context

- Orchestration guards ensure single execution per ServiceCall.
- Timer may emit duplicates; the system must remain correct.
- Tenancy requires keys scoped by `(tenantId, serviceCallId)`.
