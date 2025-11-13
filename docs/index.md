# Event Service Agent — Documentation

Architecture decision records (ADRs), design documentation, and development planning for the Event Service Agent kata project.

---

## 🎯 I want to

### **Understand the architecture**

→ Start with **[Design Documentation](design/)**

- Domain models and core concepts
- Module boundaries and interactions  
- Hexagonal architecture patterns
- Port interfaces and contracts

### **See why decisions were made**

→ Browse **[Architecture Decision Records (ADRs)](decisions/)**

- Topology, broker, timer, database choices
- Idempotency, outbox, observability patterns
- Identity generation and schema strategies
- [Full ADR index →](decisions/)

### **Contribute code**

→ Read **[Contributing Guide](CONTRIBUTING.md)**

- Development setup (Nix or manual)
- Test-driven development workflow
- Code quality and validation standards

### **Track current work**

→ Check **[Development Plan](plan/)**

- [Kanban Board](plan/kanban.md) - Active tasks and priorities
- [Project Plan](plan/plan.md) - Roadmap and milestones
- Implementation task breakdowns

### **Understand messages/contracts**

→ See **[Messages Documentation](design/messages.md)**

- Commands and events catalog
- Message envelope structure
- Schema validation patterns

### **Learn about specific modules**

→ Read **[Module Specifications](design/)**

- [Timer](design/modules/timer.md) - Time-based scheduling
- [Orchestration](design/modules/orchestration.md) - Workflow coordination
- [API](design/modules/api.md) - HTTP interface
- [Execution](design/modules/execution.md) - External service calls

---

## 📚 Documentation Structure

| Section                             | Purpose                            | When to Use                            |
|-------------------------------------|------------------------------------|----------------------------------------|
| **[ADRs](decisions/)**              | Records **why** we made decisions  | Understanding trade-offs and rationale |
| **[Design](design/)**               | Describes **what** the system does | Learning architecture and patterns     |
| **[Plan](plan/)**                   | Tracks **when** we'll build it     | Finding current work and roadmap       |
| **[Contributing](CONTRIBUTING.md)** | Explains **how** to develop        | Setting up and contributing code       |

---

## 🏗️ Project Architecture

This is a **Domain-Driven Design (DDD)** event-sourced system using:

- **Effect-TS** - Functional TypeScript with typed effects
- **Hexagonal Architecture** - Ports & adapters pattern
- **Event-Driven** - Asynchronous module communication
- **Multi-Tenant** - Tenant isolation at all layers

---

## 🗺️ Site Map

```txt
Documentation Home (you are here)
├── Contributing Guide ← Setup & development workflow
├── Decisions (ADRs) ← Why we made architectural choices
│   └── 13 decision records (topology, broker, timer, etc.)
├── Design ← What the system does
│   ├── Domain, Messages, Ports, Architecture
│   └── Modules: API, Timer, Orchestration, Execution
└── Plan ← What we're building now
    ├── Kanban (task tracking)
    └── Roadmap & implementation plans
```

---

## 📝 Notes

- This site is published automatically to GitHub Pages on merges to `main`
- API reference (TypeDoc) will be added in future releases
- All code examples in documentation are validated and tested in CI
- Use breadcrumbs at the top of each page to navigate back
