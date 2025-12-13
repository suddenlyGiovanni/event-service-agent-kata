# Agent Instructions — Orchestration Module

## Module Purpose

The Orchestration module is the **central coordinator** and **single writer** for ServiceCall aggregates. It manages the complete lifecycle of service calls by coordinating Timer and Execution modules through events.

## Key Responsibilities

- **Own ServiceCall Aggregate:** Only module that writes to `service_calls` table
- **Coordinate Lifecycle:** Submit → Schedule → Run → Succeed/Fail
- **Command Handling:** Process SubmitServiceCall, DueTimeReached, ExecutionResult
- **Event Publishing:** Emit state transition events (ServiceCallScheduled, Running, Succeeded, Failed)
- **Command Dispatching:** Send ScheduleTimer and StartExecution commands to other modules

## Domain Model

**ServiceCall States:**

- **Submitted** — Request received and validated
- **Scheduled** — Timer scheduled, waiting for due time
- **Running** — Execution started
- **Succeeded** — HTTP request completed successfully
- **Failed** — HTTP request failed

**State Transitions:**

```text
Submitted → Scheduled → Running → Succeeded
                            ↓
                         Failed
```

**Invariants:**

- Forward-only transitions (no backward transitions)
- Terminal states: Succeeded, Failed
- All transitions are idempotent (duplicate events are no-ops)

## Architecture Constraints

### ✅ Must Do (Critical!)

- **Single Writer Principle:** ONLY orchestration writes to `service_calls` table
- **Event-Driven Coordination:** All inter-module communication via EventBus
- **Outbox Pattern:** Publish events only after DB commit (ADR-0008)
- **Application-Generated IDs:** Generate ServiceCallId with UUID v7 (ADR-0010)
- **Multi-Tenancy:** All operations scoped by `tenant_id`
- **Idempotency:** All handlers safe to retry with same event

### ❌ Must Not Do

- Never read Timer or Execution tables directly
- Never call other modules synchronously
- Never publish events before DB commit
- Never generate IDs in database
- Never allow cross-tenant data access

## Module Interactions

```text
     API
      ↓ SubmitServiceCall
┌──────────────────────┐
│  Orchestration       │ ← You are here
│  (Single Writer)     │
└──────────────────────┘
      ↓            ↑
ScheduleTimer  DueTimeReached
      ↓            ↑
    Timer        Timer

      ↓            ↑
StartExecution  ExecutionResult
      ↓            ↑
  Execution    Execution
```

## Project Structure

```text
packages/orchestration/
├── src/
│   ├── domain/
│   │   ├── service-call.domain.ts     # ServiceCall aggregate
│   │   └── transitions.domain.ts      # State machine (pure functions)
│   ├── workflows/
│   │   ├── submit.workflow.ts         # Handle SubmitServiceCall
│   │   ├── due.workflow.ts            # Handle DueTimeReached
│   │   └── result.workflow.ts         # Handle Execution results
│   ├── ports/
│   │   └── service-call-persistence.port.ts  # Storage interface
│   └── adapters/
│       └── service-call-persistence.adapter.ts  # SQLite/In-memory
└── README.md
```

## Key Workflows (Planned)

### submitWorkflow

```typescript
// Input: SubmitServiceCall command
// Actions:
//   1. Generate ServiceCallId (UUID v7)
//   2. Create ServiceCall in Submitted state
//   3. Persist to service_calls table
//   4. Publish ServiceCallSubmitted event
//   5. Send ScheduleTimer command to Timer
```

### dueWorkflow

```typescript
// Input: DueTimeReached event
// Actions:
//   1. Load ServiceCall from persistence
//   2. Transition to Running state
//   3. Persist updated state
//   4. Publish ServiceCallRunning event
//   5. Send StartExecution command to Execution
```

### resultWorkflow

```typescript
// Input: ExecutionSucceeded OR ExecutionFailed event
// Actions:
//   1. Load ServiceCall from persistence
//   2. Transition to Succeeded/Failed state
//   3. Store response/error metadata
//   4. Persist updated state
//   5. Publish ServiceCallSucceeded/Failed event
```

## Testing Guidelines

### State Machine Tests (Pure Functions)

```typescript
// Domain transitions are pure functions
it("should transition from Scheduled to Running", () => {
  const scheduled = ServiceCall.schedule(submitted, dueAt);
  const running = ServiceCall.start(scheduled, now);

  expect(running.status).toBe("Running");
  expect(running.startedAt).toBe(now);
});
```

### Workflow Tests (Effect)

```typescript
it.effect("should handle SubmitServiceCall command", () =>
  Effect.gen(function* () {
    const persistence = yield* ServiceCallPersistencePort;
    const eventBus = yield* EventBusPort;

    yield* submitWorkflow(command);

    // Verify persisted state
    const serviceCall = yield* persistence.find(tenantId, serviceCallId);
    expect(serviceCall.status).toBe("Submitted");

    // Verify published events
    const events = yield* eventBus.getPublishedEvents();
    expect(events).toContainEvent("ServiceCallSubmitted");
    expect(events).toContainCommand("ScheduleTimer");
  }).pipe(Effect.provide(testLayer))
);
```

### Idempotency Tests

```typescript
it.effect("should handle duplicate DueTimeReached events", () =>
  Effect.gen(function* () {
    // First event transitions to Running
    yield* dueWorkflow(dueEvent);
    const first = yield* persistence.find(tenantId, serviceCallId);

    // Second event is no-op
    yield* dueWorkflow(dueEvent);
    const second = yield* persistence.find(tenantId, serviceCallId);

    expect(first).toEqual(second); // No state change
  }).pipe(Effect.provide(testLayer))
);
```

## Database Schema (Planned)

```sql
CREATE TABLE service_calls (
  tenant_id TEXT NOT NULL,
  service_call_id TEXT NOT NULL,
  status TEXT NOT NULL,              -- Submitted, Scheduled, Running, Succeeded, Failed
  name TEXT NOT NULL,
  request_spec_json TEXT NOT NULL,   -- { method, url, headers, body }
  submitted_at TEXT NOT NULL,
  due_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  response_meta_json TEXT,
  error_meta_json TEXT,
  correlation_id TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, service_call_id)
);

-- Index for status queries
CREATE INDEX idx_service_calls_status
  ON service_calls(tenant_id, status, due_at);
```

## Multi-Tenancy Checklist

- [ ] `tenantId` in all command/event payloads
- [ ] `tenant_id` in all SQL WHERE clauses
- [ ] Composite key `(tenant_id, service_call_id)` in tables
- [ ] `tenantId` in broker partition key
- [ ] Tests verify tenant isolation
- [ ] Queries never return cross-tenant data

## Related Documentation

- **Module Design:** `../../docs/design/modules/orchestration.md`
- **ADR-0001:** Topology and module boundaries
- **ADR-0004:** Database and single writer principle
- **ADR-0006:** Idempotency strategy
- **ADR-0008:** Outbox pattern
- **ADR-0010:** Identity generation (UUID v7)
- **Domain Model:** `../../docs/design/domain.md`

## Current Status

**Status:** Not yet implemented (PL-2)

**Prerequisites:**

- ✅ Timer module (PL-4) — Complete
- ✅ Schema migration (PL-14) — Complete
- [ ] Domain model design (PL-2) — Next
- [ ] Broker adapter (PL-3) — Needed for integration

**Next Steps:**

1. Define ServiceCall aggregate and state machine
2. Implement state transition functions (pure)
3. Create submitWorkflow, dueWorkflow, resultWorkflow
4. Define ServiceCallPersistencePort
5. In-memory persistence adapter
6. Comprehensive unit tests
7. Integration tests with Timer/Execution

---

See root-level `AGENTS.md` for project-wide guidelines.
