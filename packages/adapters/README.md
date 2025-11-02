# @event-service-agent/adapters

**Infrastructure adapters - Broker, persistence, and HTTP client implementations**

## Purpose

The `adapters` package provides **concrete implementations** of port interfaces defined in `@event-service-agent/platform`. These adapters connect domain logic to real infrastructure like message brokers, databases, and HTTP clients.

## What's Inside

This package is currently a **placeholder** for future infrastructure adapters. As the system evolves, it will contain:

### 🔜 Planned Adapters

#### Message Broker Adapters

- **NATS JetStream**: Production message broker implementation
- **In-Memory**: Test/dev broker for local development
- **Kafka**: Alternative broker adapter (if needed)

#### Persistence Adapters

- **SQLite**: Production database adapter (file-based)
- **PostgreSQL**: Alternative database adapter (if needed)
- **In-Memory**: Test adapter (already in domain modules)

#### HTTP Client Adapters

- **Bun Fetch**: Production HTTP client (native Bun)
- **Mock HTTP**: Test adapter with recorded responses

## Architecture Role

Adapters sit at the **outer layer** of hexagonal architecture:

```txt
┌─────────────────────────────────────┐
│       Domain Modules                │
│  (Timer, Orchestration, etc.)       │
│                                     │
│  Depend on Platform Ports only ✅   │
└─────────────────────────────────────┘
              ↕
   ┌──────────────────────┐
   │  @platform (Ports)   │
   │  Interface contracts │
   └──────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   @adapters (This Package)          │
│   Concrete Implementations          │
│                                     │
│   • NATS JetStream                  │
│   • SQLite                          │
│   • HTTP Clients                    │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   External Infrastructure           │
│   • NATS Server                     │
│   • SQLite Files                    │
│   • HTTP APIs                       │
└─────────────────────────────────────┘
```

**Key Principles:**

- ✅ Implements port interfaces from `@event-service-agent/platform`
- ✅ Contains infrastructure concerns (connection pooling, retries, etc.)
- ✅ Maps infrastructure errors to domain errors
- ✅ Isolated from domain logic (replaceable)
- ✅ Production and test adapters side-by-side

## When to Use This Package

**Use adapters for:**

- Production deployments (real NATS, SQLite, HTTP)
- Integration tests (real infrastructure)
- Performance testing

**Don't use adapters for:**

- Unit tests (use in-memory adapters in domain modules)
- Fast development iteration (use test adapters)

## Dependencies

- **@event-service-agent/platform**: Port interface contracts
- Infrastructure SDKs (to be added as needed):
  - `nats` - NATS JetStream client
  - `bun:sqlite` - SQLite native support
  - Others TBD

## Current Status

**Not Yet Implemented**

This package exists to establish the structure but doesn't contain adapters yet. Current development uses:

- **In-memory adapters** (in domain modules like `timer`) for testing
- **Test doubles** (layers with `Effect.succeed`) for workflows

## Future Development

### Phase 1: Broker Adapter (PL-3)

```typescript
// packages/adapters/src/broker/nats-event-bus.adapter.ts
export class NatsEventBus {
  static readonly Live: Layer.Layer<EventBusPort, NatsError, ...> = 
    Layer.effect(EventBusPort, Effect.gen(function* () {
      const nc = yield* connectNats()
      const js = nc.jetstream()
      
      return EventBusPort.of({
        publish: (envelopes) => /* ... */,
        subscribe: (topics, handler) => /* ... */
      })
    }))
}
```

### Phase 2: Persistence Adapter (PL-6)

```typescript
// packages/adapters/src/persistence/sqlite-timer-persistence.adapter.ts
export class SqliteTimerPersistence {
  static readonly Live: Layer.Layer<TimerPersistencePort, ...> = 
    Layer.effect(TimerPersistencePort, Effect.gen(function* () {
      const db = yield* Database
      
      return TimerPersistencePort.of({
        save: (timer) => /* SQL INSERT */,
        findScheduledTimer: (id) => /* SQL SELECT */,
        findDue: (tenantId, now) => /* SQL SELECT WHERE due */
      })
    }))
}
```

## Testing Strategy

Each adapter should have:

1. **Unit tests**: Adapter logic in isolation (with mocked infrastructure)
2. **Integration tests**: Real infrastructure (NATS container, SQLite file)
3. **Contract tests**: Verify port interface compliance

## Related Documentation

- [ADR-0002: Broker Choice](../../docs/decisions/ADR-0002-broker.md)
- [ADR-0004: Database Choice](../../docs/decisions/ADR-0004-database.md)
- [Hexagonal Architecture Layers](../../docs/design/hexagonal-architecture-layers.md)
- [Ports Design](../../docs/design/ports.md)

## Migration Notes

This package depends on `@event-service-agent/platform` (renamed from `contracts` in PL-14.3). Update imports if developing adapters.
