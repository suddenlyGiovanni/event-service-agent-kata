# Development Plan & Tracking

[← Back to Documentation Home](../index.md)

This section tracks current work, implementation roadmap, and detailed task planning.

---

## 📊 Current Work

### Issue Tracking with Beads

This project uses [Beads (`bd`)](https://github.com/steveyegge/beads) for issue tracking.
Beads is a git-versioned, agent-friendly issue tracker.

**Installation** (if not already installed):

```bash
# Via npm (recommended for Node.js projects)
npm install -g @beads/bd

# Or via Homebrew (macOS/Linux)
brew tap steveyegge/beads && brew install bd
```

**Quick Commands:**

```bash
bd ready              # See prioritized, unblocked work
bd list --status open # See all open issues
bd show <issue-id>    # View issue details
bd blocked            # See blocked issues
bd stats              # Issue statistics
```

**Finding work:** Run `bd ready` to see prioritized issues with no blockers.

### Legacy Kanban (Archive)

Historical context is preserved in [kanban.md](kanban.md). The beads database
(`.beads/issues.jsonl`) is now the primary source of truth for issue tracking.

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

1. Run `bd ready` to see prioritized issues
2. Read relevant [module design](../design/modules/) documentation
3. Review related [ADRs](../decisions/) for architectural decisions
4. Follow [TDD workflow](../CONTRIBUTING.md#available-scripts) in Contributing Guide

### During Development

- Update issue status: `bd update <id> --status in_progress`
- Link commits to issues (e.g., `Refs: event-service-agent-kata-f86`)
- Reference ADRs in code comments (e.g., `[adr: ADR-0006]`)
- Create issues for discovered work: `bd create "Found X" -t bug`
  - **Available issue types for `-t`:** `bug`, `task`, `epic`, `feature`, `chore`

### Quality Gates

- Run tests: `bun run test --run`
- Validate docs: `bun run docs:check && bun run docs:type-check`
- Format code: `bun run format`
- Type check: `bun run type-check`

---

## 📌 Conventions

### Issue IDs

Beads issues use hash-based IDs (e.g., `event-service-agent-kata-f86`).
Legacy `PL-#` IDs are preserved as labels for reference.

### Labels

- **Module scope**: `Timer`, `Orchestration`, `Api`, `Execution`, `platform`, `schemas`
- **Infrastructure**: `infra`, `architecture`
- **ADR links**: `ADR-0002`, `ADR-0013`, etc.
- **Legacy IDs**: `PL-2`, `PL-4.4`, etc.

### Priority Levels

- **P0** - Critical blockers (priority 0)
- **P1** - High priority (priority 1)
- **P2** - Normal priority (priority 2, default)

---

## 🎯 Next Steps

Run `bd ready` to see the next prioritized task to work on.
