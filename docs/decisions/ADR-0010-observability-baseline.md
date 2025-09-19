# ADR-0010: Observability baseline (correlation, causation, logs/metrics)

Status: Proposed
Date: 2025-09-19

## Problem

We need a minimal, consistent observability baseline to trace requests across API, Orchestration, Execution, Timer, and Reporting. This includes propagation of correlationId/causationId, structured logs at key points, and minimal metrics (consumer lag, DLQ counts) to operate the system reliably.

## Context

- Broker-first communication requires end-to-end trace propagation.
- At-least-once delivery complicates tracing without consistent IDs.
- MVP needs lightweight instrumentation without heavy vendor lock-in.
