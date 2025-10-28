# @event-service-agent/platform

**Platform infrastructure - Message types, port interfaces, and shared routing for cross-module communication**

## Purpose

The `platform` package provides the foundational infrastructure that enables modules to communicate without direct dependencies. It defines the contracts and abstractions that all modules depend on, following hexagonal architecture principles.

## What's Inside

### 📬 Messages (`./messages`)
Type definitions for all commands and events in the system:
- **Commands**: Imperative requests (e.g., `ScheduleTimer`, `StartExecution`)
- **Events**: Facts about what happened (e.g., `DueTimeReached`, `ServiceCallScheduled`)
- Organized by module namespaces: `Orchestration`, `Execution`, `Timer`, `Api`

**Usage:**
```typescript
import type * as Messages from '@event-service-agent/platform/messages'

// Type-safe message handling
const handleCommand = (cmd: Messages.Orchestration.Commands.ScheduleTimer) => {
  // ...
}
```

### 🔌 Ports (`./ports`)
Domain-facing interfaces for external dependencies:
- **EventBusPort**: Message broker abstraction (publish/subscribe)
- **UUIDPort**: UUID v7 generation service

Ports define **what** the domain needs, adapters provide **how** it works.

**Usage:**
```typescript
import { EventBusPort } from '@event-service-agent/platform/ports'

// Depend on port, not implementation
const workflow = Effect.gen(function* () {
  const bus = yield* EventBusPort
  yield* bus.publish([envelope])
})
```

### 🗺️ Routing (`./routing`)
Centralized topic/routing configuration:
- Type-safe topic references (e.g., `Topics.Timer.Commands`)
- Metadata about producers/consumers
- Runtime topic validation

**Usage:**
```typescript
import { Topics } from '@event-service-agent/platform/routing'

// Subscribe with type-safe topics
yield* bus.subscribe([Topics.Timer.Commands], handler)
```

### 📦 Types (`./types`)
Shared type definitions:
- **Message.Envelope**: Wire format for broker messages
- **HTTP types**: `RequestSpec`, `RequestSpecWithoutBody`

**Usage:**
```typescript
import type { Message } from '@event-service-agent/platform/types'

const envelope: Message.Envelope = {
  id, type, tenantId, payload, timestampMs
}
```

## Architecture Role

The `platform` package sits at the **center** of the hexagonal architecture:

```
┌─────────────────────────────────────────────┐
│ Domain Modules (Timer, Orchestration, etc.) │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │   Depend on Platform Contracts        │  │
│  │   (Messages, Ports, Types)            │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                    ↕
         ┌──────────────────┐
         │   @platform      │
         │  (This Package)  │
         └──────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│         Infrastructure Adapters              │
│  (NATS, SQLite, HTTP, In-Memory)            │
└─────────────────────────────────────────────┘
```

**Key Principles:**
- ✅ Modules depend on `platform` contracts, never on each other
- ✅ Adapters implement `platform` ports for different technologies
- ✅ Domain code works with messages/ports, not infrastructure details
- ✅ Enables testing with in-memory adapters

## Package Exports

```json
{
  "./messages": "Message type definitions",
  "./ports": "Port interface contracts",
  "./routing": "Topic/routing configuration",
  "./types": "Shared type definitions"
}
```

## Dependencies

- **effect**: Effect system for functional programming patterns
- **@event-service-agent/schemas**: Effect Schema definitions for validation

## Related Documentation

- [ADR-0012: Package Split](../../docs/decisions/ADR-0012-package-split.md) - Why platform was separated from schemas
- [Hexagonal Architecture Layers](../../docs/design/hexagonal-architecture-layers.md)
- [Messages Design](../../docs/design/messages.md)
- [Ports Design](../../docs/design/ports.md)

## Migration Notes

**Renamed from `@event-service-agent/contracts` (PL-14.3)**

This package was previously named `contracts` but was renamed to `platform` to better reflect its role as the foundational infrastructure layer. All imports have been updated across the codebase.
