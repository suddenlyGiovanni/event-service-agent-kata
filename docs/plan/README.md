# Development Plan & Tracking

[← Back to Documentation Home](../index.md)

This section tracks current work, implementation roadmap, and detailed task planning.

---

## 📊 Current Work

### [Kanban Board](kanban.md)
Active task tracking with work-in-progress limits.

**Current Status:**
- **Doing**: Active implementation (WIP ≤ 2)
- **Ready**: Prioritized queue (next tasks)
- **Blocked**: Waiting on decisions or dependencies
- **Done**: Recently completed work

[→ View Kanban](kanban.md)

---

## 🗺️ Roadmap

### [Project Plan](plan.md)
High-level roadmap and milestone tracking.

**Major Phases:**
1. **Foundation** - Core domain models and ports
2. **Timer Module** - Scheduling and firing workflows
3. **Orchestration** - Service call lifecycle
4. **Execution** - External HTTP calls
5. **API Layer** - REST endpoints
6. **Infrastructure** - Persistence and messaging

[→ View Project Plan](plan.md)

---

## 📝 Implementation Plans

Detailed task breakdowns for complex features:

### Active Implementation Plans
- **[Correlation Context Implementation](correlation-context-implementation.md)** - 14-task breakdown for correlationId propagation (PL-24)

---

## 🔗 Related Documentation

### Before Starting Work
1. Check [Kanban](kanban.md) for current task priority
2. Read relevant [module design](../design/modules/) documentation
3. Review related [ADRs](../decisions/) for architectural decisions
4. Follow [TDD workflow](../CONTRIBUTING.md#available-scripts) in Contributing Guide

### During Development
- Update Kanban status as you progress (Ready → Doing → Done)
- Link commits to plan items (e.g., `Refs: PL-##`)
- Reference ADRs in code comments (e.g., `[adr: ADR-0006]`)

### Quality Gates
- Run tests: `bun run test --run`
- Validate docs: `bun run docs:check && bun run docs:type-check`
- Format code: `bun run format`
- Type check: `bun run type-check`

---

## 📌 Conventions

### Task IDs
Plan items use `PL-#` format (e.g., `PL-24`, `PL-4.6`)

### Status Tags
- `[Timer]`, `[Orchestration]`, `[Api]`, etc. - Module scope
- `[infra]` - Infrastructure/cross-cutting
- `[adr: ADR-####]` - Links to decision records
- `[docs]` - Documentation updates

### Priority Levels
- **P0** - Critical blockers
- **P1** - High priority
- (no prefix) - Normal priority

---

## 🎯 Next Steps

Check the [Kanban Ready queue](kanban.md#ready) for the next prioritized task to work on.
