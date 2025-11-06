# Copilot Instructions — event-service-agent-kata

## Purpose

Make agents effective by pointing to living sources of truth and shared principles. Prefer retrieving/validating facts dynamically over baking assumptions here.

---

## Quick Start (For New Tasks)

When starting work on an issue, follow this workflow:

1. **Read the issue carefully** - Understand the requirements and acceptance criteria
2. **Check the Kanban** - Review `docs/plan/kanban.md` for context on current work
3. **Read module design** - Check `docs/design/modules/<module-name>.md` for the module you're working on
4. **Review relevant ADRs** - See `docs/decisions/` for architectural decisions
5. **Follow TDD discipline** - RED → GREEN → REFACTOR with atomic commits
6. **Use Effect-TS patterns** - All code uses Effect for type-safe effects and DI
7. **Ensure multi-tenancy** - Every query must filter by `tenant_id`
8. **Run tests frequently** - `bun run test` (watch mode) or `bun run test --run` (CI mode)
9. **Format before committing** - `bun run format` and `bun run check`
10. **Update Kanban on completion** - Mark task as done in `docs/plan/kanban.md` when complete

---

## Set-In-Stone Principles

- **Reasoning**: Domain Modeling Made Functional (DMMF) patterns.
- **Style**: Functional TypeScript (algebraic data types, pure functions, composition).
- **Discipline**: Test-Driven Development (TDD) — RED-GREEN-REFACTOR with atomic commits.
- **Runtime**: Effect-TS as effect system, standard library, and ecosystem backbone.
- **Tooling**: Bun 1.3+ runtime, Vitest with `@effect/vitest`, Biome for formatting/linting.

---

## Architecture Guardrails (Non-Negotiable)

These constraints appear consistently across ADRs and must be enforced in all code:

- **Single Writer Principle**: Only Orchestration writes to domain tables. All other modules consume via events.
- **No Cross-Module DB Access**: Modules query only their own tables (enforced by ports, validated in reviews).
- **No Synchronous Cross-Module Calls**: All inter-module communication via `EventBusPort` (message broker).
- **Idempotency Everywhere**: All command/event handlers must be idempotent; key by `(tenantId, serviceCallId)`.
- **Per-Aggregate Ordering**: Preserve message order within `(tenantId, serviceCallId)`; broker partition key required.
- **Outbox After Commit**: Domain events published only after transaction commit; no inline broker calls (see ADR-0008).
- **Application-Generated IDs**: Generate `ServiceCallId`/`EnvelopeId` in application code (UUID v7), never in database (see ADR-0010).
- **Multi-Tenancy By Default**: Every query must filter by `tenant_id`; every message must carry `tenantId`.

---

## Programming Stack & Tooling

### TypeScript + Functional Programming

**Core Principles**:

- **Algebraic Data Types**: Use discriminated unions (`type State = Scheduled | Reached`) and `Schema.TaggedClass` for domain models.
- **Immutability**: All data structures immutable; use `Effect.Ref` or `HashMap` for state management.
- **Pure Functions**: Domain logic has no side effects; return `Effect<A, E, R>` for effectful operations.
- **Composition**: Prefer `pipe`, `Effect.gen`, and function composition over OOP patterns.
- **Type Safety**: Enable `exactOptionalPropertyTypes` in tsconfig; use branded types (`TenantId`, `ServiceCallId`).

**Forbidden Patterns**:

- ❌ Classes with mutable state (use `Schema.Class` for data, not behavior)
- ❌ Throwing exceptions (use typed errors in Effect)
- ❌ `null` (use `Option<A>` or `Either<E, A>`)
- ❌ Inheritance (use composition and layers)

---

### Effect-TS Ecosystem

**Why Effect**: Not just an effect system—it's our standard library for FP patterns, dependency injection, error handling, and testing.

**Core Modules** (prefer these over native alternatives):

- **Data structures**: `HashMap`, `HashSet`, `Chunk` (not native `Map`, `Set`, `Array`)
- **Concurrency**: `Effect.gen`, `Effect.all`, `Fiber` (not raw `async`/`await`)
- **Time**: `DateTime`, `Duration` (not native `Date`)
- **Errors**: `Effect.fail`, `Effect.die` (not `throw`)
- **State**: `Ref`, `Deferred`, `Queue` (not mutable variables)
- **Validation**: `effect/schema` (not Zod, io-ts)
- **Testing**: `@effect/vitest` (built-in Effect matchers, `TestClock`, `TestContext`)

**Extended Ecosystem** (when needed):

- `@effect/platform`: HTTP client/server, file system, terminal
- `@effect/sql-sqlite-bun`: Database access (preferred over raw `bun:sqlite`)
- `@effect/vitest`: Test utilities and Effect-aware assertions

**Layer Pattern** (dependency injection):

```typescript
// Define service interface
class MyService extends Context.Tag("MyService")<
  MyService,
  {
    readonly doThing: Effect.Effect<Result, MyError>;
  }
>() {}

// Provide implementation
const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const dep = yield* OtherService;
    return MyService.of({
      doThing: Effect.succeed(/* ... */),
    });
  }),
);

// Use in tests
Effect.provide(program, Layer.merge(MyServiceLive, OtherServiceTest));
```

**Effect.gen Pattern** (readable imperative-style):

```typescript
// ✅ Preferred: gen syntax (like do-notation in Haskell)
Effect.gen(function* () {
  const a = yield* getA;
  const b = yield* getB(a);
  return compute(a, b);
});

// ❌ Avoid: deeply nested flatMap
getA.pipe(
  Effect.flatMap((a) => getB(a).pipe(Effect.map((b) => compute(a, b)))),
);
```

**Documentation Sources** (use MCP tools to get up-to-date info):

- **Effect.ts docs**: Use `mcp_effect-mcp_effect_docs_search` and `mcp_effect-mcp_get_effect_doc` tools for latest API documentation and examples.
- **Context7**: Use `mcp_upstash_conte_resolve-library-id` then `mcp_upstash_conte_get-library-docs` for Effect and other library documentation.

---

### Bun 1.3+ Runtime

**Why Bun**:

- Native TypeScript execution (no build step for development)
- Built-in test runner (Vitest uses Bun runtime)
- SQLite native support (`bun:sqlite`)
- Fast package manager (replaces `npm`/`yarn`)

**Project Setup**:

- **Package manager**: `bun install` (lockfile: `bun.lockb`)
- **Catalogs**: Use `catalog:<name>` in `package.json` for version pinning across workspace
- **Workspaces**: Monorepo with `packages/*/package.json`

**Running Code**:

```bash
# Install dependencies
bun install

# Run TypeScript directly (no build)
bun run packages/timer/src/index.ts

# Execute package script
bun run --filter @event-service-agent/timer test
```

**Common Gotchas**:

- Use `import { Database } from 'bun:sqlite'` (not `better-sqlite3`)
- `@types/bun` provides `Bun` global and `bun:*` module types
- Bun's `test()` runner exists but we use Vitest for Effect integration

---

### Vitest (with @effect/vitest)

**Why Vitest**:

- Monorepo-native (automatic workspace detection)
- Watch mode with UI (`--ui` flag)
- Effect integration via `@effect/vitest`
- Bun runtime (fast, native TypeScript)

**Test Structure**:

```typescript
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

describe("FeatureName", () => {
  // ✅ Use .effect() for Effect-returning tests
  it.effect("should do something", () =>
    Effect.gen(function* () {
      const service = yield* MyService;
      const result = yield* service.doThing();
      expect(result).toBe(expected);
    }).pipe(
      Effect.provide(MyServiceTest), // Inject test dependencies
    ),
  );

  // ✅ Use TestClock for time control
  it.effect("should handle time", () =>
    Effect.gen(function* () {
      yield* scheduleTask();
      yield* TestClock.adjust("5 minutes");
      const result = yield* checkResult();
      expect(result).toBeDefined();
    }).pipe(Effect.provide(testLayer)),
  );
});
```

**Running Tests**:

```bash
# Run all tests (workspace root)
bun run test --run

# Watch mode
bun run test

# Single package
bun run --filter @event-service-agent/timer test

# With UI
bun run test --ui
```

**Test Organization** (per package):

- Unit tests: co-located with source (`*.test.ts`)
- Test layers: `<name>.adapter.test.ts` exports (e.g., `ClockPortTest`)
- Vitest config: `packages/*/vitest.config.ts` (inherits from root)

**Vitest Config Pattern**:

```typescript
// Root: vitest.config.ts (orchestrator)
export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    projects: ["packages/*/vitest.config.ts"],
  },
});

// Package: packages/timer/vitest.config.ts
export default defineProjectConfig({
  test: {
    name: "timer",
    root: ".",
    include: ["src/**/*.test.ts"],
  },
});
```

---

### Effect Language Service

**Setup** (already configured):

- TypeScript plugin: `@effect/language-service` in `tsconfig.base.json`
- Provides hover info for Effect types, pipe suggestions, error hints
- Enable in VS Code: TypeScript → "Use Workspace Version"

**What It Does**:

- Shows `Effect<Success, Error, Requirements>` in hover
- Suggests `Effect.gen` conversions
- Highlights unhandled errors in Effect chains

---

### Common Workflows

**Starting Work**:

```bash
# 1. Check Kanban for current task (docs/plan/kanban.md)
# 2. Read module design (docs/design/modules/<name>.md)
# 3. Run tests in watch mode
bun run --filter @event-service-agent/<module> test
```

**TDD Cycle** (see detailed section below):

```bash
# Write failing test → Run → Implement → Run → Refactor → Commit
bun run test --run  # CI mode (no watch)
```

**Formatting** (pre-commit):

```bash
bun --workspace run biome format --write .
bun --workspace run biome check --write .
```

---

## Where To Find Truth (Always Check Before Coding)

### Before Touching a Module

- **Module responsibilities**: `docs/design/modules/<module-name>.md`
- **Commands consumed/produced**: `docs/design/messages.md` (index by context)
- **Ports required**: `docs/design/modules/<module-name>.md` (bottom section)
- **Architecture layers**: `docs/design/hexagonal-architecture-layers.md`

### Before Implementing a Port

- **Interface contract**: `docs/design/ports.md#<port-name>port`
- **Adapter patterns**: `docs/design/hexagonal-architecture-layers.md#layer-3-adapters`

### Before Message Handling

- **Message schema**: `docs/design/messages.md#<message-name>`
- **Identity rules**: `docs/decisions/ADR-0010-identity.md#decision`
- **Idempotency**: `docs/decisions/ADR-0006-idempotency.md`

### Before Database Work

- **Schema design**: `docs/decisions/ADR-0005-schema.md`
- **Module boundaries**: `docs/decisions/ADR-0004-database.md#key-design-choices`
- **Outbox pattern**: `docs/decisions/ADR-0008-outbox.md`

### Before Broker Integration

- **Broker choice**: `docs/decisions/ADR-0002-broker.md#decision`
- **Routing strategy**: `docs/decisions/ADR-0002-broker.md#recommended-defaults-mvp`
- **Tenancy**: `docs/design/domain.md#tenancy`

### Current Work

- **Active tasks**: `docs/plan/kanban.md` (Doing/Ready items, WIP ≤ 2)
- **Read module docs for context** — don't expect task-specific guidance here

### External Documentation

When you need up-to-date information about libraries and tools:

- **Effect-TS**: Use `mcp_effect-mcp_effect_docs_search` to search documentation, then `mcp_effect-mcp_get_effect_doc` to retrieve specific pages.
- **Any Library**: Use `mcp_upstash_conte_resolve-library-id` to find the correct library ID, then `mcp_upstash_conte_get-library-docs` to get focused documentation.
- **GitHub/Repos**: Use `mcp_github_*` tools (e.g., `github_get_file_contents`, `github_search_code`) to inspect implementation details.

---

## TDD Workflow & Commit Discipline

### Red-Green-Refactor Cycle

**Every feature follows strict TDD**:

1. **🔴 RED**: Write failing test
   - Start with domain model test (pure functions, Schema validation)
   - Use `.effect()` tests with test layers
   - Test should compile but fail with expected error
   - **Commit**: `test(scope): add failing test for <feature>`

2. **🟢 GREEN**: Minimum code to pass
   - Implement simplest solution (no premature optimization)
   - Domain → Ports → Workflows → Adapters (inside-out)
   - All tests must pass before commit
   - **Commit**: `feat(scope): implement <feature> (TDD green)`

3. **🔵 REFACTOR**: Improve without changing behavior
   - Extract functions, improve names, simplify logic
   - Tests still pass (no new tests in refactor commits)
   - **Commit**: `refactor(scope): extract <helper> for clarity`

**Atomic Commit Rule**:

- One logical change per commit (RED, GREEN, or REFACTOR—not mixed)
- Each commit leaves code in working state (tests pass, except RED phase)
- Refactor commits have ZERO test changes
- Feature commits have matching test updates

---

### Test-First Examples

**Domain Model (RED → GREEN)**:

```bash
# RED: Test fails
git add packages/timer/src/domain/timer-entry.domain.test.ts
git commit -m "test(timer): add failing test for TimerEntry.schedule"

# GREEN: Implementation passes
git add packages/timer/src/domain/timer-entry.domain.ts
git commit -m "feat(timer): implement TimerEntry.schedule with validation

- Validates dueAt is future timestamp
- Creates Scheduled state with Effect Schema
- Returns typed error on invalid input

Refs: PL-4.1"
```

**Workflow (RED → GREEN → REFACTOR)**:

```bash
# RED
git commit -m "test(timer): add failing test for scheduleTimerWorkflow"

# GREEN
git commit -m "feat(timer): implement scheduleTimerWorkflow (TDD green)

- Accepts ScheduleTimer command
- Persists TimerEntry via TimerPersistencePort
- Returns ServiceCallScheduled event

8/9 tests passing (one edge case TODO)
Refs: PL-4.3"

# REFACTOR (later)
git commit -m "refactor(timer): extract validateScheduleCommand helper

No behavior change; tests unchanged"
```

---

### Handling Skipped/TODO Tests

When you discover edge cases during RED/GREEN:

```typescript
// ✅ Document and skip (don't block progress)
it.todo("should handle concurrent schedules for same serviceCallId", () => {
  /* when missing an implementation */
});

it.skip("should handle concurrent schedules for same serviceCallId", () => {
  /* when the implementation is temporarily broken due to the TDD phase */
});

// ✅ Add TODO comment
// TODO(PL-4.4): Implement idempotency check in workflow
// See ADR-0006 for keying strategy (tenantId, serviceCallId)
```

**Commit pattern**:

```bash
git commit -m "test(timer): skip flaky concurrency test (TODO: PL-4.4)

Edge case discovered: concurrent schedules may race.
Tracked in TODO; non-blocking for current workflow.

[adr: ADR-0006]"
```

**Rule**: Never commit `.only()` tests (CI should fail). Skipped tests OK with TODO comment.

---

### Test Organization per TDD Stage

**RED phase** (domain model):

```typescript
// Start with simplest happy path
it.effect("should create TimerEntry with valid inputs", () =>
  Effect.gen(() => {
    /*...*/
  }),
);

// Add constraint tests
it.effect("should reject past dueAt", () =>
  Effect.gen(() => {
    /*...*/
  }),
);

it.effect("should reject invalid UUID format", () =>
  Effect.gen(() => {
    /*...*/
  }),
);
```

**GREEN phase** (workflow):

```typescript
// Use test layers (in-memory ports)
Effect.provide(workflow, Layer.merge(TimerPersistence.inMemory, ClockPortTest));
```

**REFACTOR phase**:

- Extract test helpers (fixtures, builders)
- No new assertions—only reorganization

---

### Commit Frequency Guideline

**Too granular** ❌:

```bash
git commit -m "add import"
git commit -m "fix typo"
```

**Too coarse** ❌:

```bash
git commit -m "implement entire Timer module"
```

**Atomic** ✅:

```bash
# Each commit is one RED, GREEN, or REFACTOR step
git commit -m "test(timer): add failing test for Scheduled state"
git commit -m "feat(timer): implement Scheduled state (TDD green)"
git commit -m "test(timer): add failing test for Reached transition"
git commit -m "feat(timer): implement Reached state transition"
git commit -m "refactor(timer): extract state validation to pure function"
```

**When to batch**:

- Multiple test cases for same feature (RED phase) → one commit
- Port interface + in-memory adapter → one commit (minimum working port)

---

### Integration with Kanban

**Update Kanban with each GREEN commit**:

```markdown
## Doing

- [x] (PL-4.1) TimerEntry domain model + tests [Timer] — 5/5 tests passing
- [o] (PL-4.3) ScheduleTimer workflow + tests [Timer] — 8/9 tests (one TODO)
```

**Link commits to Kanban items**:

```bash
git commit -m "feat(timer): implement findScheduledTimer query

Returns Option<TimerEntry> for (tenantId, serviceCallId).
Uses two-operation model per design doc.

Refs: PL-4.5
[adr: ADR-0003]"
```

---

## Port/Adapter Development (Hexagonal Architecture)

### Order of Implementation (TDD Inside-Out)

1. **Domain Model** (pure, no ports)
   - Effect Schema classes (`Schema.TaggedClass`)
   - Pure constructors/transformations
   - Test: unit tests with no dependencies

2. **Port Interface** (defined by domain needs)
   - Create `packages/<module>/src/ports/<name>.port.ts`
   - Define `Context.Tag` service
   - Test: N/A (no logic to test)

3. **Test Adapter** (in-memory, for TDD)
   - Implement port with `Ref` + `HashMap`
   - Use `Layer.effect` for lifecycle
   - Export as `<Name>Test` or `<Name>.inMemory`
   - Test: adapter-specific tests (lifecycle, state transitions)

4. **Workflow** (domain orchestration)
   - Use `Effect.gen` to compose domain + ports
   - Inject ports via `yield* PortName`
   - Test: use test adapter, validate domain logic

5. **Production Adapter** (SQLite, HTTP, etc.)
   - Implement same port interface
   - Map infrastructure errors to domain errors
   - Test: integration tests with real infrastructure

---

### Example Flow

```typescript
// 1. Domain (RED)
test("TimerEntry.schedule validates future dueAt", () => {
  /*...*/
});

// 2. Port (GREEN - interface only)
class TimerPersistencePort extends Context.Tag("TimerPersistence")<
  TimerPersistencePort,
  {
    readonly scheduleTimer: (
      entry: TimerEntry,
    ) => Effect.Effect<void, PersistenceError>;
  }
>() {}

// 3. Test Adapter (GREEN - in-memory)
const inMemory = Layer.effect(
  TimerPersistencePort,
  Effect.gen(function* () {
    const ref = yield* Ref.make(HashMap.empty<string, TimerEntry>());
    return TimerPersistencePort.of({
      scheduleTimer: (entry) => Ref.update(ref, HashMap.set(entry.id, entry)),
    });
  }),
);

// 4. Workflow (RED → GREEN)
test("scheduleTimerWorkflow persists entry", () => {
  Effect.provide(workflow, TimerPersistence.inMemory);
});

// 5. Production Adapter (later, after SQLite tests)
const sqlite = Layer.effect(
  TimerPersistencePort,
  Effect.gen(function* () {
    const db = yield* Database;
    return TimerPersistencePort.of({
      scheduleTimer: (entry) =>
        Effect.tryPromise({
          try: () => db.run("INSERT INTO timer_schedules ..."),
          catch: (error) => new PersistenceError({ cause: error }),
        }),
    });
  }),
);
```

---

### Key Principles

- Domain never imports adapters (only ports)
- Test adapters enable TDD without infrastructure
- Production adapters defer to integration test phase
- All ports follow same `Context.Tag` + `Layer.effect` pattern

---

## Error Handling (Effect-TS Patterns)

### Typed Errors (Discriminated Unions)

```typescript
// Define domain errors
export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String, field: Schema.String },
) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "PersistenceError",
  { message: Schema.String, cause: Schema.Unknown },
) {}

// Workflow signatures include all error types
const workflow: Effect.Effect<
  Result,
  ValidationError | PersistenceError, // ← explicit error channel
  TimerPersistencePort | ClockPort // ← required dependencies
> = Effect.gen(function* () {
  // Errors propagate automatically in gen syntax
  const entry = yield* TimerEntry.schedule(command); // may fail with ValidationError
  yield* persistence.save(entry); // may fail with PersistenceError
  return entry;
});
```

---

### Error Mapping at Boundaries

```typescript
// ✅ Adapter maps infra errors to domain errors
const sqliteAdapter = {
  save: (entry: TimerEntry) =>
    Effect.tryPromise({
      try: () => db.run("INSERT ..."),
      catch: (cause) =>
        new PersistenceError({ message: "DB insert failed", cause }),
    }),
};

// ❌ Never expose raw infrastructure errors to domain
const badAdapter = {
  save: (entry) => Effect.promise(() => db.run("INSERT ...")), // ← throws, not typed!
};
```

---

### Test Error Cases

```typescript
// RED: Test expected errors
it.effect("should fail on past dueAt", () =>
  Effect.gen(function* () {
    const result = yield* TimerEntry.schedule({ dueAt: pastTime }).pipe(
      Effect.either, // ← catch error in Either
    );
    expect(Either.isLeft(result)).toBe(true);
    expect(result.left).toBeInstanceOf(ValidationError);
  }),
);
```

---

### Never Use

- ❌ `try/catch` (use `Effect.tryPromise` or `Effect.try`)
- ❌ `throw new Error` (use `Effect.fail(new DomainError(...))`)
- ❌ `null` for optional (use `Option<A>`)

---

## Code Documentation Principles

### Documentation Philosophy

Code documentation serves to explain **WHY** decisions were made, not **WHAT** the code does or **HOW** it works. Well-named functions, types, and variables should make the WHAT and HOW self-evident.

**Core Principles**:

- **Self-Documenting Code First**: Clear naming (functions, variables, types) reduces need for comments
- **Explain Intent**: Document the reasoning behind non-obvious decisions
- **Document Trade-offs**: Explain why you chose approach A over approach B
- **Link to Context**: Reference ADRs, design docs, and domain concepts
- **Keep Current**: Outdated comments are worse than no comments

**Examples**:

```typescript
// ❌ Bad: Restates what code does
// Set the timer to scheduled state
timer.state = 'Scheduled';

// ✅ Good: Clear variable name, no comment needed
const scheduledTimer = TimerEntry.schedule(command);

// ✅ Good: Explains WHY, references decision
/*
 * Publish event BEFORE marking as fired to ensure at-least-once delivery.
 * If publish fails, timer remains Scheduled and will retry on next poll.
 * See ADR-0008 for outbox pattern rationale.
 */
yield* eventBus.publishDueTimeReached(event);
yield* persistence.markFired(timer.tenantId, timer.serviceCallId, now);
```

---

### When to Write Comments

**✅ DO comment**:

1. **Trade-offs and architectural decisions**:

   ```typescript
   /*
    * Use partition instead of forEach to collect ALL failures, not fail-fast.
    * This ensures partial batch success: processed timers are marked fired,
    * failed timers remain Scheduled for retry on next poll.
    * Trade-off: Higher memory usage for large batches, but better resilience.
    */
   const [failures, successes] = yield* Effect.partition(dueTimers, processTimer);
   ```

2. **Domain concepts and business rules**:

   ```typescript
   /**
    * Scheduled state represents a timer awaiting its due time.
    *
    * Domain semantics:
    * - Timer is persisted in database (durable)
    * - Will fire when clock reaches dueAt timestamp
    * - Can be cancelled before firing
    * - Transitions to Reached when fired, or Cancelled if explicitly cancelled
    */
   export class ScheduledTimer { /*...*/ }
   ```

3. **Gotchas, edge cases, and timing assumptions**:

   ```typescript
   /*
    * GOTCHA: findDue query uses inclusive comparison (<=) to ensure we don't
    * miss timers due at exact microsecond boundary. Clock precision varies.
    */
   const dueTimers = yield* persistence.findDue(now); // WHERE due_at <= now

   // EDGE CASE: Empty batch early return prevents unnecessary event bus calls
   if (Chunk.isEmpty(dueTimers)) {
     yield* Effect.logDebug('No due timers found');
     return; // Skip partition, no failures to report
   }
   ```

4. **Non-obvious performance or concurrency choices**:

   ```typescript
   /*
    * Process sequentially (concurrency: 1) to preserve partition key ordering.
    * Kafka guarantees order only within a partition; concurrent processing
    * could reorder DueTimeReached events for same serviceCallId.
    * See ADR-0002 for broker ordering guarantees.
    */
   const results = yield* Effect.partition(timers, processTimer, {
     concurrency: 1,
   });
   ```

5. **Links to ADRs and design docs**:

   ```typescript
   /*
    * Generate UUID v7 in application code, not database.
    * See ADR-0010 for identity generation strategy.
    */
   const envelopeId = EnvelopeId.make();

   /*
    * Outbox pattern: append events to outbox table in same transaction.
    * Events published after commit to avoid dual-write problem.
    * See ADR-0008 for detailed rationale and failure mode analysis.
    */
   yield* outbox.append(events);
   ```

**❌ DON'T comment**:

1. **Obvious operations** (code is self-documenting):

   ```typescript
   /*
    * ❌ Redundant: name already says what it does
    * Get current time
    */
   const now = yield* clock.now();

   // ✅ Just write the code
   const now = yield* clock.now();
   ```

2. **What type signatures already express**:

   ```typescript
   // ❌ Redundant: types + name already document this
   /**
    * @param timer - The timer to process
    * @returns void
    */
   function processTimer(timer: ScheduledTimer): Effect.Effect<void, Error> { /*...*/ }

   // ✅ Types document parameters; only add comment if explaining WHY or edge cases
   function processTimer(timer: ScheduledTimer): Effect.Effect<void, Error> { /*...*/ }
   ```

3. **Implementation details of pure functions**:

   ```typescript
   /*
    * ❌ Don't explain HOW sorting works
    * Sort timers by dueAt ascending
    */
   const sorted = timers.sort((a, b) => a.dueAt - b.dueAt);

   // ✅ Function name + types are sufficient
   const sortedByDueTime = timers.sort((a, b) => a.dueAt - b.dueAt);
   ```

---

### TSDoc/JSDoc Structure

**Use for public APIs, ports, and domain models**:

```typescript
/**
 * [One-line summary of what this does]
 *
 * [Optional: Longer description explaining domain semantics, usage context,
 * or important invariants]
 *
 * @param paramName - Description (focus on constraints, not type—types already document that)
 * @returns Description of success value and what it represents in domain
 * @throws ErrorType - When and why this error occurs (domain semantics, not implementation)
 * @example
 * ```typescript
 * // Show typical usage pattern
 * const timer = yield* scheduleTimer({ tenantId, serviceCallId, dueAt });
 * ```
 *
 * [Optional: Links to related concepts]
 * @see ADR-0003 for timer state machine
 * @see TimerPersistencePort for storage contract
 */
export const scheduleTimer = (
  command: ScheduleTimerCommand,
): Effect.Effect<ScheduledTimer, ValidationError | PersistenceError, ClockPort> => {
  /*...*/
};
```

**Template for domain models**:

```typescript
/**
 * [Entity/Value Object name] represents [domain concept].
 *
 * Domain semantics:
 * - [Key invariant 1]
 * - [Key invariant 2]
 * - [Lifecycle/state transitions]
 *
 * [Optional: Trade-offs or design decisions]
 *
 * @example
 * ```typescript
 * const entry = new ScheduledTimer({
 *   tenantId: TenantId.make("tenant-123"),
 *   serviceCallId: ServiceCallId.make(),
 *   dueAt: DateTime.now().pipe(DateTime.add("5 minutes")),
 * });
 * ```
 */
export class ScheduledTimer extends Schema.Class<ScheduledTimer>("ScheduledTimer")({
  tenantId: TenantId,
  serviceCallId: ServiceCallId,
  dueAt: DateTime.DateTime.Utc,
  // ...
}) {}
```

---

### Effect-TS Specific Patterns

**Document Error channel types and their meanings**:

```typescript
/**
 * Polls for due timers and processes them in a batch.
 *
 * Error semantics:
 * - PersistenceError: Database query failed; entire batch aborted (no timers processed)
 * - BatchProcessingError: One or more timers failed; partial success (see failures array)
 *
 * Retry strategy:
 * - PersistenceError: Retry entire workflow (query + process)
 * - BatchProcessingError: Failed timers remain Scheduled; retry on next poll cycle
 *
 * @returns void on full success; fails with error on partial/full failure
 */
export const pollDueTimers: Effect.Effect<
  void,
  PersistenceError | BatchProcessingError,
  TimerPersistencePort | EventBusPort | ClockPort
> = /*...*/;
```

**Explain Requirements (dependency injection context)**:

```typescript
/**
 * Schedules a timer for future firing.
 *
 * Requirements (injected via Layer):
 * - ClockPort: Validates dueAt is in future (domain rule: no past timers)
 * - TimerPersistencePort: Persists timer with idempotency key (tenantId, serviceCallId)
 *
 * Effect runs in bounded context: no HTTP calls, no broker access (workflow isolation).
 * Use pollDueTimersWorkflow for event publishing after timer fires.
 */
export const scheduleTimer = (
  command: ScheduleTimerCommand,
): Effect.Effect<
  ScheduledTimer,
  ValidationError | PersistenceError,
  ClockPort | TimerPersistencePort
> => /*...*/;
```

**Clarify timing/concurrency assumptions**:

```typescript
/**
 * Processes timer firings with sequential ordering guarantee.
 *
 * Concurrency: MUST be 1 (sequential processing).
 * Reason: Preserve broker partition order for events with same serviceCallId.
 * If events fire out-of-order, downstream consumers may see stale data.
 *
 * Timing assumption: Each timer processing takes <100ms (publish + persist).
 * Large batches (>1000 timers) may cause backpressure; consider pagination.
 *
 * @see ADR-0002 for broker ordering guarantees
 */
const processTimers = (timers: Chunk<ScheduledTimer>) =>
  Effect.partition(timers, processTimerFiring, {
    concurrency: 1, // ← Critical: DO NOT increase
  });
```

---

### Cross-Reference Strategy

**Link code to ADRs using standardized format**:

```typescript
// Use [adr: ADR-####] in comments
// Generate ServiceCallId in application code (UUID v7).
// See [adr: ADR-0010] for identity generation strategy.

// Or in TSDoc:
/**
 * @see ADR-0010 for why we generate IDs in application, not database
 */
```

**Link to design docs for complex patterns**:

```typescript
// Port-adapter pattern follows hexagonal architecture.
// See docs/design/hexagonal-architecture-layers.md for layer responsibilities.

/**
 * TimerPersistencePort abstracts storage operations for Timer module.
 *
 * Port responsibilities (Layer 2):
 * - Define domain-facing interface (persistence operations)
 * - Declare domain error types (PersistenceError, not SQLite errors)
 *
 * Adapter responsibilities (Layer 3):
 * - Map infrastructure errors to domain errors
 * - Implement storage using SQLite/in-memory/etc.
 *
 * @see docs/design/ports.md#timerpersistenceport for contract details
 */
```

**Reference Kanban items for TODOs**:

```typescript
// TODO(PL-4.4): Implement idempotency check in workflow
// Current implementation allows duplicate schedules for same serviceCallId.
// See ADR-0006 for keying strategy (tenantId, serviceCallId).

// TODO(PL-8): Add retry policy for BatchProcessingError
// Currently fails entire poll cycle on partial failures.
// Consider exponential backoff with max retries.
```

---

### TDD Integration

**RED phase: Document test intent and expected behavior**:

```typescript
describe('TimerEntry.schedule', () => {
  // RED: Test intent clearly stated
  it.effect('should reject past dueAt timestamp', () =>
    Effect.gen(function* () {
      // Arrange: Create command with past timestamp
      const pastTime = DateTime.now().pipe(DateTime.subtract('1 hour'));
      const command = { tenantId, serviceCallId, dueAt: pastTime };

      // Act: Attempt to schedule timer
      const result = yield* TimerEntry.schedule(command).pipe(Effect.either);

      // Assert: ValidationError with specific field
      expect(Either.isLeft(result)).toBe(true);
      expect(result.left.field).toBe('dueAt');
    }),
  );
});
```

**GREEN phase: Add function-level docs with examples**:

```typescript
/**
 * Creates a ScheduledTimer from a command, validating domain invariants.
 *
 * Domain rules:
 * - dueAt must be in future (no past timers)
 * - tenantId and serviceCallId must be valid UUIDs
 *
 * @param command - Timer schedule parameters
 * @returns ScheduledTimer on success
 * @throws ValidationError if domain rules violated
 *
 * @example
 * ```typescript
 * const timer = yield* TimerEntry.schedule({
 *   tenantId: TenantId.make("tenant-123"),
 *   serviceCallId: ServiceCallId.make(),
 *   dueAt: DateTime.now().pipe(DateTime.add("5 minutes")),
 * });
 * ```
 */
export const schedule = (
  command: ScheduleTimerCommand,
): Effect.Effect<ScheduledTimer, ValidationError, ClockPort> => {
  // Implementation now documents itself with clear steps
  return Effect.gen(function* () {
    const clock = yield* ClockPort;
    const now = yield* clock.now();

    // Validate dueAt is future (domain rule)
    if (DateTime.lessThanOrEqualTo(command.dueAt, now)) {
      return yield* Effect.fail(
        new ValidationError({ field: 'dueAt', message: 'Must be future timestamp' }),
      );
    }

    // Construct domain entity
    return new ScheduledTimer({
      tenantId: command.tenantId,
      serviceCallId: command.serviceCallId,
      dueAt: command.dueAt,
    });
  });
};
```

**REFACTOR phase: Update comments to match new structure**:

```typescript
// Before refactor: Inline validation
const result = command.dueAt > now ? new ScheduledTimer(...) : fail(...);

// After refactor: Extracted helper
const validateFutureTimestamp = (dueAt: DateTime, now: DateTime) => {
  /*
   * Domain rule: timers cannot be scheduled in the past
   * Clock precision may vary; use strict greater-than comparison
   */
  return DateTime.greaterThan(dueAt, now)
    ? Effect.succeed(dueAt)
    : Effect.fail(new ValidationError({ field: 'dueAt', message: 'Must be future' }));
};

// Update workflow to use extracted function (comment removed—name is clear)
const validated = yield* validateFutureTimestamp(command.dueAt, now);
```

---

### Quality Gates

**Before marking feature complete, verify**:

- [ ] Public APIs have TSDoc with `@param`, `@returns`, `@throws`, `@example`
- [ ] Domain models document invariants and state transitions
- [ ] Effect error types are documented with recovery strategies
- [ ] Trade-offs and non-obvious decisions have inline comments
- [ ] ADR/design doc links added for architectural patterns
- [ ] TODOs reference Kanban items (e.g., `TODO(PL-##)`)
- [ ] No commented-out code (use git history instead)
- [ ] No outdated comments (grep for "TODO", "FIXME", "HACK")

**Review prompts (for self/peer review)**:

- Can I understand WHY this code exists without reading implementation?
- Are error cases documented with recovery strategies?
- Would a new contributor understand the domain rules?
- Do comments add value, or just restate code?
- Are there links to relevant ADRs/design docs?

**Examples of good vs bad comments from this project**:

```typescript
// ❌ Bad: Restates obvious code
// Publish the event
yield* eventBus.publishDueTimeReached(event);

// ❌ Bad: Outdated comment (code changed, comment didn't)
// Use forEach to process timers
const results = yield* Effect.partition(timers, processTimer); // ← Now uses partition!

// ✅ Good: Explains WHY partition, documents trade-off
/*
 * Use partition instead of forEach to collect ALL failures, not fail-fast.
 * Trade-off: Higher memory for large batches, but better resilience.
 */
const [failures, successes] = yield* Effect.partition(timers, processTimer);

// ✅ Good: Documents domain semantics with ADR link
/**
 * Error representing batch processing failures during timer polling.
 *
 * Domain semantics:
 * - Failed timers remain in Scheduled state (retry on next poll)
 * - Successful timers are marked as Reached (forgotten)
 * - Caller can inspect failures and implement retry policies
 *
 * @see ADR-0003 for timer state machine transitions
 */
export class BatchProcessingError extends Schema.TaggedError<BatchProcessingError>() { /*...*/ }
```

---

### Red Flags to Avoid

**❌ Commented-out code** (use git history):

```typescript
// ❌ Bad: Dead code left in comments
// const oldSchedule = (timer) => db.insert(timer);
// yield* oldSchedule(timer);

// ✅ Good: Delete and commit; git history preserves old implementation
yield* persistence.scheduleTimer(timer);
```

**❌ Outdated/stale comments**:

```typescript
// ❌ Bad: Comment doesn't match code anymore
// Process timers one at a time
const results = yield* Effect.all(timers.map(processTimer), { concurrency: 10 }); // ← Now concurrent!

// ✅ Good: Update comment or remove if code is self-documenting
/*
 * Process timers concurrently (max 10 at once) for throughput.
 * Note: Out-of-order event publishing; only safe for independent timers.
 */
const results = yield* Effect.all(timers.map(processTimer), { concurrency: 10 });
```

**❌ Apologetic comments without action items**:

```typescript
// ❌ Bad: Acknowledges problem but doesn't fix it
// HACK: This is a terrible way to do it, but it works for now
const result = JSON.parse(JSON.stringify(data));

// ✅ Good: Add TODO with Kanban reference and ADR context
/*
 * TODO(PL-15): Replace deep clone with structural sharing (Effect HashMap)
 * Current approach is inefficient for large objects; causes GC pressure.
 * See ADR-0012 for immutability patterns.
 */
const result = JSON.parse(JSON.stringify(data));

// ✅ Better: Fix it now if trivial
const result = HashMap.fromIterable(data.entries());
```

**❌ Noise (ASCII art, excessive decoration)**:

```typescript
// ❌ Bad: Visual noise without value
/******************************************************************************
 *                          TIMER MODULE                                      *
 *                                                                            *
 * This module handles timer scheduling and firing                            *
 ******************************************************************************/

// ✅ Good: Let file structure and naming convey organization
// packages/timer/src/workflows/schedule-timer.workflow.ts

/**
 * Schedules a timer for future firing.
 * @see docs/design/modules/timer.md for module responsibilities
 */
```

---

## Multi-Tenancy Checklist (Per Feature)

### RED Phase (Test Tenant Isolation)

```typescript
it.effect('should not return timers from other tenants', () =>
	Effect.gen(function* () {
		const persistence = yield* TimerPersistencePort

		// Arrange: Schedule timers for two tenants
		yield* persistence.scheduleTimer({ tenantId: tenantA, ... })
		yield* persistence.scheduleTimer({ tenantId: tenantB, ... })

		// Act: Query tenant A
		const results = yield* persistence.findDue(tenantA, now)

		// Assert: Only tenant A's timers returned
		expect(results).toHaveLength(1)
		expect(results[0].tenantId).toBe(tenantA)
	}),
)
```

---

### GREEN Phase (Implementation)

- [ ] Add `tenantId` to command/event payload (see `messages.md`)
- [ ] Include `tenant_id` in all SQL `WHERE` clauses
- [ ] Use composite key `(tenant_id, aggregate_id)` in tables
- [ ] Add `tenantId` to broker partition key: `${tenantId}.${serviceCallId}`

---

### REFACTOR Phase (Enforce at Boundaries)

- [ ] Validate `tenantId` is non-empty in command handlers
- [ ] Add integration test: queries without `tenantId` fail/return empty
- [ ] Verify logs include `tenantId` for tracing (ADR-0009)

---

### Common Pitfalls

```typescript
// ❌ Missing tenant filter
const allTimers = db.query("SELECT * FROM timer_schedules WHERE due_at <= ?");

// ✅ Tenant-scoped query
const tenantTimers = db.query(
  "SELECT * FROM timer_schedules WHERE tenant_id = ? AND due_at <= ?",
  [tenantId, dueAt],
);
```

---

## Database Patterns

### Schema Conventions (See ADR-0005)

- All tables: `tenant_id` as first column in primary key
- Timestamps: `created_at`, `updated_at` (ISO8601, UTC)
- Status columns: use string enums (e.g., `'Scheduled'`, `'Reached'`)
- Composite keys: `(tenant_id, aggregate_id)` for uniqueness

---

### Query Patterns

```sql
-- ✅ Correct: Tenant-scoped, indexed
SELECT * FROM timer_schedules
WHERE tenant_id = ? AND state = 'Scheduled' AND due_at <= ?
ORDER BY due_at ASC LIMIT 100;

-- ❌ Wrong: Missing tenant_id (cross-tenant leak)
SELECT * FROM timer_schedules WHERE due_at <= ?;

-- ❌ Wrong: Unindexed range scan
SELECT * FROM service_calls WHERE created_at > ?;
```

---

### Transaction Boundaries

- Domain update + outbox append: single transaction
- Read then write: use `SELECT ... FOR UPDATE` (serializable isolation)
- Long-running: break into smaller transactions (polling, not streaming)

---

### Testing

- Unit: in-memory SQLite (`:memory:`)
- Integration: file-based with cleanup (`./test-db-${timestamp}.db`)
- Migrations: separate test DB per suite (parallel-safe)

---

## Decision-Making During Development

### When to Create ADRs

**GREEN phase encounters a choice** → Check if it needs an ADR:

**Create ADR draft if**:

- Affects multiple modules (e.g., message format, port signature)
- Impacts future extensibility (e.g., database schema, identity format)
- Has trade-offs worth documenting (e.g., polling vs push, sync vs async)
- Relates to operational concerns (e.g., observability, deployment)

**Examples**:

- ✅ ADR needed: "Should Timer use polling or broker delayed messages?"
- ✅ ADR needed: "Generate ServiceCallId in app or database?"
- ❌ No ADR: "Should this helper be in `utils.ts` or `helpers.ts`?"
- ❌ No ADR: "Should I use `forEach` or `for-of`?"

---

### Process

1. Create `docs/decisions/ADR-00XX-<topic>.md` (use next number)
2. Fill Problem + Context + Options (leave Decision as "TBD")
3. Add to Kanban as blocker: `(PL-XX) Decide <topic> [adr: ADR-00XX]`
4. Commit ADR draft: `docs(adr): add ADR-00XX for <topic> (proposed)`
5. Discuss with team/self, update Decision section
6. Mark as Accepted, update Kanban, continue implementation

**Don't block on trivial choices**:

- Naming (can refactor later)
- File organization (emerge patterns first)
- Test helper structure (extract when needed)

---

### Decision Status Guide

When encountering a choice:

1. **Check ADR Status** in `docs/decisions/README.md`:
   - **Accepted**: Implement per decision (no deviation without new ADR)
   - **Proposed**: Do NOT implement; flag in PR/discussion
   - **Superseded**: Use replacement ADR (follow links)

2. **If No ADR Exists**:
   - For architectural choice: Create ADR draft
   - For tactical choice: Discuss in PR
   - For urgent: Document as TODO in code + add Kanban item

---

## Anti-Patterns (DO NOT)

### Architecture Violations

- ❌ Direct database queries across modules (e.g., Timer reading `service_calls` table)
- ❌ In-process function calls between modules (use `EventBusPort`)
- ❌ Database-generated IDs (use UUID v7 in application; see ADR-0010)
- ❌ Synchronous HTTP calls in domain logic (inject `HttpClientPort`)

---

### Messaging Violations

- ❌ Publishing events before DB commit (outbox pattern; see ADR-0008)
- ❌ Fire-and-forget broker calls (always handle ack/nack)
- ❌ Missing `tenantId` in message envelope
- ❌ Global message handlers without tenant filter

---

### Effect Anti-Patterns

- ❌ `Effect.runSync` in production code (only tests)
- ❌ Catching errors without mapping to domain errors
- ❌ Using `any` or `unknown` for Effect type parameters
- ❌ Layers with side effects in constructor (use `Effect.gen` + `acquireRelease`)

---

### Testing Shortcuts

- ❌ Mocking Effect runtime internals
- ❌ Tests without tenant isolation checks
- ❌ Integration tests without cleanup
- ❌ Committing `.only()` tests to version control

---

## Commit Messages (Conventional + Atomic)

### Format

`<type>(scope)!?: <short summary>` (lowercase type; 72c subject)

**Common types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`

**Scope values** (prefer these):

- `timer`, `orchestration`, `execution`, `api`
- `ports`, `platform`, `adapters`
- `design`, `plan`, `adr` (for docs)

---

### Examples from This Project

```text
feat(timer): implement polling worker workflow

- Add pollDueTimersWorkflow with Effect.fn
- Use findDue + markFired two-operation pattern
- Cover edge cases: empty result, concurrent polls
- 8/9 tests passing (one flaky test documented)

Refs: PL-4.4, [adr: ADR-0003]
```

```text
refactor(orchestration): extract idempotency guard

- Move duplicate detection to pure function
- Add property tests for collision scenarios
- Aligns with ADR-0006 idempotency strategy

Refs: PL-8
```

```text
docs(design): clarify Timer state machine transitions

- Document Scheduled → Reached as only valid path
- Add failure mode analysis (publish-then-update)
- Update ports.md with TimerPersistence interface

[adr: ADR-0003]
```

---

### Link Work/Decisions

- Reference `PL-#` for plan items
- Use `[adr: ADR-####]` for decision links
- Body: explain the what and the why; wrap at ~72c

---

## File Pointers (Start Here)

- Entry: `README.md`
- Design: `docs/design/*`
- Decisions: `docs/decisions/*`
- Plan: `docs/plan/*`

---

## If Something's Unclear

- Prefer updating/adding a small ADR or design note rather than encoding assumptions in code or this file.
- Link changes in the plan.
- Avoid scope creep: pick the top item from `docs/plan/kanban.md` (Doing → Ready order).
- If a necessary decision is missing, add/adjust an ADR and reflect it in the Kanban.

---

## References

This Copilot instructions file follows GitHub's best practices for Copilot coding agents:
- [Best practices for using GitHub Copilot to work on tasks](https://docs.github.com/en/copilot/tutorials/coding-agent/get-the-best-results)
- [GitHub Copilot coding agent documentation](https://docs.github.com/en/copilot/tutorials/coding-agent)
- [Adding custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)
