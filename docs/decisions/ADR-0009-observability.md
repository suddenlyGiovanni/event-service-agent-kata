# ADR-0009: Observability Baseline

Status: Accepted (Phase 1 complete, Phase 2 planned)

## Problem

Provide minimal yet effective logs, metrics, and correlation tracking for debugging and SLOs across modules.

## Context

- **Multi-tenant system**: Every operation scoped to `tenantId`
- **Distributed async messaging**: Service calls span multiple modules via broker
- **Correlation requirements**: Link related operations across module boundaries and time
- **Broker choice influences tracing**: NATS/Kafka have different OpenTelemetry integrations

## Options

### Option 1: Application-Level Correlation Only

Structured logs with `tenantId`, `serviceCallId`, `correlationId` fields. Application manages correlation via `MessageMetadata` Context. No automatic span linking.

### Option 2: Infrastructure-Level Tracing Only

OpenTelemetry traces with automatic span propagation via `traceparent` headers. Relies on infra tooling (broker/HTTP clients) for correlation. No explicit app-level correlation fields.

### Option 3: Dual-Level Observability (Hybrid)

**Application-level** correlation (`MessageMetadata` with `correlationId`/`causationId`) for domain tracing + **infrastructure-level** OpenTelemetry for automatic span linking. Orthogonal concerns that complement each other.

## Decision

**Adopt Option 3 (Dual-Level) with phased rollout**:

### Phase 1: Application-Level Correlation (PL-24) ✅ COMPLETE

**Scope**: Explicit correlation tracking via `MessageMetadata` Context

**Implementation**:

- `MessageMetadata` Context.Tag with `correlationId: Option<CorrelationId>` and `causationId: Option<EnvelopeId>`
- Workflows provide `MessageMetadata` when publishing events
- Adapters extract from Context and populate envelope fields
- Structured logs include correlation fields for querying/filtering
- See ADR-0013 for detailed MessageMetadata Context pattern

**Benefits**:

- ✅ Domain-level correlation visible in application logs
- ✅ Query/filter logs by `correlationId` (e.g., "all operations for HTTP request X")
- ✅ Explicit causation chain (`envelope.id` → next event's `causationId`)
- ✅ Works regardless of infrastructure (no broker/HTTP client dependencies)
- ✅ Type-safe: compiler enforces `MessageMetadata` provisioning

**Limitations**:

- Manual correlation required (grep logs, trace by correlationId)
- No automatic span linking across processes
- No infrastructure-level timing (e.g., broker latency, serialization overhead)

### Phase 2: Infrastructure-Level Tracing (Future)

**Scope**: OpenTelemetry automatic span propagation

**Implementation** (planned):

- Effect OpenTelemetry integration (`@effect/opentelemetry`)
- Automatic `traceparent` header propagation (HTTP requests/responses)
- Broker span injection/extraction (NATS headers or Kafka record headers)
- Infrastructure annotations (message publish/consume latency, DB query timing)

**Benefits**:

- ✅ Automatic span linking (no manual correlationId provisioning)
- ✅ Infrastructure-level metrics (broker latency, serialization time, network hops)
- ✅ Distributed trace visualization (Jaeger/Zipkin/Tempo)
- ✅ Complements application-level correlation

**Integration Strategy**:

- `correlationId` and OpenTelemetry `trace_id` serve **different purposes**:
  - **correlationId**: Business/domain correlation ("this timer fired because of API request X")
  - **trace_id**: Infrastructure tracing ("how long did message X take to propagate?")
- Both coexist: logs/spans can include both fields
- Example: Query logs by `correlationId`, drill into specific spans by `trace_id`

## Consequences

### Positive

✅ **Phase 1 (Current)**:

- Low overhead, actionable domain-level correlation from day one
- Works with any broker/infrastructure (no external dependencies)
- Type-safe: Effect Context ensures metadata propagated correctly
- Debugging: `grep` logs by `correlationId` to trace request flow

✅ **Phase 2 (Future)**:

- Clear path to OpenTelemetry without breaking existing correlation
- Infrastructure and application concerns separated (orthogonal)
- Richer observability: business correlation + infrastructure timing

### Neutral

- Dual-level approach means two correlation mechanisms (intentional separation)
- OpenTelemetry adds complexity (OTLP exporters, collector setup)

### Negative

⚠️ **Phase 1**:

- Manual log querying (no automatic trace UI until Phase 2)
- No infrastructure-level metrics (broker latency unknown)

⚠️ **Phase 2**:

- Requires OpenTelemetry infrastructure (collector, backend like Jaeger)
- Broker instrumentation varies by implementation (NATS vs Kafka)
