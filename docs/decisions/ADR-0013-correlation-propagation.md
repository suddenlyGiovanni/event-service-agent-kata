# ADR-0013: CorrelationId Propagation Through Pure Domain Events

Status: Accepted

## Problem

After refactoring to pure domain events (PL-23, PR#36), the `correlationId` propagation chain is broken. Timer adapter sets `correlationId: Option.none()` in message envelopes, preventing distributed tracing across async boundaries.

**Core tension**: Domain events should represent business facts (pure), but message envelopes require infrastructure metadata (correlationId, causationId) for observability.

## Context

### Current State (Post-PL-23)

- **MessageEnvelope Schema**: Carries `tenantId`, `aggregateId`, `correlationId`, `causationId`, `timestampMs`, `payload`
- **DueTimeReached** (pure domain event): Carries `tenantId`, `serviceCallId`, `reachedAt` (no infrastructure metadata)
- **Timer aggregate**: Stores `correlationId` from original ScheduleTimer command
- **Port signature**: `publishDueTimeReached(event: DueTimeReached): Effect<void, PublishError>`
- **Adapter behavior**: Sets `correlationId: Option.none()` (BROKEN!)

### Root Cause

Port signature changed from `publishDueTimeReached(timer, firedAt)` to `publishDueTimeReached(event)`. Adapter no longer has access to `timer.correlationId`.

### Requirements

1. **Distributed Tracing**: All messages in request flow share same `correlationId` (ADR-0009)
2. **Causality Chain**: Each message knows immediate cause via `causationId`
3. **Domain Purity**: Events represent business facts, not infrastructure concerns
4. **Hexagonal Architecture**: Ports don't expose domain aggregates to adapters
5. **Multi-Tenancy**: All operations scoped by `tenantId`

### Architectural Constraints

- **Hexagonal Architecture**: Domain defines ports, adapters implement
- **Single Writer**: Only Orchestration writes to domain tables (ADR-0004)
- **Event-Driven**: Asynchronous communication via message broker (ADR-0002)
- **Effect-TS Ecosystem**: Leverage Effect patterns (Context, Layers, type-driven requirements)

### Related ADRs

- **[ADR-0009]**: Observability baseline (correlationId requirement)
- **[ADR-0011]**: Message Schema Validation (MessageEnvelope structure)
- **[ADR-0010]**: Identity generation strategy (correlationId lifecycle)

## Options

### Option A: PublishContext Parameter (Explicit)

Pass metadata alongside domain event via separate context object.

```typescript
// Port signature
interface PublishContext {
  readonly correlationId: Option<CorrelationId>
  readonly causationId: Option<EnvelopeId>
}

publishDueTimeReached(
  event: DueTimeReached,
  context: PublishContext
): Effect<void, PublishError>

// Workflow
yield* eventBus.publishDueTimeReached(
  dueTimeReachedEvent,
  {
    correlationId: timer.correlationId,
    causationId: Option.none()
  }
)

// Adapter
const envelope = new MessageEnvelope({
  payload: event,
  correlationId: context.correlationId,
  causationId: context.causationId,
  // ...
})
```

**Pros**:

- ✅ Preserves domain purity (metadata separate from event)
- ✅ Explicit dependencies (clear what's needed)
- ✅ Flexible (extend context without changing events)
- ✅ Type-safe (compiler enforces context parameter)

**Cons**:

- ⚠️ Extra parameter in every publish call
- ⚠️ Context must be extracted from aggregate in workflow
- ⚠️ Two sources of truth (event + context)

**Trade-offs**: Verbosity for explicitness; workflow must handle extraction.

---

### Option B: Enrich Domain Events with Metadata

Include infrastructure metadata in domain event schema.

```typescript
// Domain event with metadata
export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(
  "DueTimeReached",
  {
    ...ServiceCallEventBase.fields,
    reachedAt: Schema.DateTimeUtc,
    correlationId: Schema.optionalWith(CorrelationId, {
      as: "Option",
      exact: true,
    }),
    causationId: Schema.optionalWith(EnvelopeId, { as: "Option", exact: true }),
  }
) {}
```

**Pros**:

- ✅ Simpler port signature (single parameter)
- ✅ All data in one place
- ✅ Matches Event Sourcing patterns

**Cons**:

- ❌ Violates domain purity (correlationId is infrastructure, not business fact)
- ❌ Leaks infrastructure concerns into domain layer
- ❌ Contradicts PL-23 design goal (pure domain events)

**Trade-offs**: Simplicity at cost of architectural purity.

---

### Option C: Adapter Queries Aggregate

Adapter fetches aggregate to get metadata before wrapping.

```typescript
// Adapter queries persistence
publishDueTimeReached(event: DueTimeReached) {
  return Effect.gen(function* () {
    const persistence = yield* TimerPersistencePort
    const timer = yield* persistence.find(event.tenantId, event.serviceCallId)

    const envelope = new MessageEnvelope({
      payload: event,
      correlationId: Option.flatMap(timer, t => t.correlationId),
      // ...
    })
  })
}
```

**Pros**:

- ✅ Preserves domain purity
- ✅ No extra parameters

**Cons**:

- ❌ Extra database query per publish (performance hit)
- ❌ Adapter depends on persistence (additional coupling)
- ❌ Violates hexagonal architecture (adapter shouldn't query domain)
- ❌ Race conditions possible
- ❌ Doesn't work for aggregates that no longer exist

**Trade-offs**: Performance and architectural violations.

---

### Option D: Pass Aggregate to Adapter

Domain events carry aggregate reference.

```typescript
publishDueTimeReached(
  event: DueTimeReached,
  timer: TimerEntry
): Effect<void, PublishError>
```

**Pros**:

- ✅ No extra DB query
- ✅ Access to all aggregate context

**Cons**:

- ❌ Adapter depends on domain model (breaks hexagonal architecture)
- ❌ Port signature couples to domain aggregate
- ❌ Workflow must pass full aggregate (leaks domain into port)
- ❌ Doesn't work with events without source aggregates

**Trade-offs**: Very tight coupling between layers.

---

### Option E: Ambient Context (Effect Context) ⭐ **CHOSEN**

Use Effect's Context system to carry metadata implicitly.

```typescript
// 1. Define Context Tag (platform package)
export class MessageMetadata extends Context.Tag('MessageMetadata')<
  MessageMetadata,
  {
    readonly correlationId: Option<CorrelationId>
    readonly causationId: Option<EnvelopeId>
  }
>() {}

// 2. Port signature requires context (R parameter)
publishDueTimeReached(
  event: DueTimeReached
): Effect<void, PublishError, MessageMetadata>  // ← Requires context

// 3. Workflow provisions context (per-request data)
yield* eventBus.publishDueTimeReached(event).pipe(
  Effect.provideService(MessageMetadata, {
    correlationId: timer.correlationId,  // Extract from aggregate
    causationId: Option.none()
  })
)

// 4. Adapter consumes context (type-safe)
const metadata = yield* MessageMetadata  // Type-driven requirement
const envelope = new MessageEnvelope({
  payload: event,
  correlationId: metadata.correlationId,
  causationId: metadata.causationId,
  // ...
})
```

**Pros**:

- ✅ Clean port signature (no extra parameters)
- ✅ Metadata doesn't pollute domain events
- ✅ Effect-idiomatic (uses Context system naturally)
- ✅ Type-driven requirements (R parameter makes dependencies explicit)
- ✅ Easy to extend (add metadata without changing signatures)
- ✅ Testable (Effect.provideService for tests)
- ✅ Aligns with Effect ecosystem patterns we're already using

**Cons**:

- ⚠️ Requires understanding Effect Context system
- ⚠️ Context must be provided at correct scope
- ⚠️ Testing requires proper context provisioning

**Trade-offs**: Less visible dependencies (implicit in R parameter) vs cleaner signatures; requires Effect knowledge.

## Decision

**Option E: Ambient Context (Effect Context)** — ACCEPTED (2025-11-05)

### Rationale

1. **Ecosystem Alignment**: We're fully committed to Effect-TS patterns (Layers, Schema, tagged errors). Ambient Context is the idiomatic Effect way to handle cross-cutting concerns.

2. **Type Safety**: R parameter makes requirements explicit in type system. Compiler enforces context provisioning at call sites.

3. **Scalability**: As we add more modules (Orchestration, Execution), this pattern scales naturally without signature changes.

4. **Domain Purity**: Preserves clean separation between domain events (business facts) and infrastructure metadata.

5. **Testing Ergonomics**: `Effect.provideService` makes test setup explicit and composable with existing `Layer` patterns.

6. **Future-Proof**: Easy to add more metadata fields (tracing spans, user context) without breaking existing code.

### Implementation Plan

See `docs/plan/correlation-context-implementation.md` for 14-task breakdown (PL-24, ~7h estimate).

**Key Components**:

- `MessageMetadata` Context.Tag in `@event-service-agent/platform`
- Updated port signatures with `MessageMetadata` requirement
- Workflow context provisioning via `Effect.provideService`
- Test helpers for context setup

## Consequences

### Positive

- ✅ **Distributed Tracing Restored**: correlationId propagates through envelopes (fixes PR#36 P0 issue)
- ✅ **Architectural Purity**: Domain events remain pure business facts
- ✅ **Type-Driven Requirements**: Missing context = compile error (fail-fast)
- ✅ **Effect Idiomatic**: Leverages ecosystem patterns consistently
- ✅ **Testable**: Clear provisioning pattern via `Effect.provideService`
- ✅ **Extensible**: Add metadata fields without signature changes
- ✅ **Consistent**: Same pattern for all modules (Orchestration, Execution, Timer)

### Negative

- ⚠️ **Learning Curve**: Team must understand Effect Context system
- ⚠️ **Implicit Dependencies**: Context requirements less visible than parameters (mitigated by R parameter in types)
- ⚠️ **Test Boilerplate**: Every test must provision context (mitigated by helpers)

### Neutral

- ℹ️ **Documentation Required**: Clear examples for future module developers
- ℹ️ **Pattern Docs**: Create reference guide in `docs/patterns/message-metadata-context.md`

### Relationship to OpenTelemetry (ADR-0009)

**Clarification**: MessageMetadata Context is **orthogonal** to OpenTelemetry:

- **MessageMetadata (This ADR)**: Application-level business workflow tracking

  - Lives in: MessageEnvelope payload
  - Purpose: Link messages in business logic (ServiceCall lifecycle)
  - Tools: Structured logs, event store queries
  - Lifecycle: Generated at API entry, constant across flow

- **OpenTelemetry (ADR-0009 Phase 2)**: Infrastructure-level distributed tracing
  - Lives in: HTTP headers, broker message headers (NOT payload)
  - Purpose: Infrastructure observability (latency, errors, dependencies)
  - Tools: APM systems (Jaeger, Zipkin, Datadog)
  - Lifecycle: New trace/span per hop

**Bridge**: Inject `correlationId` into OTEL span attributes for cross-referencing.

### Migration

- **Timer Module**: Immediate implementation (PL-24)
- **Orchestration/Execution**: Follow same pattern when implemented
- **Backward Compatibility**: No wire format changes (MessageEnvelope schema unchanged)

### Validation

- All 66 timer tests must pass after implementation
- Full suite (282 tests) must remain green
- No TypeScript errors (MessageMetadata requirement enforced by compiler)
- Documentation updated to reflect actual pattern (no false `makeEnvelope` claims)

## References

- **PR#36**: feat(timer): refactor EventBusPort to use pure domain types (PL-23)
- **Implementation Plan**: `docs/plan/correlation-context-implementation.md` (PL-24)
- **[ADR-0009]**: Observability baseline
- **[ADR-0011]**: Message Schema Validation
- **[ADR-0010]**: Identity generation strategy

## Appendix: Industry Patterns

### Event Sourcing

- Events are immutable facts about what happened
- Metadata (correlationId, timestamp) included in event store envelope
- Pattern: Event + Metadata wrapper (similar to this ADR's approach)

### Domain-Driven Design (DDD)

- Domain events capture business intent, not technical concerns
- Eric Evans: "Events are domain objects, but metadata is infrastructure"
- Pattern: Separate domain events from technical metadata

### Microservices Observability

- OpenTelemetry: Trace context propagated via headers/ambient context
- Pattern: Infrastructure metadata outside core message content

### Message Brokers

- RabbitMQ/Kafka: Headers for metadata, body for payload
- Pattern: Metadata envelope separate from domain payload

---

[ADR-0009]: ./ADR-0009-observability.md
[ADR-0010]: ./ADR-0010-identity.md
[ADR-0011]: ./ADR-0011-message-schemas.md
