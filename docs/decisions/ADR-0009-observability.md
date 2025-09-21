# ADR-0009: Observability Baseline

Status: Proposed

Problem

- Provide minimal yet effective logs and metrics for debugging and SLOs across modules.

Context

- Multi-tenant context and per-call correlation must be present. Broker choice influences tracing options.

Options

1. Structured logs (JSON) with `tenantId`, `serviceCallId`, `correlationId`, event names; counters and durations per module.
2. Full OpenTelemetry traces across HTTP and broker.

Decision (TBD)

- Start with structured logs and basic metrics (counts, latency). Add tracing adapters once broker is selected and stable.

Consequences (TBD)

- Low overhead, actionable signals from day one; clear path to tracing later.
