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

1. **Check ready work** — Run `bd ready` to see prioritized, unblocked issues
2. **Pick an issue** — Start with the top item from `bd ready` or as assigned
3. **Read module design** — Check `docs/design/modules/<module-name>.md` for the module you're working on
4. **Review ADRs** — See `docs/decisions/` for architectural decisions (read the relevant ones)
5. **Update issue status** — Run `bd update <issue-id> --status in_progress`
6. **Follow TDD** — RED → GREEN → REFACTOR with atomic commits
7. **Run tests** — `bun run test` (watch) or `bun run test --run` (CI)
8. **Format** — `bun run format` and `bun run check` before committing
9. **Validate docs** — Run `bun run docs:check` and `bun run docs:type-check`
10. **Close issue** — Run `bd close <issue-id> --reason "..."` when complete

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

## Issue Tracking with Beads (`bd`)

This project uses [Beads](https://github.com/steveyegge/beads) for issue tracking. Beads is a
git-versioned, agent-friendly issue tracker that gives AI coding agents persistent memory across sessions.

### Core Commands

```bash
# Find ready work (no blockers)
bd ready

# See all open issues
bd list --status open

# View issue details
bd show <issue-id>

# Create new issues during work
bd create "Fix bug" -d "Description" -p 1 -t bug
bd label add <issue-id> <label>

# Update status when starting work
bd update <issue-id> --status in_progress

# Close completed work
bd close <issue-id> --reason "Implemented per spec"

# Link discovered work back to parent
bd dep add <new-id> <parent-id> --type discovered-from

# View dependency tree
bd dep tree <issue-id>

# Sync database (usually automatic via Lefthook)
bd sync
```

### Git Hooks (Lefthook Integration)

Beads is integrated with Lefthook for automatic database sync. These hooks match the official bd git hooks specification:

- **pre-commit**: Flushes pending changes via `bd sync --flush-only` and stages all JSONL files
- **post-merge**: Imports updates via `bd sync --import-only`, skips during rebase, runs health check
- **post-checkout**: Imports updates via `bd sync --import-only` after branch switches
- **pre-push**: ⚠️ **Critical safety check** - flushes pending changes then **blocks push** if JSONL files have uncommitted changes

The pre-push hook prevents pushing stale beads data to remote, ensuring database consistency across team members and multiple workspaces. If blocked, commit the JSONL changes before pushing.

### Issue Labels

Use labels to preserve context and enable filtering:

- **PL-#**: Legacy plan item ID (e.g., `PL-4.4`, `PL-23`)
- **Module tags**: `Timer`, `Orchestration`, `Execution`, `Api`, `platform`, `schemas`
- **Infrastructure**: `infra`, `architecture`
- **ADR references**: `ADR-0002`, `ADR-0013`, etc.

### Session Workflow

**At session start:**

1. Run `bd ready` to see prioritized, unblocked work
2. Pick the top issue (or one assigned to you)
3. Run `bd update <issue-id> --status in_progress`
4. Read the issue description and related docs

**During work:**

- Create issues for discovered bugs/TODOs: `bd create "Found X" -t bug -p 1`
- Link new issues to current work: `bd dep add <new-id> <current-id> --type discovered-from`
- Add notes to issues as needed

**At session end:**

1. Close completed issues: `bd close <issue-id> --reason "..."`
2. Update in-progress issues with notes if needed
3. Create issues for remaining/discovered work
4. Normally, `bd sync` runs automatically via Lefthook git hooks on commit/push.
   Only run `bd sync` manually if you have disabled hooks or are working in an environment where they are unavailable.
5. Commit and push all changes

### Legacy Kanban Reference

Historical context is preserved in `docs/plan/kanban.md`. The beads database
is now the primary source of truth for issue tracking.

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

<!-- effect-solutions:start -->

## Effect Best Practices

**Before implementing Effect features**, run `bunx effect-solutions list` and read the relevant guide:

```bash
# List all available topics
bunx effect-solutions list

# Show a specific guide
bunx effect-solutions show <topic>
```

Topics include: services and layers, data modeling, error handling, configuration, testing, CLI development, and project structure.

**Effect Source Reference:** `~/repos/forks/effect`

Search here for real implementations when docs aren't enough. This is a local clone of the Effect monorepo with all packages (`effect`, `@effect/platform`, `@effect/sql`, etc.).

<!-- effect-solutions:end -->

## Effect-TS Quick Reference

This project uses Effect-TS as its standard library. Key patterns:

### Effect.gen Pattern (Preferred)

```typescript ignore
// ✅ Use gen syntax for readable imperative-style
Effect.gen(function* () {
  const a = yield* getA;
  const b = yield* getB(a);
  return compute(a, b);
});
```

### Layer Pattern (Dependency Injection)

```typescript ignore
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

```typescript ignore
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

Refs: <beads-issue-id>
[adr: ADR-####]
```

**Common types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Scopes:** `timer`, `orchestration`, `execution`, `api`, `ports`, `platform`, `design`, `adr`

**Issue references:** For all new work, use beads issue IDs (e.g., `event-service-agent-kata-f86`). Only use legacy PL-# labels when referencing or updating historical work.

## When You Need Help

### Creating ADRs

Create an ADR if the choice:

- Affects multiple modules
- Impacts future extensibility
- Has significant trade-offs
- Relates to operational concerns

**Process:**

1. Create `docs/decisions/ADR-00XX-<topic>.md`
2. Create beads issue: `bd create "ADR: <topic>" -t task -p 1 -l ADR`
3. Fill in Problem, Context, Options
4. Update Decision section
5. Mark as Accepted and close issue

### Unclear Requirements

- Prefer updating/adding small ADR or design note
- Create a beads issue for follow-up work: `bd create "Clarify X" -t task`
- Avoid scope creep: pick top item from `bd ready`

## Additional Resources

- **Issue tracking:** Run `bd help` for full command reference
- **Copilot guidance:** See `.github/copilot-instructions.md`
- **Effect-TS:** Use available documentation tools or visit [effect.website](https://effect.website)

---

**Last Updated:** 2025-12-15
