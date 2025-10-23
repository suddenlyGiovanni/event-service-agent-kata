# Copilot Instructions — event-service-agent-kata

## Purpose

Make agents effective by pointing to living sources of truth and shared principles. Prefer retrieving/validating facts dynamically over baking assumptions here.

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
- `ports`, `contracts`, `adapters`
- `design`, `plan`, `adr` (for docs)

---

### Examples from This Project

```
feat(timer): implement polling worker workflow

- Add pollDueTimersWorkflow with Effect.fn
- Use findDue + markFired two-operation pattern
- Cover edge cases: empty result, concurrent polls
- 8/9 tests passing (one flaky test documented)

Refs: PL-4.4, [adr: ADR-0003]
```

```
refactor(orchestration): extract idempotency guard

- Move duplicate detection to pure function
- Add property tests for collision scenarios
- Aligns with ADR-0006 idempotency strategy

Refs: PL-8
```

```
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
