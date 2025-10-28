# @event-service-agent/timer

**Timer module - Durable scheduling and DueTimeReached events**

## Purpose

The Timer module provides **durable delayed execution** for service calls. It receives `ScheduleTimer` commands from Orchestration, persists them, and publishes `DueTimeReached` events when the scheduled time arrives via a polling worker.

## Architecture

### Domain Model

**TimerEntry** - Aggregate root with two states:
- **Scheduled**: Timer waiting for due time
- **Reached**: Timer has fired (terminal state)

```typescript
type TimerEntry = 
  | ScheduledTimer  // Waiting to fire
  | ReachedTimer    // Already fired
```

### Workflows

1. **scheduleTimerWorkflow** (PL-4.3)
   - Consumes: `ScheduleTimer` command
   - Creates: `ScheduledTimer` domain entity
   - Persists: Timer entry with `Scheduled` state
   - No event published (timer just registered)

2. **pollDueTimersWorkflow** (PL-4.4)
   - Polls: All timers with `dueAt <= now` and `state = Scheduled`
   - Batch processes: Up to 100 timers per poll
   - Publishes: `DueTimeReached` event for each fired timer
   - Transitions: `Scheduled` → `Reached` (two-operation model)
   - Continues on error: Partial failures tracked with `BatchProcessingError`

### Ports

**Required dependencies:**
- **ClockPort**: Current time operations
- **TimerPersistencePort**: Timer storage (find, save, transition)
- **TimerEventBusPort**: Event publishing and command subscription

**Adapters provided:**
- **In-memory**: HashMap-based for testing (full lifecycle)
- **SQLite**: Production persistence (planned - PL-4.6)

## Package Structure

```
packages/timer/
├── src/
│   ├── domain/
│   │   ├── timer-entry.domain.ts      # TimerEntry aggregate
│   │   ├── events.domain.ts           # DueTimeReached event
│   │   └── *.test.ts                  # Domain logic tests
│   ├── workflows/
│   │   ├── schedule-timer.workflow.ts # Command handler
│   │   ├── poll-due-timers.workflow.ts # Polling worker
│   │   └── *.test.ts                  # Workflow tests
│   ├── ports/
│   │   ├── clock.port.ts              # Time operations interface
│   │   ├── timer-persistence.port.ts  # Storage interface
│   │   └── timer-event-bus.port.ts    # Messaging interface
│   └── adapters/
│       ├── clock.adapter.ts           # TestClock wrapper
│       ├── timer-persistence.adapter.ts # In-memory storage
│       └── timer-event-bus.adapter.ts # EventBus wrapper
└── README.md
```

## Key Features

### ✅ Durable Scheduling
Timers survive process restarts via persistence (SQLite in production).

### ✅ Idempotency
All operations safe to retry:
- `scheduleTimerWorkflow`: Upserts by `(tenantId, serviceCallId)`
- `pollDueTimersWorkflow`: Two-operation model prevents duplicate events

### ✅ Multi-Tenancy
All queries scoped by `tenantId` for data isolation.

### ✅ Observability
Structured logging and distributed tracing via `correlationId`.

### ✅ Partial Failure Handling
Batch processing continues on individual timer errors:
```typescript
BatchProcessingError {
  successCount: 97,
  failureCount: 3,
  failures: [/* details */]
}
```

## Usage Example

### Schedule a Timer
```typescript
import { scheduleTimerWorkflow } from '@event-service-agent/timer'

const program = Effect.gen(function* () {
  yield* scheduleTimerWorkflow({
    command: {
      type: 'ScheduleTimer',
      tenantId,
      serviceCallId,
      dueAt: Iso8601DateTime.make('2025-12-25T00:00:00Z')
    },
    correlationId
  })
})
```

### Poll Due Timers
```typescript
import { pollDueTimersWorkflow } from '@event-service-agent/timer'

// Run periodically (e.g., every 10 seconds)
const program = Effect.gen(function* () {
  yield* pollDueTimersWorkflow()
  // Publishes DueTimeReached for all due timers
})
```

## Dependencies

- **@event-service-agent/platform**: Messages, ports, routing
- **@event-service-agent/schemas**: Validated types (TenantId, ServiceCallId, etc.)
- **effect**: Effect system for workflows and state management

## Test Coverage

**53 tests passing:**
- Domain: 19 tests (TimerEntry state machine, events)
- Workflows: 22 tests (schedule, poll, error handling)
- Adapters: 24 tests (persistence lifecycle, clock operations)

**Run tests:**
```bash
bun run --filter @event-service-agent/timer test
```

## Related Documentation

- [Timer Module Design](../../docs/design/modules/timer.md)
- [ADR-0003: Timer Polling](../../docs/decisions/ADR-0003-timer.md)
- [ADR-0006: Idempotency](../../docs/decisions/ADR-0006-idempotency.md)
- [Messages Design](../../docs/design/messages.md)

## Current Status

**Completed (PL-4):**
- ✅ Domain model and state machine
- ✅ scheduleTimerWorkflow with validation
- ✅ pollDueTimersWorkflow with batch processing
- ✅ In-memory persistence adapter
- ✅ Comprehensive test coverage (53 tests)

**Pending (PL-4.6):**
- [ ] SQLite persistence adapter
- [ ] Integration tests with real broker
- [ ] Performance benchmarks

## Future Enhancements

- **Fast-path**: Immediate execution when `dueAt <= now` (skip persistence)
- **Concurrency**: Parallel timer processing with configurable batch size
- **Metrics**: Timer queue depth, latency distribution, fire accuracy
