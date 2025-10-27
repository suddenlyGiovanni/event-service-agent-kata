# @event-service-agent/schemas

**Single source of truth for all Effect Schemas** — domain messages, foundational types, and envelope definitions.

## What's This Package?

All runtime-validated types used across modules. If it has `Schema.Class` or `Schema.brand`, it lives here.

**Key insight**: Domain messages are **integration contracts** (not internal implementation details), so they belong in a shared package.

## What's Inside

```
shared/              TenantId, ServiceCallId, UUID7, Iso8601DateTime
messages/
  timer/             DueTimeReached
  orchestration/     (coming soon)
  execution/         (coming soon)
  api/               (coming soon)
envelope/            MessageEnvelopeSchema, DomainMessage union
http/                RequestSpec
```

## Quick Start

### Generate a branded ID

```typescript
import { TenantId } from '@event-service-agent/schemas/shared'

const id = yield* TenantId.makeUUID7()  // Effect<TenantId, ParseError, UUID7>
```

### Create a domain event

```typescript
import { DueTimeReached } from '@event-service-agent/schemas/messages/timer'

const event = new DueTimeReached({
  tenantId,
  serviceCallId,
  reachedAt: timestamp,
})  // Validated at construction
```

### Decode from JSON (e.g., NATS message)

```typescript
import { MessageEnvelopeSchema } from '@event-service-agent/schemas/envelope'

const envelope = yield* MessageEnvelopeSchema.decodeJson(jsonString)

// Pattern match on typed payload
if (envelope.payload._tag === 'DueTimeReached') {
  yield* handle(envelope.payload)  // TypeScript knows the type!
}
```

## Why Not Define Schemas in Each Module?

**Problem**: Would create circular dependencies:
- Timer needs `TenantId` from contracts
- Contracts needs `DueTimeReached` from timer
- **Circular!** 💥

**Solution**: Extract all schemas to this package (self-contained, depends only on `effect`).

See [ADR-0012](../../docs/decisions/ADR-0012-package-structure.md) for full rationale.

## Who Uses This

- `@event-service-agent/platform` (for types in port signatures)
- `@event-service-agent/timer` (for domain events + branded types)
- All other modules (orchestration, execution, api)

## Design Rule

**Schemas package is self-contained** — zero dependencies on internal packages.

```
effect → schemas → platform → modules
```
