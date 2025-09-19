# ADR-0009: HTTP execution policy and error taxonomy

Status: Proposed
Date: 2025-09-19

## Problem

We need clear rules for mapping HTTP outcomes to domain events, including success/failure thresholds, timeout behavior, and an error taxonomy for failures. These rules influence idempotency, observability, and what appears in projections.

## Context

- Execution emits `ExecutionStarted`, `ExecutionSucceeded`, or `ExecutionFailed`.
- Non-2xx vs 3xx handling must be consistent for MVP.
- Latency and snippet capture should be defined.
