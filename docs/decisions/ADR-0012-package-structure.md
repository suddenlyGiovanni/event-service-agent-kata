# ADR-0012: Package Structure - Schemas and Platform Split

- Status: Accepted
- Date: 2025-10-27
- Context: PL-14 (Schema migration), architectural refactoring
- Supersedes: Portions of ADR-0011 regarding "Central Registry in Contracts"

---

## Problem

During PL-14 schema migration, we discovered that the `@event-service-agent/contracts` package has conflicting responsibilities:

1. **Foundational schemas** (TenantId, ServiceCallId, etc.) - Effect Schema definitions with runtime validation
2. **Domain message schemas** (DueTimeReached, ServiceCallScheduled, etc.) - Would create circular dependencies if imported
3. **Port interfaces** (EventBusPort, UUID7Port) - Hexagonal architecture boundaries
4. **Routing configuration** (Topics) - Broker subject naming
5. **Shared services** (UUID7 implementation)

**Core Issue**: Attempting to define `MessageEnvelopeSchema` with typed `DomainMessage` union exposed architectural problems:

### Option 1: Define DTO shapes in contracts (REJECTED)

```typescript
// contracts defines plain DTO shape
export const DomainMessage = Schema.Union(
  Schema.Struct({
    _tag: Literal('DueTimeReached'),
    tenantId: Schema.String,  // ← Lost TenantId brand!
  })
)

// Consumer can't use decoded payload:
const envelope = yield* MessageEnvelopeSchema.decodeJson(json)
yield* workflow.handle(envelope.payload)  
//                     ^^^^^^^^^^^^^^^^
// ❌ TYPE MISMATCH: plain object vs branded types
```

**Fatal DX flaw**: Decoded payload loses type information (brands, validation), defeating the purpose of Effect Schema.

### Option 2: Import schemas from modules (REJECTED)

```typescript
// contracts imports from timer
import { DueTimeReached } from '@event-service-agent/timer/domain'
```

**Circular dependency**: Timer already imports contracts for TenantId → contracts imports timer → circular.

**Violates architecture**: Contracts (shared kernel) should not depend on modules (concrete implementations).

---

## Decision

**Split contracts into two packages:**

### 1. `@event-service-agent/schemas` - All Effect Schemas (Foundation)

**Purpose**: Single source of truth for all Effect Schema definitions (foundational types + domain messages).

**Contents**:

- Foundational schemas: `TenantId`, `ServiceCallId`, `CorrelationId`, `EnvelopeId`, `Iso8601DateTime`, `UUID7`
- Domain message schemas: `DueTimeReached`, `ServiceCallScheduled`, `StartExecution`, etc.
- Envelope schema: `MessageEnvelopeSchema` with typed `DomainMessage` union
- HTTP schemas: `RequestSpec`
- Schema utilities: `UUID7.makeUUID7()`, `TenantId.makeUUID7()`
- Schema-coupled services: `UUID7` service implementation

**Dependencies**: `effect` only (self-contained)

**Structure**:

```
packages/schemas/
  src/
    shared/
      uuid7.schema.ts
      tenant-id.schema.ts
      service-call-id.schema.ts
      correlation-id.schema.ts
      envelope-id.schema.ts
      iso8601-datetime.schema.ts
    uuid7.service.ts
    messages/
      timer/events.schema.ts
      orchestration/
        events.schema.ts
        commands.schema.ts
      execution/events.schema.ts
      api/commands.schema.ts
    envelope/
      domain-message.schema.ts
      message-envelope.schema.ts
    http/
      request-spec.schema.ts
```

### 2. `@event-service-agent/platform` - Infrastructure Abstractions

**Purpose**: Port interfaces, routing configuration, and infrastructure abstractions (hexagonal architecture boundaries).

**Contents**:

- Port interfaces: `EventBusPort`, `UUID7Port`
- Error types: `PublishError`, `SubscribeError` (Data.TaggedError)
- Routing configuration: `Topics` namespace

**Dependencies**: `effect`, `@event-service-agent/schemas`

**Structure**:

```
packages/platform/
  src/
    ports/
      event-bus.port.ts
      uuid.port.ts
    routing/
      topics.ts
```

---

## Rationale

### Why Schemas Package?

1. **Consistency**: All Effect Schemas (foundational + domain) in one place
2. **No circular dependencies**: Self-contained, only depends on `effect`
3. **Single source of truth**: Domain messages defined once, imported by all modules
4. **Full type power**: Branded types preserved through encode/decode
5. **DX Excellence**: Pattern matching works perfectly after decode
6. **Clear purpose**: "Integration Contracts" bounded context in DDD terms

### Why Platform Package?

1. **Separation of concerns**: Interfaces separate from implementations
2. **Hexagonal architecture**: Ports define boundaries, adapters live in modules
3. **Thin layer**: Minimal logic, just contracts and configuration
4. **Depends on schemas**: Port signatures use schema types

### Why Not Keep Everything in Contracts?

**Problem**: Name confusion after splitting

- "Contracts" originally meant "message contracts"
- After extracting schemas, what's left? (ports, routing, services)
- "Platform" better describes infrastructure abstractions

**Alternative considered**: Keep "contracts" name with narrowed scope

- **Rejected**: Causes confusion (people expect message contracts)

---

## Dependency Graph

```
effect (external)
  ↓
schemas (foundational + domain schemas)
  ↓
platform (ports + routing)
  ↓
modules (timer, orchestration, execution, api)
```

**Key properties**:

- Unidirectional dependencies (no cycles)
- Clear layering (foundation → abstractions → implementations)
- Modules depend on both: schemas (for types) + platform (for ports)

---

## Migration Impact

### Package Renaming

- `@event-service-agent/contracts` → `@event-service-agent/platform`

### New Package

- `@event-service-agent/schemas` (created)

### Files Moved to `schemas/`

From `contracts/src/types/`:
- `shared.type.ts` → `schemas/src/shared/*.schema.ts` (split by type)
- `uuid7.type.ts` → `schemas/src/shared/uuid7.schema.ts`
- `http.type.ts` → `schemas/src/http/request-spec.schema.ts`
- `message-envelope.schema.ts` → `schemas/src/envelope/message-envelope.schema.ts`

From `contracts/src/services/`:

- `uuid7.service.ts` → `schemas/src/uuid7.service.ts`

From `timer/src/domain/`:
- `events.domain.ts` → `schemas/src/messages/timer/events.schema.ts`

### Files Remaining in `platform/`

- `contracts/src/ports/` → `platform/src/ports/`
- `contracts/src/routing/` → `platform/src/routing/`

### Files Removed
- `contracts/src/messages/messages.ts` (deprecated interfaces, replaced by schemas)
- `contracts/src/types/message-envelope.type.ts` (old interface, replaced by schema)

### Import Path Changes

**Before**:
```typescript
import { TenantId } from '@event-service-agent/contracts/types'
import { EventBusPort } from '@event-service-agent/contracts/ports'
import { Topics } from '@event-service-agent/contracts/routing'
```

**After**:
```typescript
import { TenantId } from '@event-service-agent/schemas/shared'
import { DueTimeReached } from '@event-service-agent/schemas/messages/timer'
import { MessageEnvelopeSchema } from '@event-service-agent/schemas/envelope'
import { EventBusPort } from '@event-service-agent/platform/ports'
import { Topics } from '@event-service-agent/platform/routing'
```

### Module Dependencies Update

**Before** (`timer/package.json`):
```json
{
  "dependencies": {
    "@event-service-agent/contracts": "workspace:*"
  }
}
```

**After**:
```json
{
  "dependencies": {
    "@event-service-agent/schemas": "workspace:*",
    "@event-service-agent/platform": "workspace:*"
  }
}
```

---

## Documentation Updates Required

### ADRs Referencing "contracts"
- ✅ ADR-0011: Update "Central Registry" section to reference `schemas` package
- ADR-0001: Update topology diagram (contracts → platform + schemas)
- ADR-0002: Update broker references (contracts/routing → platform/routing)
- ADR-0010: Update identity generation (contracts/services → schemas/)

### Design Documents
- `docs/design/ports.md`: Update port locations (contracts → platform)
- `docs/design/messages.md`: Update schema locations (contracts → schemas)
- `docs/design/hexagonal-architecture-layers.md`: Update package references
- `docs/design/modules/*.md`: Update import paths in examples

### Plan Documents
- `docs/plan/kanban.md`: Add migration tasks
- `docs/plan/plan.md`: Update architecture section if applicable

---

## Consequences

### Positive
- ✅ Clear separation of concerns (schemas vs infrastructure)
- ✅ No circular dependencies (clean dependency graph)
- ✅ Excellent DX (full type power, pattern matching works)
- ✅ Single source of truth for schemas
- ✅ Easy to version schemas independently
- ✅ Consistent naming (all schemas together)

### Negative
- ❌ Breaking change (requires migration across all modules)
- ❌ More packages to manage (2 instead of 1)
- ❌ Import paths change (automated refactoring mitigates)

### Neutral
- Package.json workspace configuration needs updates
- CI/build pipeline may need adjustments (though should be automatic)

---

## Migration Strategy

**Phase 1: Create schemas package**
1. Create `packages/schemas/` with package.json
2. Copy relevant files from contracts (keep originals)
3. Update imports within schemas package
4. Verify schemas package builds independently

**Phase 2: Rename contracts → platform**
1. Rename directory: `contracts/` → `platform/`
2. Update package.json name
3. Remove files moved to schemas
4. Update imports within platform
5. Verify platform builds (depends on schemas)

**Phase 3: Update modules**
1. Update timer package.json dependencies
2. Update timer imports (contracts → schemas + platform)
3. Repeat for orchestration, execution, api (when implemented)
4. Verify all tests pass

**Phase 4: Update documentation**
1. Update ADRs (especially ADR-0011)
2. Update design docs (ports.md, messages.md, etc.)
3. Update module design docs (import examples)
4. Update plan documents

**Phase 5: Cleanup**
1. Remove deprecated files (messages.ts, old interfaces)
2. Update root package.json workspace config
3. Verify clean build from scratch
4. Update README if applicable

---

## Alternatives Considered

### A. Keep contracts, define DTO shapes (REJECTED)
- **Pro**: No refactoring needed
- **Con**: Fatal DX issue (decoded payloads unusable, type mismatch)
- **Verdict**: Not viable for production use

### B. Move schemas to contracts (REJECTED)
- **Pro**: Simple (one package)
- **Con**: Violates DDD bounded contexts, loses module autonomy
- **Verdict**: Architectural anti-pattern

### C. Type-only circular imports (REJECTED)
```typescript
import type { DueTimeReached } from '@event-service-agent/timer/domain'
```
- **Pro**: Solves circular dependency at runtime
- **Con**: Still violates architectural principle (contracts depends on modules)
- **Verdict**: Too clever, fragile

### D. Schemas + Platform Split (ACCEPTED)
- **Pro**: Clean architecture, excellent DX, no circular deps
- **Con**: More packages, migration effort
- **Verdict**: Best long-term solution

---

## References

- ADR-0011: Message Schema Validation (updated)
- ADR-0001: Module Topology (topology diagram needs update)
- ADR-0010: Identity Generation Strategy (UUID7 location changed)
- `docs/design/hexagonal-architecture-layers.md` (package references)
- Domain-Driven Design (Bounded Contexts, Published Language)
- Effect-TS ecosystem patterns (@effect/platform precedent)
