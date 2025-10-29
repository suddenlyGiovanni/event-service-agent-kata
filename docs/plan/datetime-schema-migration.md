# DateTime Schema Migration Plan

**Date**: 2025-10-29  
**Status**: Proposed  
**Related**: ADR-0011 (Message Schemas), ADR-0012 (Package Structure)

## Executive Summary

Migrate from custom `Iso8601DateTime` (branded string) to Effect's built-in `Schema.DateTimeUtc` (string ↔ `DateTime.Utc` transformation). This provides:

- ✅ **Better type safety**: Domain code uses `DateTime.Utc` instead of strings
- ✅ **Richer API**: DateTime operations (comparisons, arithmetic, formatting) instead of string operations
- ✅ **Less code**: Remove custom implementation (~40 lines)
- ✅ **Standard patterns**: Aligns with Effect ecosystem conventions
- ✅ **Automatic transformations**: Schema handles string ↔ DateTime.Utc bidirectionally

**Impact**: Breaking change for domain types (string → `DateTime.Utc`), but wire format remains compatible (ISO8601 strings).

---

## Background

### Current Implementation

**Custom `Iso8601DateTime` schema** (`packages/schemas/src/shared/iso8601-datetime.schema.ts`):
```typescript
// Current: Just a branded string
export class Iso8601DateTime extends Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}...$/),
  Schema.brand('Iso8601DateTime')
) {}

// Type: string & Brand<"Iso8601DateTime">
```

**Problems**:
1. Domain code receives `DateTime.Utc` but must convert to string for messages
2. Two validation steps: string validation + DateTime construction
3. No semantic type representation—just a validated string
4. Manual conversion everywhere: `Iso8601DateTime.make(DateTime.formatIso(dateTime))`

### Effect's Built-in Solution

**`Schema.DateTimeUtc`** (from `effect/Schema`):
```typescript
// Built-in: Transforms string ↔ DateTime.Utc
import { Schema } from 'effect'

const schema = Schema.DateTimeUtc

// Type in domain: DateTime.Utc (not string!)
// Type on wire: string (ISO8601 format)
```

**Benefits**:
1. **Direct usage**: Domain code works with `DateTime.Utc` directly
2. **Single validation**: String → DateTime.Utc in one schema transformation
3. **Rich API**: All DateTime methods available (add, subtract, compare, format)
4. **Automatic encoding**: Schema handles DateTime.Utc → string for wire format
5. **Immutable**: DateTime instances are immutable by design

---

## Impact Analysis

### Files Affected (20 occurrences across 8 files)

#### 1. **Schema Definitions** (3 files)
- `packages/schemas/src/shared/iso8601-datetime.schema.ts` — **DELETE** (custom implementation)
- `packages/schemas/src/messages/timer/events.schema.ts` — Update `reachedAt` field
- `packages/schemas/src/messages/orchestration/commands.schema.ts` — Update `dueAt` field

#### 2. **Platform Message Types** (1 file)
- `packages/platform/src/messages/messages.ts` — Update all TypeScript type signatures (declare namespace)

#### 3. **Timer Module** (2 files)
- `packages/timer/src/adapters/timer-event-bus.adapter.ts` — Remove `DateTime.formatIso()` wrapper
- `packages/timer/src/domain/timer-entry.domain.test.ts` — Update test fixtures

#### 4. **Tests** (2 files)
- `packages/schemas/src/envelope/message-envelope.schema.test.ts` — Update test data
- `packages/schemas/src/shared/iso8601-datetime.schema.test.ts` — **DELETE** (no longer needed)

#### 5. **Documentation** (2 files)
- `docs/decisions/ADR-0011-message-schemas.md` — Update examples
- `docs/decisions/ADR-0012-package-structure.md` — Remove from foundational schemas list

### Breaking Changes

**Domain Type Change**:
```typescript
// BEFORE: string (branded)
type DueAt = Iso8601DateTime.Type  // = string & Brand<"Iso8601DateTime">

// AFTER: DateTime.Utc (rich type)
type DueAt = DateTime.Utc
```

**Wire Format**: ✅ **NO CHANGE** (still ISO8601 strings in JSON)

**Database Format**: ✅ **NO CHANGE** (still ISO8601 strings in DB)

**In-Memory Representation**: ❌ **BREAKING** (string → DateTime.Utc)

---

## Migration Steps

### Phase 1: Update Schema Definitions

#### Step 1.1: Update Timer Event Schema

**File**: `packages/schemas/src/messages/timer/events.schema.ts`

```typescript
// BEFORE
import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'

export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(
  'DueTimeReached',
  {
    reachedAt: Schema.optional(Iso8601DateTime),
    // ...
  }
)

// AFTER
import * as Schema from 'effect/Schema'

export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(
  'DueTimeReached',
  {
    reachedAt: Schema.optional(Schema.DateTimeUtc),
    // ...
  }
)
```

**Impact**: `reachedAt` type changes from `string | undefined` → `DateTime.Utc | undefined`

#### Step 1.2: Update Orchestration Command Schema

**File**: `packages/schemas/src/messages/orchestration/commands.schema.ts`

```typescript
// BEFORE
import { Iso8601DateTime } from '../../shared/iso8601-datetime.schema.ts'

export class ScheduleTimer extends Schema.TaggedClass<ScheduleTimer>()(
  'ScheduleTimer',
  {
    dueAt: Iso8601DateTime,
    // ...
  }
)

// AFTER
import * as Schema from 'effect/Schema'

export class ScheduleTimer extends Schema.TaggedClass<ScheduleTimer>()(
  'ScheduleTimer',
  {
    dueAt: Schema.DateTimeUtc,
    // ...
  }
)
```

**Impact**: `dueAt` type changes from `string` → `DateTime.Utc`

#### Step 1.3: Update Shared Index Export

**File**: `packages/schemas/src/shared/index.ts`

```typescript
// BEFORE
export { Iso8601DateTime } from './iso8601-datetime.schema.ts'

// AFTER
// Remove export (no longer exists)
```

#### Step 1.4: Delete Custom Implementation

**Delete files**:
- `packages/schemas/src/shared/iso8601-datetime.schema.ts`
- `packages/schemas/src/shared/iso8601-datetime.schema.test.ts`

---

### Phase 2: Update Platform Message Types

#### Step 2.1: Update TypeScript Declarations

**File**: `packages/platform/src/messages/messages.ts`

Replace all `Iso8601DateTime.Type` with `DateTime.Utc`:

```typescript
// BEFORE
import type { Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

interface ServiceCallSubmitted extends Event<Type.Submitted> {
  readonly submittedAt: Iso8601DateTime.Type
  // ...
}

// AFTER
import type { DateTime } from 'effect'
import type { ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

interface ServiceCallSubmitted extends Event<Type.Submitted> {
  readonly submittedAt: DateTime.Utc
  // ...
}
```

**Fields to update** (10 occurrences):
- `ServiceCallSubmitted.submittedAt`
- `ServiceCallScheduled.dueAt`
- `ServiceCallRunning.startedAt`
- `ServiceCallSucceeded.finishedAt`
- `ServiceCallFailed.finishedAt`
- `StartExecution.dueAt` (if present)
- `ScheduleTimer.dueAt`
- `ExecutionStarted.startedAt`
- `ExecutionSucceeded.finishedAt`
- `ExecutionFailed.finishedAt`
- `DueTimeReached.reachedAt` (optional)

---

### Phase 3: Update Timer Module

#### Step 3.1: Update Event Bus Adapter

**File**: `packages/timer/src/adapters/timer-event-bus.adapter.ts`

```typescript
// BEFORE
import { type CorrelationId, EnvelopeId, Iso8601DateTime } from '@event-service-agent/schemas/shared'

const dueTimeReached = new DueTimeReached({
  reachedAt: Iso8601DateTime.make(DateTime.formatIso(firedAt)), // ← Manual conversion
  serviceCallId,
  tenantId,
})

// AFTER
import { type CorrelationId, EnvelopeId } from '@event-service-agent/schemas/shared'

const dueTimeReached = new DueTimeReached({
  reachedAt: firedAt, // ← Direct usage! firedAt is already DateTime.Utc
  serviceCallId,
  tenantId,
})
```

**Benefit**: No more manual `DateTime.formatIso()` wrapper—schema handles encoding!

#### Step 3.2: Update Domain Tests

**File**: `packages/timer/src/domain/timer-entry.domain.test.ts`

```typescript
// BEFORE
import { CorrelationId, Iso8601DateTime, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

const makeScheduleTimerCommand = (
  dueAtIso: Iso8601DateTime.Type
): Message.Orchestration.Commands.ScheduleTimer => ({
  type: 'ScheduleTimer',
  dueAt: dueAtIso, // string
  // ...
})

const dueAtIso = Iso8601DateTime.make(DateTime.formatIso(dueAt))
const command = makeScheduleTimerCommand(dueAtIso)

// AFTER
import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'
import type { DateTime } from 'effect'

const makeScheduleTimerCommand = (
  dueAt: DateTime.Utc
): Message.Orchestration.Commands.ScheduleTimer => ({
  type: 'ScheduleTimer',
  dueAt, // DateTime.Utc
  // ...
})

const command = makeScheduleTimerCommand(dueAt) // No conversion needed!
```

**Changes**:
- Remove `Iso8601DateTime` import
- Change parameter type from `Iso8601DateTime.Type` → `DateTime.Utc`
- Remove `Iso8601DateTime.make(DateTime.formatIso(...))` wrapper

---

### Phase 4: Update Tests

#### Step 4.1: Update Message Envelope Tests

**File**: `packages/schemas/src/envelope/message-envelope.schema.test.ts`

```typescript
// BEFORE
import { Iso8601DateTime } from '../shared/iso8601-datetime.schema.ts'

const validEnvelope = {
  payload: new DueTimeReached({
    reachedAt: Iso8601DateTime.make('2025-10-27T12:00:00.000Z'),
    // ...
  }),
}

// AFTER
import { DateTime } from 'effect'

const validEnvelope = {
  payload: new DueTimeReached({
    reachedAt: DateTime.unsafeMake('2025-10-27T12:00:00.000Z'),
    // ...
  }),
}
```

**Alternative** (if you want to use current time in tests):
```typescript
const now = DateTime.unsafeNow()
const validEnvelope = {
  payload: new DueTimeReached({
    reachedAt: now,
    // ...
  }),
}
```

---

### Phase 5: Update Documentation

#### Step 5.1: Update ADR-0011 (Message Schemas)

**File**: `docs/decisions/ADR-0011-message-schemas.md`

Update all examples to use `Schema.DateTimeUtc`:

```typescript
// BEFORE
export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(
  'DueTimeReached',
  {
    reachedAt: Schema.optional(Iso8601DateTime),
    // ...
  }
)

// AFTER
export class DueTimeReached extends Schema.TaggedClass<DueTimeReached>()(
  'DueTimeReached',
  {
    reachedAt: Schema.optional(Schema.DateTimeUtc),
    // ...
  }
)
```

#### Step 5.2: Update ADR-0012 (Package Structure)

**File**: `docs/decisions/ADR-0012-package-structure.md`

Remove `Iso8601DateTime` from foundational schemas list:

```markdown
<!-- BEFORE -->
- Foundational schemas: `TenantId`, `ServiceCallId`, `CorrelationId`, `EnvelopeId`, `Iso8601DateTime`, `UUID7`

<!-- AFTER -->
- Foundational schemas: `TenantId`, `ServiceCallId`, `CorrelationId`, `EnvelopeId`, `UUID7`
- Built-in Effect schemas: `Schema.DateTimeUtc`, `Schema.DateTimeZoned`
```

Add note about DateTime usage:
```markdown
### DateTime Handling

Date/time fields use Effect's built-in `Schema.DateTimeUtc`:
- **Domain type**: `DateTime.Utc` (immutable, rich API)
- **Wire format**: ISO8601 string (`"2025-10-27T12:00:00.000Z"`)
- **Transformation**: Automatic via schema decode/encode
- **Benefits**: Type-safe DateTime operations, no manual string conversion
```

---

## Testing Strategy

### Unit Tests

1. **Schema validation tests** (already covered by existing tests):
   ```typescript
   it.effect('should decode valid ISO8601 string to DateTime.Utc', () =>
     Effect.gen(function* () {
       const result = yield* Schema.decode(Schema.DateTimeUtc)('2025-10-27T12:00:00.000Z')
       expect(DateTime.isDateTime(result)).toBe(true)
       expect(DateTime.isUtc(result)).toBe(true)
     })
   )
   ```

2. **Round-trip tests** (encode → decode):
   ```typescript
   it.effect('should round-trip DateTime.Utc through encoding', () =>
     Effect.gen(function* () {
       const original = DateTime.unsafeMake('2025-10-27T12:00:00.000Z')
       const encoded = yield* Schema.encode(Schema.DateTimeUtc)(original)
       const decoded = yield* Schema.decode(Schema.DateTimeUtc)(encoded)
       expect(DateTime.Equivalence(original, decoded)).toBe(true)
     })
   )
   ```

3. **Integration tests**: Update existing timer workflow tests to pass `DateTime.Utc` directly

### Migration Validation

After migration:
1. ✅ All 138+ tests must pass
2. ✅ Type-check must pass (`bun run type-check`)
3. ✅ No runtime errors in workflows
4. ✅ Wire format unchanged (validate JSON output)

---

## Rollback Plan

If issues arise:
1. Revert schema changes (restore `Iso8601DateTime` import)
2. Revert adapter changes (restore `DateTime.formatIso()` wrappers)
3. Revert test changes
4. Git revert commit

**Risk**: Low—wire format is unchanged, only in-memory representation changes.

---

## Kanban Tracking

Add to `docs/plan/kanban.md`:

```markdown
## Ready

- [ ] (PL-15) Migrate to Schema.DateTimeUtc [schemas, timer, platform]
  - Phase 1: Update schema definitions
  - Phase 2: Update platform message types
  - Phase 3: Update timer module (adapter + tests)
  - Phase 4: Update schema tests
  - Phase 5: Update documentation (ADR-0011, ADR-0012)
  - Expected: Remove ~40 lines of custom code, improve type safety
```

---

## Benefits Summary

### Code Reduction
- **Delete**: Custom `Iso8601DateTime` schema (~40 lines)
- **Delete**: Custom schema tests (~30 lines)
- **Simplify**: Remove `DateTime.formatIso()` wrappers (20+ occurrences)
- **Net**: ~90 lines removed

### Type Safety Improvements
```typescript
// BEFORE: String operations (error-prone)
const dueAt: Iso8601DateTime.Type = '2025-10-27T12:00:00.000Z'
const laterString = dueAt.substring(0, 10) + 'T13:00:00.000Z' // ❌ Unsafe!

// AFTER: DateTime operations (type-safe)
const dueAt: DateTime.Utc = DateTime.unsafeMake('2025-10-27T12:00:00.000Z')
const later = DateTime.add(dueAt, { hours: 1 }) // ✅ Type-safe!
```

### Developer Experience
- ✅ No manual conversions (`DateTime.formatIso()` wrapper removed)
- ✅ Rich DateTime API available (add, subtract, compare, format)
- ✅ Immutable by design (no accidental mutations)
- ✅ Standard Effect patterns (aligns with ecosystem)

---

## Next Steps

1. Review this plan with team
2. Create feature branch: `feat/datetime-schema-migration`
3. Execute phases 1-5 in TDD order (RED-GREEN-REFACTOR)
4. Run full test suite after each phase
5. Update Kanban with progress
6. Create PR with comprehensive description

**Estimated effort**: 2-3 hours (mostly mechanical changes)

**Risk level**: Low (wire format unchanged, comprehensive tests)
