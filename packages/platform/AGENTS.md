# Agent Instructions — Platform Package

## Package Purpose

The **Platform** package provides foundational infrastructure for cross-module communication. It defines message types, port interfaces, and shared routing that enables modules to communicate without direct dependencies.

## Key Responsibilities

- Define message type contracts (Commands and Events)
- Provide port interfaces (EventBusPort, UUIDPort)
- Enable type-safe inter-module communication
- Follow hexagonal architecture principles

## What's Inside

### Messages (`./messages`)

Type definitions for all commands and events:

- **Commands:** Imperative requests (ScheduleTimer, StartExecution)
- **Events:** Facts about what happened (DueTimeReached, ServiceCallScheduled)
- **Organization:** By module namespace (Orchestration, Execution, Timer, Api)

### Ports (`./ports`)

Domain-facing interfaces for external dependencies:

- **EventBusPort:** Message broker abstraction (publish/subscribe)
- **UUIDPort:** UUID v7 generation service

## Usage Guidelines

### Message Types

```typescript ignore
import type * as Messages from "@event-service-agent/platform/messages";

// Type-safe message handling
const handleCommand = (cmd: Messages.Orchestration.Commands.ScheduleTimer) => {
  // Implementation
};
```

### Port Injection

```typescript ignore
import { EventBusPort } from "@event-service-agent/platform/ports";

// Depend on port, not implementation
const workflow = Effect.gen(function* () {
  const bus = yield* EventBusPort;
  yield* bus.publish([envelope]);
});
```

## Architecture Principles

### ✅ Do

- Define message contracts as TypeScript types (structural typing)
- Keep ports minimal (single responsibility)
- Use Effect types for all port methods
- Document message schemas in `docs/design/messages.md`

### ❌ Don't

- Include business logic (this is infrastructure only)
- Create circular dependencies with domain packages
- Add implementation details (adapters belong in other packages)
- Define domain entities here (use `@event-service-agent/schemas`)

## Adding New Messages

**Steps:**

1. Define type in appropriate namespace (e.g., `messages/timer.ts`)
2. Document schema in `docs/design/messages.md`
3. Add to exports in `messages/index.ts`
4. Update consuming modules

**Example:**

```typescript ignore
// messages/timer.ts
export namespace Timer {
  export namespace Commands {
    export type ScheduleTimer = {
      type: "ScheduleTimer";
      tenantId: TenantId;
      serviceCallId: ServiceCallId;
      dueAt: Iso8601DateTime;
    };
  }
}
```

## Adding New Ports

**Steps:**

1. Create port file in `ports/` directory
2. Define `Context.Tag` service interface
3. Use Effect types for all methods
4. Document in `docs/design/ports.md`
5. Implement adapter in appropriate package

**Example:**

```typescript ignore
// ports/my-service.port.ts
import { Context, Effect } from "effect";

export class MyServicePort extends Context.Tag("MyServicePort")<
  MyServicePort,
  {
    readonly doThing: (input: string) => Effect.Effect<Result, MyError>;
  }
>() {}
```

## Testing

**This package contains no business logic, so minimal testing needed:**

- Type-level tests (TypeScript compiler catches issues)
- Port interface documentation (examples in TSDoc)
- Integration tests in consuming packages

## Related Documentation

- **Ports Design:** `../../docs/design/ports.md`
- **Messages Catalog:** `../../docs/design/messages.md`
- **Architecture:** `../../docs/design/hexagonal-architecture-layers.md`

## Current Status

**Implemented:**

- Message type definitions for Timer module
- EventBusPort and UUIDPort interfaces
- Topic routing for NATS integration

**Pending:**

- Orchestration message types
- Execution message types
- API message types

---

See root-level `AGENTS.md` for project-wide guidelines.
