# Agent Instructions — Schemas Package

## Package Purpose

The **Schemas** package is the **single source of truth** for all Effect Schema definitions. It contains domain messages, foundational types, and envelope definitions used across all modules.

## Key Insight

Domain messages are **integration contracts** (not internal implementation details), so they belong in a shared package that all modules can depend on without creating circular dependencies.

## What's Inside

```text
shared/              # Foundational types (TenantId, ServiceCallId, UUID7, etc.)
messages/
  timer/             # Timer domain events (DueTimeReached)
  orchestration/     # Orchestration events (coming soon)
  execution/         # Execution events (coming soon)
  api/               # API events (coming soon)
envelope/            # MessageEnvelope, DomainMessage union
http/                # RequestSpec for HTTP requests
```

## Usage Guidelines

### Branded IDs

```typescript ignore
import { TenantId, ServiceCallId } from "@event-service-agent/schemas/shared";

// Generate UUID v7
const tenantId = yield* TenantId.makeUUID7();
const serviceCallId = yield* ServiceCallId.makeUUID7();

// Parse from string
const parsed = yield* Schema.decode(TenantId)("01JFQR...");
```

### Domain Events

```typescript ignore
import { DueTimeReached } from "@event-service-agent/schemas/messages/timer";

// Construct with validation
const event = new DueTimeReached({
  tenantId,
  serviceCallId,
  reachedAt: timestamp,
});

// Decode from JSON
const decoded = yield* Schema.decode(DueTimeReached)(jsonData);
```

### Message Envelopes

```typescript ignore
import { MessageEnvelope } from "@event-service-agent/schemas/envelope";

// Wrap event in envelope
const envelope = new MessageEnvelope({
  envelopeId: yield* EnvelopeId.makeUUID7(),
  correlationId,
  payload: event,
  metadata: { source: "timer-module" },
});
```

## Schema Conventions

### Branded Types

Use `Schema.brand` for type-safe IDs:

```typescript ignore
export const TenantId = UUID7.pipe(Schema.brand("TenantId"));
export type TenantId = Schema.Schema.Type<typeof TenantId>;

export namespace TenantId {
  export const makeUUID7 = (): Effect.Effect<TenantId, ParseError, UUID7> =>
    Effect.gen(function* () {
      const uuid = yield* UUID7;
      return yield* Schema.decode(TenantId)(uuid);
    });
}
```

### Tagged Classes

Use `Schema.TaggedClass` for discriminated unions:

```typescript ignore
export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(
  "DueTimeReached",
  {
    tenantId: TenantId,
    serviceCallId: ServiceCallId,
    reachedAt: Iso8601DateTime,
  }
) {}
```

### ISO 8601 Timestamps

Always use `Iso8601DateTime` (not native `Date`):

```typescript ignore
export const Iso8601DateTime = Schema.String.pipe(
  Schema.pattern(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    "ISO 8601 UTC timestamp"
  ),
  Schema.brand("Iso8601DateTime")
);
```

## Adding New Schemas

**Steps:**

1. Create schema file in appropriate directory
2. Export from package index
3. Add TSDoc with usage examples
4. Document in `docs/design/messages.md` (for domain messages)
5. Write validation tests

**Example:**

```typescript ignore
// messages/orchestration/service-call-scheduled.ts
export class ServiceCallScheduled extends Schema.TaggedClass<ServiceCallScheduled>()(
  "ServiceCallScheduled",
  {
    tenantId: TenantId,
    serviceCallId: ServiceCallId,
    scheduledAt: Iso8601DateTime,
    dueAt: Iso8601DateTime,
  }
) {}
```

## Validation Philosophy

**Runtime validation at boundaries:**

- Decode external data (JSON, HTTP requests, database rows)
- Encode for transmission (events to broker, API responses)
- Trust data within domain (already validated)

**Example:**

```typescript ignore
// ✅ Decode at boundary
const command = yield* Schema.decode(ScheduleTimer)(jsonData);

// ✅ Use validated data in domain
const timer = yield* TimerEntry.schedule(command);

// ✅ Encode for transmission
const encoded = yield* Schema.encode(DueTimeReached)(event);
```

## Testing Guidelines

### Schema Validation Tests

```typescript ignore
import { describe, it, expect } from "@effect/vitest";
import { Schema } from "effect";

describe("TenantId", () => {
  it.effect("should validate correct UUID v7", () =>
    Effect.gen(function* () {
      const valid = "01JFQR7Z8B1234567890ABCDEF";
      const result = yield* Schema.decode(TenantId)(valid);
      expect(result).toBe(valid);
    })
  );

  it.effect("should reject invalid UUID", () =>
    Effect.gen(function* () {
      const invalid = "not-a-uuid";
      const result = yield* Schema.decode(TenantId)(invalid).pipe(
        Effect.either
      );
      expect(Either.isLeft(result)).toBe(true);
    })
  );
});
```

## Architecture Principles

### ✅ Do

- Use `Schema.TaggedClass` for domain events
- Use `Schema.brand` for type-safe primitives
- Export both schema and type from same file
- Add TSDoc with `@example` blocks
- Include runtime validation

### ❌ Don't

- Include business logic (schemas are data only)
- Create mutable classes (all schemas immutable)
- Use native `Date` (use `Iso8601DateTime`)
- Use `null` (use `Schema.optional` or `Option`)
- Skip validation at boundaries

## Multi-Tenancy

**Every domain message must include `tenantId`:**

```typescript ignore
// ✅ Good: tenantId required
export class MyEvent extends Schema.TaggedClass<MyEvent>()("MyEvent", {
  tenantId: TenantId,
  // ... other fields
}) {}

// ❌ Bad: missing tenantId
export class BadEvent extends Schema.TaggedClass<BadEvent>()("BadEvent", {
  // ... fields without tenantId
}) {}
```

## Related Documentation

- **Messages Catalog:** `../../docs/design/messages.md`
- **Domain Model:** `../../docs/design/domain.md`
- **ADR-0010:** Identity generation (UUID v7)

## Current Status

**Implemented:**

- Shared types (TenantId, ServiceCallId, UUID7, Iso8601DateTime)
- Timer events (DueTimeReached)
- MessageEnvelope wrapper
- HTTP RequestSpec

**Pending:**

- Orchestration events (ServiceCallScheduled, etc.)
- Execution events (ExecutionSucceeded, ExecutionFailed)
- API command schemas

---

See root-level `AGENTS.md` for project-wide guidelines.
