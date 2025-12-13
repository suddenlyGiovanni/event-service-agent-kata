# Agent Instructions — Timer Module

## Module Purpose

The Timer module provides **durable delayed execution** for service calls. It schedules timers, persists them, and publishes `DueTimeReached` events when the scheduled time arrives via a polling worker.

## Key Responsibilities

- Accept `ScheduleTimer` commands from Orchestration
- Persist timers durably (survives restarts)
- Poll for due timers periodically
- Publish `DueTimeReached` events when timers fire
- Handle batch processing with partial failure support

## Domain Model

**TimerEntry States:**

- **Scheduled** — Timer waiting for due time
- **Reached** — Timer has fired (terminal state)

**State Transition:** `Scheduled → Reached` (via polling workflow)

## Architecture Constraints

### ✅ Must Do

- **Two-Operation Model:** Find due timers → Fire → Mark as reached (prevents duplicate events)
- **Idempotency:** Safe to poll multiple times; same timer never fires twice
- **Multi-Tenancy:** All queries filter by `tenant_id`
- **Batch Processing:** Process up to 100 timers per poll, continue on individual failures
- **Sequential Processing:** `concurrency: 1` to preserve event ordering per `serviceCallId`

### ❌ Must Not Do

- Never query orchestration/execution tables (use events only)
- Never call other modules synchronously (use EventBus)
- Never generate IDs in database (use UUID v7 in application)
- Never publish events before DB commit (use outbox pattern)

## Project Structure

```text
packages/timer/
├── src/
│   ├── domain/           # Pure domain logic
│   │   ├── timer-entry.domain.ts
│   │   └── events.domain.ts
│   ├── workflows/        # Business logic
│   │   ├── schedule-timer.workflow.ts
│   │   └── poll-due-timers.workflow.ts
│   ├── ports/            # Interfaces
│   │   ├── clock.port.ts
│   │   ├── timer-persistence.port.ts
│   │   └── timer-event-bus.port.ts
│   └── adapters/         # Implementations
│       └── *.adapter.ts
└── README.md             # Detailed module docs
```

## Key Workflows

### scheduleTimerWorkflow

```typescript
// Input: ScheduleTimer command
// Output: TimerEntry persisted in Scheduled state
// No events published (timer just registered)
```

### pollDueTimersWorkflow

```typescript
// Polls: WHERE dueAt <= now AND state = 'Scheduled'
// Batch: Process up to 100 timers
// Publishes: DueTimeReached event per timer
// Transitions: Scheduled → Reached
// Errors: BatchProcessingError with partial success
```

## Testing Guidelines

**Current Coverage:** 53 tests passing

- Domain: 19 tests (state machine, validation)
- Workflows: 22 tests (schedule, poll, errors)
- Adapters: 24 tests (persistence, clock)

**Test Pattern:**

```typescript
it.effect("should handle batch processing", () =>
  Effect.gen(function* () {
    // Use in-memory adapters for TDD
    const persistence = yield* TimerPersistencePort;
    const eventBus = yield* TimerEventBusPort;

    // Test with tenant isolation
    yield* scheduleTimer({ tenantId: tenantA, ... });
    yield* scheduleTimer({ tenantId: tenantB, ... });

    // Verify tenant filtering
    const results = yield* pollDueTimers();
    expect(results.filter(r => r.tenantId === tenantA)).toHaveLength(1);
  }).pipe(Effect.provide(testLayer))
);
```

## Common Patterns

### Port Usage

```typescript
// Always inject ports, never import adapters
Effect.gen(function* () {
  const clock = yield* ClockPort;
  const persistence = yield* TimerPersistencePort;
  const eventBus = yield* TimerEventBusPort;

  // Use ports for all side effects
  const now = yield* clock.now();
  yield* persistence.save(timer);
  yield* eventBus.publish(events);
});
```

### Error Handling

```typescript
// Use typed errors, never throw
class TimerValidationError extends Schema.TaggedError<TimerValidationError>()(
  "TimerValidationError",
  { field: Schema.String, message: Schema.String }
) {}

// Workflows declare all error types
const workflow: Effect.Effect<
  Result,
  TimerValidationError | PersistenceError,
  ClockPort | TimerPersistencePort
> = Effect.gen(function* () {
  // Errors propagate automatically
  const timer = yield* validateTimer(command);
  yield* persistence.save(timer);
});
```

## Multi-Tenancy Checklist

- [x] `tenantId` in all command/event payloads
- [x] `tenant_id` in all SQL WHERE clauses
- [x] Composite key `(tenant_id, service_call_id)` in tables
- [x] `tenantId` in broker partition key
- [x] Tests verify tenant isolation

## Related Documentation

- **Module Design:** `../../docs/design/modules/timer.md`
- **ADR-0003:** Timer polling strategy
- **ADR-0006:** Idempotency guarantees
- **Messages:** `../../docs/design/messages.md`

## Current Status

**Completed:** Domain model, workflows, in-memory adapters, 53 tests

**Pending:** SQLite adapter, integration tests, performance benchmarks

---

See root-level `AGENTS.md` for project-wide guidelines.
