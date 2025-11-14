# Design Documentation

[← Back to Documentation Home](../index.md)

This section contains domain models, architecture patterns, and module specifications for the Event Service Agent system.

---

## 📋 Overview Documents

### Core Design

- **[Domain Model](domain.md)** - Core domain concepts, entities, and multi-tenancy model
- **[Database Schema](database-schema.md)** - Entity relationships, indexes, and multi-tenancy patterns
- **[Hexagonal Architecture Layers](hexagonal-architecture-layers.md)** - Layering strategy and port/adapter patterns
- **[Messages](messages.md)** - Commands, events, and message envelope specifications
- **[Modules & Interactions](modules-and-interactions.md)** - Module boundaries and async communication patterns
- **[Ports](ports.md)** - Port interface contracts and adapter responsibilities

---

## 🔧 Module Specifications

Each module follows hexagonal architecture with clear boundaries:

### [API Module](modules/api.md)

HTTP API layer for accepting service call requests.

- REST endpoints (`/service-calls`)
- Request validation and tenant isolation
- Command publishing to orchestration

### [Timer Module](modules/timer.md)

Time-based scheduling and notifications.

- Timer scheduling workflow
- Due timer polling
- Event publishing on expiration

### [Orchestration Module](modules/orchestration.md)

Service call lifecycle orchestration.

- State machine transitions
- Saga coordination
- Event sourcing

### [Execution Module](modules/execution.md)

External HTTP service call execution.

- HTTP client adapter
- Retry policies
- Result capture

---

## 🏗️ Architecture Principles

All modules adhere to these constraints (enforced in code reviews):

### Single Writer Principle

Only Orchestration writes to domain tables. All other modules consume via events.

### No Cross-Module DB Access

Modules query only their own tables (enforced by ports).

### No Synchronous Cross-Module Calls

All inter-module communication via `EventBusPort` (message broker).

### Idempotency Everywhere

All command/event handlers must be idempotent; keyed by `(tenantId, serviceCallId)`.

### Multi-Tenancy By Default

Every query must filter by `tenant_id`; every message must carry `tenantId`.

---

## 📚 Related Documentation

- [Architecture Decisions (ADRs)](../decisions/) - Why we made these design choices
- [Development Plan](../plan/) - Current implementation status
- [Contributing Guide](../CONTRIBUTING.md) - How to implement these patterns

---

**Note**: Message schemas shown in `messages.md` are wire format contracts for documentation. The **source of truth** for runtime validation is the Effect Schema implementations in each module's `domain/` folder. See [ADR-0011](../decisions/ADR-0011-message-schemas.md) for schema strategy.
