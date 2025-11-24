# @event-service-agent/orchestration

**Orchestration core - ServiceCall aggregate and state transitions**

## Purpose

The `orchestration` module is the **central coordinator** of the event service agent. It manages the ServiceCall aggregate and orchestrates the lifecycle of scheduled HTTP requests by coordinating Timer and Execution modules.

## Responsibilities

### 🎯 ServiceCall Aggregate

Owns the **ServiceCall** aggregate root with states:

- **Submitted**: Request received and validated
- **Scheduled**: Timer scheduled, waiting for due time
- **Running**: Execution started
- **Succeeded**: HTTP request completed successfully
- **Failed**: HTTP request failed

### 🔄 Command Handling

#### SubmitServiceCall (from API)

1. Generate `ServiceCallId`
2. Validate request specification
3. Store request body (with body)
4. Transition to `Submitted` state
5. Publish `ServiceCallScheduled` event
6. Send `ScheduleTimer` command to Timer

#### DueTimeReached (from Timer)

1. Validate timer hasn't already fired
2. Transition to `Running` state
3. Publish `ServiceCallRunning` event
4. Send `StartExecution` command to Execution

#### ExecutionSucceeded / ExecutionFailed (from Execution)

1. Validate execution hasn't already completed
2. Transition to `Succeeded` or `Failed` state
3. Publish `ServiceCallSucceeded` or `ServiceCallFailed` event
4. Record response/error metadata

## Architecture Role

Orchestration is the **single writer** for ServiceCall data:

```txt
     API
      ↓ SubmitServiceCall
┌──────────────────────────┐
│  @orchestration          │
│  (This Package)          │
│                          │
│  • Owns ServiceCall      │
│  • Coordinates modules   │
│  • Single writer ✅      │
└──────────────────────────┘
      ↓                ↑
ScheduleTimer    DueTimeReached
      ↓                ↑
   Timer          Timer

      ↓                ↑
StartExecution  ExecutionResult
      ↓                ↑
  Execution      Execution
```

**Key Principles:**

- ✅ Single Writer: Only orchestration writes to `service_calls` table
- ✅ Event-Driven: All inter-module communication via EventBus
- ✅ Idempotent: All handlers safe to retry
- ✅ Immutable Events: Published events never modified

## Current Status

**Not Yet Implemented (PL-2)**

This package exists as a placeholder. The Orchestration module will be implemented after:

- ✅ Timer module (PL-4) - Complete
- ✅ Schema migration (PL-14) - Complete
- [ ] Domain model design (PL-2) - Next
- [ ] Broker adapter (PL-3) - Needed for integration

## Dependencies

- **@event-service-agent/platform**: Shared ports (EventBusPort, UuidPort) and integration types
- **@event-service-agent/schemas**: Message payload schemas, UUID7/ID types (TenantId, ServiceCallId, etc.), validated message types
- **effect**: Effect runtime

## Planned Structure

```txt
packages/orchestration/
├── src/
│   ├── domain/
│   │   ├── service-call.domain.ts # ServiceCall aggregate
│   │   └── transitions.domain.ts  # State machine logic
│   ├── workflows/
│   │   ├── submit.workflow.ts     # Handle SubmitServiceCall
│   │   ├── due.workflow.ts        # Handle DueTimeReached
│   │   └── result.workflow.ts     # Handle Execution results
│   ├── ports/
│   │   └── service-call-persistence.port.ts # Storage interface
│   └── adapters/
│       └── service-call-persistence.adapter.ts # SQLite/In-memory
└── README.md
```

## State Machine

```txt
Submitted → Scheduled → Running → Succeeded
                            ↓
                         Failed
```

**Transitions:**

1. `submit` → **Submitted** (via SubmitServiceCall command)
2. `schedule` → **Scheduled** (after timer scheduled)
3. `start` → **Running** (via DueTimeReached event)
4. `succeed` → **Succeeded** (via ExecutionSucceeded event)
5. `fail` → **Failed** (via ExecutionFailed event)

**Invariants:**

- Can only transition forward (no backward transitions)
- Terminal states: `Succeeded`, `Failed`
- Idempotent: Duplicate events are no-ops

## Domain Model (Planned)

```typescript
type ServiceCall =
	| { status: 'Submitted'; name: string; requestSpec: RequestSpec /* ...*/ }
	| { status: 'Scheduled'; dueAt: DateTime.Utc /* ...*/ }
	| { status: 'Running'; startedAt: DateTime.Utc /* ...*/ }
	| { status: 'Succeeded'; responseMeta: ResponseMeta /* ...*/ }
	| { status: 'Failed'; errorMeta: ErrorMeta /* ...*/ }

// State transition functions (pure)
declare const schedule: (call: Submitted, dueAt: DateTime.Utc) => Scheduled
declare const start: (call: Scheduled, startedAt: DateTime.Utc) => Running
declare const succeed: (call: Running, meta: ResponseMeta) => Succeeded
declare const fail: (call: Running, meta: ErrorMeta) => Failed
```

## Workflows (Planned)

### submitWorkflow

```typescript ignore
const submitWorkflow = Effect.fn('Orchestration.Submit')(function* (command: SubmitServiceCall) {
	// Generate ID
	const serviceCallId = yield* ServiceCallId.makeUUID7()

	// Create aggregate
	const serviceCall = ServiceCall.submit({
		serviceCallId,
		tenantId: command.tenantId,
		name: command.name,
		requestSpec: command.requestSpec,
		submittedAt: yield* Clock.currentTimeMillis,
	})

	// Persist
	yield* persistence.save(serviceCall)

	// Publish event
	yield* eventBus.publish([makeSubmittedEvent(serviceCall)])

	// Send command to Timer
	yield* eventBus.publish([makeScheduleTimerCommand(serviceCall)])
})
```

### dueWorkflow

```typescript ignore
const dueWorkflow = Effect.fn('Orchestration.Due')(function* (event: DueTimeReached) {
	// Load aggregate
	const serviceCall = yield* persistence.find(event.tenantId, event.serviceCallId)

	// Transition
	const running = ServiceCall.start(serviceCall, yield* Clock.currentTimeMillis)

	// Persist
	yield* persistence.save(running)

	// Publish event
	yield* eventBus.publish([makeRunningEvent(running)])

	// Send command to Execution
	yield* eventBus.publish([makeStartExecutionCommand(running)])
})
```

## Persistence Schema (Planned)

```sql
CREATE TABLE service_calls (
  tenant_id TEXT NOT NULL,
  service_call_id TEXT NOT NULL,
  status TEXT NOT NULL,
  name TEXT NOT NULL,
  request_spec_json TEXT NOT NULL,
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

CREATE INDEX idx_service_calls_status
  ON service_calls(tenant_id, status, due_at);
```

## Testing Strategy

### Unit Tests

- State transition functions (pure)
- Domain validation rules
- Event/command construction

### Integration Tests

- Full workflow with in-memory adapters
- Event sequencing (submit → schedule → run → succeed)
- Error scenarios (duplicate events, invalid transitions)

### Property Tests

- State machine invariants
- Idempotency guarantees

## Related Documentation

- [Orchestration Module Design](../../docs/design/modules/orchestration.md)
- [ADR-0001: Topology](../../docs/decisions/ADR-0001-topology.md)
- [ADR-0004: Database](../../docs/decisions/ADR-0004-database.md)
- [ADR-0006: Idempotency](../../docs/decisions/ADR-0006-idempotency.md)
- [Domain Model](../../docs/design/domain.md)

## Future Work (PL-2)

1. Define ServiceCall aggregate and state machine
2. Implement state transition functions (pure)
3. Create submitWorkflow, dueWorkflow, resultWorkflow
4. Define ServiceCallPersistencePort
5. In-memory persistence adapter
6. Comprehensive unit tests
7. Integration tests with Timer/Execution

## Observability

All workflows include:

- **Spans**: Distributed tracing via correlationId
- **Logs**: Structured logging with tenantId + serviceCallId
- **Metrics**: State transition counts, latency histograms
