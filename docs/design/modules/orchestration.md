# Orchestration Module

Responsibility

- Own the `ServiceCall` lifecycle and invariants.
- Single writer: validate commands/process events, write domain DB, publish domain events after commit via outbox.
- Decide scheduling, guard start conditions, and finalize outcomes.

Core Model

- **Aggregate**: ServiceCall
  - Identity: `(tenantId, serviceCallId)`
  - State: name, submittedAt, dueAt, requestSpec, status (Scheduled|Running|Succeeded|Failed), tags, startedAt?, finishedAt?, outcome meta
  - Invariants: single attempt, legal transitions, terminal immutability, dueAt eligibility

Commands (intent)

- [SubmitServiceCall] `{ tenantId, name, dueAt, requestSpec, tags? }`
- [StartExecution] `{ tenantId, serviceCallId, requestSpec }` (issued to Execution)
- [ScheduleTimer] `{ tenantId, serviceCallId, dueAt }` (issued to Timer)

Events (facts)

- [ServiceCallSubmitted] `{ name, requestSpec\*, submittedAt, tags? }`
- [ServiceCallScheduled] `{ dueAt }`
- [ServiceCallRunning] `{ startedAt }`
- [ServiceCallSucceeded] `{ finishedAt, responseMeta }`
- [ServiceCallFailed] `{ finishedAt, errorMeta }`
- Process events consumed: [DueTimeReached], [ExecutionStarted], [ExecutionSucceeded], [ExecutionFailed]

Policies

- On [ServiceCallSubmitted] / [ServiceCallScheduled]:
  IF `dueAt <= now` THEN issue [StartExecution]; ELSE issue [ScheduleTimer].
- On [DueTimeReached]:
  IF `status == Scheduled` AND `dueAt <= now`
  THEN issue [StartExecution].
- On outcomes: apply to drive terminal state.
- Watchdog: if `status == Running` past timeout, mark Failed:Timeout.

Identity & Context

**IDs Generated:**

- **ServiceCallId** — If not provided by API, generates UUID v7 (fallback, typically API provides)
- **EnvelopeId** — Generated when publishing commands/events (UUID v7)

**IDs Received:**

- **TenantId** — From incoming [SubmitServiceCall] command (via RequestContext)
- **ServiceCallId** — From incoming commands or self-generated
- **CorrelationId** — From incoming commands (via RequestContext, pass-through to published events)

**Pattern:**

```typescript
// Typical: ServiceCallId provided by API in SubmitServiceCall command
const { tenantId, serviceCallId, correlationId } = command

// Fallback: If command lacks ServiceCallId (shouldn't happen in practice)
const finalServiceCallId = serviceCallId ?? Schema.make(ServiceCallId)(crypto.randomUUID())

// When publishing events: generate EnvelopeId
const envelopeId = Schema.make(EnvelopeId)(crypto.randomUUID())
const envelope = MessageEnvelope({
  envelopeId,
  tenantId,
  correlationId,
  payload: ServiceCallSubmitted({ serviceCallId: finalServiceCallId, ... })
})
```

**Rationale:** Orchestration is the aggregate owner (ServiceCall). It receives ServiceCallId from API (preferred) or generates if missing. All published messages include EnvelopeId for broker deduplication. See [ADR-0010][] for identity generation strategy.

Ports

- Persistence (domain DB read/write)
- OutboxPublisher (append domain events within tx)
- EventBus (publish commands, consume process events)
- TimerPort.schedule({ id, tenantId, dueTimeMs })
- Clock.now() for guards

Out-of-Scope (here)

- HTTP specifics, retry policies, cancellation.

Acceptance (MVP)

- For any submitted ServiceCall, the context ensures exactly one of Succeeded/Failed is eventually reached and observable.

Scheduling Path (Due  StartExecution  Running)

```mermaid
flowchart TB
  subgraph "Orchestration"
    A["ServiceCallSubmitted / ServiceCallScheduled"]
    B{"dueAt <= now"}
    C["StartExecution (command)"]
    F["ServiceCallRunning (domain event)"]
  end

  subgraph "Timer"
    D["ScheduleTimer (command)"]
    E["DueTimeReached (event)"]
  end

  A --> B
  B -->|yes| C
  B -->|no| D
  D --> E
  E --> C
  C --> F

  classDef cmd fill:#e3f2fd,stroke:#1e88e5,color:#0d47a1
  classDef proc fill:#fff3e0,stroke:#fb8c00,color:#e65100
  classDef dom fill:#e8f5e9,stroke:#43a047,color:#1b5e20

  class C,D cmd
  class E proc
  class A,F dom
```

Event Mapping (Process  Domain)

```mermaid
flowchart TB
  subgraph "Execution (process events)"
    ES[ExecutionStarted]
    EOK[ExecutionSucceeded]
    EKO[ExecutionFailed]
  end

  subgraph "Orchestration (domain events)"
    DR[ServiceCallRunning]
    DS[ServiceCallSucceeded]
    DF[ServiceCallFailed]
  end

  ES -->|set Running| DR
  EOK -->|set Succeeded| DS
  EKO -->|set Failed| DF

  classDef proc fill:#fff3e0,stroke:#fb8c00,color:#e65100
  classDef dom fill:#e8f5e9,stroke:#43a047,color:#1b5e20

  class ES,EOK,EKO proc
  class DR,DS,DF dom
```

Sequence (Scheduled  StartExecution  Outcome)

```mermaid
sequenceDiagram
  autonumber
  participant ORCH as Orchestration
  participant DB as DomainDB
  participant EXEC as Execution
  link ORCH: Doc @ ./orchestration.md
  link EXEC: Doc @ ./execution.md

  Note over ORCH,EXEC: solid = command/port, dashed = event

  ORCH->>DB: create Scheduled (tx) + outbox ServiceCallSubmitted/Scheduled
  alt dueAt <= now
    ORCH->>EXEC: StartExecution [command]
  else
    ORCH->>TIMER: ScheduleTimer [command]
  end
  EXEC-->>ORCH: ExecutionStarted [event]
  ORCH->>DB: set Running (tx) + outbox ServiceCallRunning
  alt success
    EXEC-->>ORCH: ExecutionSucceeded [event]
    ORCH->>DB: set Succeeded (tx) + outbox ServiceCallSucceeded
  else failure
    EXEC-->>ORCH: ExecutionFailed [event]
    ORCH->>DB: set Failed (tx) + outbox ServiceCallFailed
  end
```

Inputs/Outputs Recap

- Inputs:
  - [SubmitServiceCall] (command),
  - [DueTimeReached] (event),
  - [ExecutionStarted] OR [ExecutionSucceeded] OR [ExecutionFailed] (events)
- Outputs:
  - [ServiceCallSubmitted], [ServiceCallScheduled], [ServiceCallRunning], [ServiceCallSucceeded], [ServiceCallFailed] (events via outbox)
  - [StartExecution], [ScheduleTimer] (commands)
- Ports: [PersistencePort], [OutboxPublisherPort], [EventBusPort], [TimerPort], [ClockPort]
- Read Side: API reads domain DB; no projections

Messages

- [DueTimeReached]
- [ScheduleTimer]
- [ServiceCallFailed]
- [ServiceCallRunning]
- [ServiceCallScheduled]
- [ServiceCallSubmitted]
- [ServiceCallSucceeded]
- [StartExecution]
- [SubmitServiceCall]

State access

- On handling commands or due/process events, Orchestration reads/writes the domain DB using conditional updates to enforce legal transitions. Domain events are appended to the outbox within the same transaction and published after commit.

<!-- Ports -->

[ClockPort]: ../ports.md#clockport
[EventBusPort]: ../ports.md#eventbusport
[OutboxPublisherPort]: ../ports.md#outboxpublisher
[PersistencePort]: ../ports.md#persistenceport-domain-db
[TimerPort]: ../ports.md#timerport

<!-- Events -->

[DueTimeReached]: ../messages.md#duetimereached
[ExecutionFailed]: ../messages.md#executionfailed
[ExecutionStarted]: ../messages.md#executionstarted
[ExecutionSucceeded]: ../messages.md#executionsucceeded
[ServiceCallFailed]: ../messages.md#servicecallfailed
[ServiceCallRunning]: ../messages.md#servicecallrunning
[ServiceCallScheduled]: ../messages.md#servicecallscheduled
[ServiceCallSubmitted]: ../messages.md#servicecallsubmitted
[ServiceCallSucceeded]: ../messages.md#servicecallsucceeded

<!-- Commands -->

[ScheduleTimer]: ../messages.md#scheduletimer
[StartExecution]: ../messages.md#startexecution
[SubmitServiceCall]: ../messages.md#submitservicecall

<!-- ADRs -->

[ADR-0010]: ../../decisions/ADR-0010-identity.md
