# @event-service-agent/schemas

**Single source of truth for all Effect Schemas** — domain messages, foundational types, and envelope definitions.

## What's This Package?

All runtime-validated types used across modules. If it has `Schema.Class` or `Schema.brand`, it lives here.

**Key insight**: Domain messages are **integration contracts** (not internal implementation details), so they belong in a shared package.

## What's Inside

```txt
shared/              TenantId, ServiceCallId, UUID7, Iso8601DateTime
messages/
  timer/             DueTimeReached
  orchestration/     (coming soon)
  execution/         (coming soon)
  api/               (coming soon)
envelope/            MessageEnvelope, DomainMessage union
http/                RequestSpec
```

## Quick Start

### Generate a branded ID

```typescript ignore
import { TenantId } from '@event-service-agent/schemas/shared'

const id = yield * TenantId.makeUUID7() // Effect<TenantId, ParseError, UUID7>
```

### Create a domain event

```typescript ignore
import { DueTimeReached } from '@event-service-agent/schemas/messages/timer'

const event = new DueTimeReached({
	tenantId,
	serviceCallId,
	reachedAt: timestamp,
}) // Validated at construction
```

### Decode from JSON (e.g., NATS message)

```typescript ignore
import { MessageEnvelope } from '@event-service-agent/schemas/envelope'

const envelope = yield * MessageEnvelope.decodeJson(jsonString)

// Pattern match on typed payload
if (envelope.payload._tag === 'DueTimeReached') {
	yield * handle(envelope.payload) // TypeScript knows the type!
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

```txt
effect → schemas → platform → modules
```

## UUID7 Service Dependency Pattern

### Why Schemas Depends on Platform

Branded ID schemas (`TenantId`, `ServiceCallId`, etc.) provide a `makeUUID7()` method that requires the `UUID7` service from `@event-service-agent/platform`. This creates a **runtime-only** dependency that doesn't create circular type dependencies.

**Key insight**: Schemas define the _types_, platform provides the _service implementation_.

### How It Works

```typescript ignore
// In schemas/src/shared/tenant-id.schema.ts
import * as Service from '@event-service-agent/platform/uuid7' // Runtime service

export class TenantId extends UUID7.pipe(Schema.brand(TenantIdBrand)) {
	static readonly makeUUID7 = (time?: DateTime.Utc): Effect.Effect<TenantId, ParseError, Service.UUID7> =>
		Service.generateUUID7(time).pipe(Effect.flatMap(TenantId.decode), Effect.withSpan('TenantId.makeUUID7'))
}
```

### Usage Pattern

**Consumer code must provide the service**:

```typescript ignore
import { TenantId } from '@event-service-agent/schemas/shared'
import { UUID7 } from '@event-service-agent/platform/uuid7'

const program = Effect.gen(function* () {
	const tenantId = yield* TenantId.makeUUID7()
	// ...
}).pipe(Effect.provide(UUID7.Default))
```

### Why This Doesn't Create Circular Dependencies

**Type level**: Schemas only reference platform's service _interface_ (not module types).

**Runtime level**: Dependency flows one direction:

1. Schemas _requires_ platform's UUID7 service
2. Platform never imports from schemas for its UUID7 implementation
3. Modules depend on both (but never vice versa)

**Dependency graph**:

```text
effect
  ↓
schemas (types + schema logic)
  ↓ (runtime service dependency)
platform (UUID7 service implementation)
  ↓
modules (timer, orchestration, etc.)
```

This pattern allows schemas to provide convenient factory methods (`makeUUID7()`) while keeping the service implementation in platform where it belongs with other infrastructure concerns (ports, routing, etc.).

See [ADR-0012](../../docs/decisions/ADR-0012-package-structure.md) for architectural rationale.
