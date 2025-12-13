# Agent Instructions — event-service-agent-kata

## Project Overview

This is an **event-driven, multi-tenant service-call agent** built with functional programming principles. It allows users to trigger immediate and scheduled service calls (like HTTP requests) across multiple tenants, with execution tracking and filtering capabilities.

**Tech Stack:**

- **Language:** TypeScript (strict functional style)
- **Runtime:** Bun 1.3+
- **Effect System:** Effect-TS (core library for FP patterns, DI, error handling)
- **Testing:** Vitest with `@effect/vitest`
- **Linting:** Biome
- **Architecture:** Hexagonal (ports & adapters), event-driven, modular monorepo

## Quick Start for New Tasks

1. **Read the issue carefully** — Understand requirements and acceptance criteria
2. **Check the Kanban** — Review `docs/plan/kanban.md` for current work context
3. **Read module design** — Check `docs/design/modules/<module-name>.md` for the module you're working on
4. **Review ADRs** — See `docs/decisions/` for architectural decisions (read the relevant ones)
5. **Follow TDD** — RED → GREEN → REFACTOR with atomic commits
6. **Run tests** — `bun run test` (watch) or `bun run test --run` (CI)
7. **Format** — `bun run format` and `bun run check` before committing
8. **Validate docs** — Run `bun run docs:check` and `bun run docs:type-check`
9. **Update Kanban** — Mark tasks done in `docs/plan/kanban.md`

## Non-Negotiable Principles

### Architecture Constraints

**⚠️ These must be enforced in all code:**

- **Single Writer Principle:** Only Orchestration module writes to domain tables; others consume via events
- **No Cross-Module DB Access:** Modules query only their own tables
- **No Synchronous Cross-Module Calls:** All inter-module communication via `EventBusPort` (message broker)
- **Idempotency Everywhere:** All handlers must be idempotent; key by `(tenantId, serviceCallId)`
- **Per-Aggregate Ordering:** Preserve message order within `(tenantId, serviceCallId)`
- **Outbox After Commit:** Domain events published only after transaction commit (ADR-0008)
- **Application-Generated IDs:** Generate IDs (UUID v7) in application code, never in database (ADR-0010)
- **Multi-Tenancy By Default:** Every query must filter by `tenant_id`; every message carries `tenantId`

### Programming Style

- **Functional TypeScript:** Algebraic data types, pure functions, immutability
- **Effect-TS Patterns:** Use Effect for all side effects, errors, and DI
- **No Forbidden Patterns:**
  - ❌ Classes with mutable state
  - ❌ Throwing exceptions (use typed errors in Effect)
  - ❌ `null` (use `Option<A>`)
  - ❌ Inheritance (use composition)

### Test-Driven Development

Every feature follows strict TDD:

1. **🔴 RED:** Write failing test → Commit: `test(scope): add failing test for <feature>`
2. **🟢 GREEN:** Minimum code to pass → Commit: `feat(scope): implement <feature> (TDD green)`
3. **🔵 REFACTOR:** Improve without changing behavior → Commit: `refactor(scope): extract <helper>`

**Atomic commits:** One logical change per commit (RED, GREEN, or REFACTOR — not mixed).

## Project Structure

```text
event-service-agent-kata/
├── packages/
│   ├── adapters/      # Infrastructure adapters
│   ├── api/           # HTTP API module
│   ├── execution/     # Service call execution module
│   ├── orchestration/ # Orchestration module (single writer)
│   ├── platform/      # Shared platform code
│   ├── schemas/       # Shared schemas
│   ├── timer/         # Timer scheduling module
│   ├── typescript/    # TypeScript configs
│   └── ui/            # User interface
├── docs/
│   ├── design/        # Architecture & module designs
│   ├── decisions/     # ADRs (Architectural Decision Records)
│   └── plan/          # Kanban & planning docs
└── .github/
    └── copilot-instructions.md  # Detailed Copilot-specific guidance
```

## Key Documentation

### Before Making Changes

**Always check these first:**

- **Module responsibilities:** `docs/design/modules/<module-name>.md`
- **Message schemas:** `docs/design/messages.md`
- **Port interfaces:** `docs/design/ports.md`
- **Architecture layers:** `docs/design/hexagonal-architecture-layers.md`
- **Relevant ADRs:** `docs/decisions/` (indexed in `docs/decisions/README.md`)

### Common References

- **Database schema:** `docs/decisions/ADR-0005-schema.md`
- **Broker/messaging:** `docs/decisions/ADR-0002-broker.md`
- **Idempotency:** `docs/decisions/ADR-0006-idempotency.md`
- **Outbox pattern:** `docs/decisions/ADR-0008-outbox.md`
- **Identity generation:** `docs/decisions/ADR-0010-identity.md`

## Development Workflows

### Running Tests

```bash
# Watch mode (recommended during development)
bun run test

# CI mode (all tests, no watch)
bun run test --run

# Single package
bun run --filter @event-service-agent/<module> test
```

### Formatting & Linting

```bash
# Format all code
bun run format

# Lint and auto-fix
bun run check
```

### Documentation Validation

```bash
# Validate TSDoc structure
bun run docs:check

# Type-check TSDoc examples
bun run docs:type-check

# Type-check Markdown code blocks
bun run docs:type-check:md

# Lint Markdown prose
bun run docs:lint
```

### Database Operations

```bash
# Run migrations
bun run db:migrate

# Reset database
bun run db:reset
```

## Effect-TS Quick Reference

This project uses Effect-TS as its standard library. Key patterns:

### Effect.gen Pattern (Preferred)

```typescript
// ✅ Use gen syntax for readable imperative-style
Effect.gen(function* () {
  const a = yield* getA;
  const b = yield* getB(a);
  return compute(a, b);
});
```

### Layer Pattern (Dependency Injection)

```typescript
// Define service
class MyService extends Context.Tag("MyService")<
  MyService,
  { readonly doThing: Effect.Effect<Result, MyError> }
>() {}

// Provide implementation
const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const dep = yield* OtherService;
    return MyService.of({
      doThing: Effect.succeed(/* ... */),
    });
  })
);
```

### Typed Errors

```typescript
// Define domain errors
class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String, field: Schema.String }
) {}

// Workflow with explicit error types
const workflow: Effect.Effect<
  Result,
  ValidationError | PersistenceError,
  TimerPersistencePort | ClockPort
> = Effect.gen(function* () {
  const entry = yield* TimerEntry.schedule(command);
  yield* persistence.save(entry);
  return entry;
});
```

## Multi-Tenancy Checklist

**Every feature must:**

- [ ] Add `tenantId` to command/event payloads
- [ ] Include `tenant_id` in all SQL `WHERE` clauses
- [ ] Use composite key `(tenant_id, aggregate_id)` in tables
- [ ] Add `tenantId` to broker partition key
- [ ] Test tenant isolation (queries don't leak across tenants)

## Common Pitfalls to Avoid

### Architecture Violations

- ❌ Direct database queries across modules
- ❌ In-process function calls between modules (use events)
- ❌ Database-generated IDs (use UUID v7 in application)
- ❌ Publishing events before DB commit

### Effect Anti-Patterns

- ❌ `Effect.runSync` in production code (only tests)
- ❌ Using `any`/`unknown` for Effect type parameters
- ❌ Catching errors without mapping to domain errors
- ❌ `try/catch` (use `Effect.tryPromise`)
- ❌ `throw` (use `Effect.fail`)

### Testing Shortcuts

- ❌ Committing `.only()` tests
- ❌ Tests without tenant isolation checks
- ❌ Integration tests without cleanup

## Port/Adapter Development (Hexagonal Architecture)

**Order of implementation (TDD inside-out):**

1. **Domain Model** — Pure functions, Schema classes
2. **Port Interface** — Define `Context.Tag` service
3. **Test Adapter** — In-memory implementation for TDD
4. **Workflow** — Compose domain + ports with `Effect.gen`
5. **Production Adapter** — SQLite, HTTP, etc.

**Key principle:** Domain never imports adapters (only ports).

## Commit Message Format

```text
<type>(scope): <short summary>

[Optional body explaining what and why]

Refs: PL-#
[adr: ADR-####]
```

**Common types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Scopes:** `timer`, `orchestration`, `execution`, `api`, `ports`, `platform`, `design`, `adr`

## When You Need Help

### Creating ADRs

Create an ADR if the choice:

- Affects multiple modules
- Impacts future extensibility
- Has significant trade-offs
- Relates to operational concerns

**Process:**

1. Create `docs/decisions/ADR-00XX-<topic>.md`
2. Add to Kanban as blocker
3. Fill in Problem, Context, Options
4. Update Decision section
5. Mark as Accepted and continue

### Unclear Requirements

- Prefer updating/adding small ADR or design note
- Link changes in the plan (`docs/plan/kanban.md`)
- Avoid scope creep: pick top item from Kanban (Doing → Ready)

## Additional Resources

For detailed Copilot-specific guidance, see `.github/copilot-instructions.md`.

For Effect-TS documentation, use available documentation tools or visit [effect.website](https://effect.website).

---

**Last Updated:** 2025-12-13
