# Bounded Contexts

Overview

- [Edge/API] (Delivery): Handles HTTP, validation, mapping to domain commands and queries.
- [Orchestration] (Core): Owns `ServiceCall` lifecycle and cross-cutting policies.
- [Execution] (Supporting/Supplier): Performs actual HTTP call and outcome capture.
- [Timer] (Infrastructure/Supplier): Schedules and emits [DueTimeReached].
- [Reporting] (Read/Conformist): Builds read models for queries.

Context Map

```mermaid
flowchart LR
  API-->|commands|ORCHESTRATION
  ORCHESTRATION-->|events|REPORTING
  ORCHESTRATION-->|command|EXECUTION
  ORCHESTRATION-->|port|TIMER
  TIMER-->|event|ORCHESTRATION
  EXECUTION-->|events|ORCHESTRATION
  REPORTING-->|queries|API
  click API "./contexts/api.md" "API Context"
  click ORCHESTRATION "./contexts/orchestration.md" "Orchestration Context"
  click EXECUTION "./contexts/execution.md" "Execution Context"
  click TIMER "./contexts/timer.md" "Timer Context"
  click REPORTING "./contexts/reporting.md" "Reporting Context"
```

Swimlane (Roles & Flows)

```mermaid
sequenceDiagram
  autonumber
  participant API as API
  participant ORCHESTRATION as Orchestration
  participant EXECUTION as Execution
  participant TIMER as Timer
  participant REPORTING as Reporting

  Note over API,REPORTING: solid = command/port, dashed = event

  link API: Doc @ ./contexts/api.md
  link ORCHESTRATION: Doc @ ./contexts/orchestration.md
  link EXECUTION: Doc @ ./contexts/execution.md
  link TIMER: Doc @ ./contexts/timer.md
  link REPORTING: Doc @ ./contexts/reporting.md

  API->>ORCHESTRATION: SubmitServiceCall
  ORCHESTRATION-->>REPORTING: ServiceCallSubmitted
  ORCHESTRATION->>TIMER: RegisterTimer
  TIMER-->>ORCHESTRATION: DueTimeReached
  ORCHESTRATION->>EXECUTION: StartExecution
  EXECUTION-->>ORCHESTRATION: ExecutionStarted
  EXECUTION-->>ORCHESTRATION: ExecutionSucceeded|ExecutionFailed
  ORCHESTRATION-->>REPORTING: ExecutionStarted|Succeeded|Failed
```

Responsibility Matrix (lightweight)

```mermaid
flowchart TB
  subgraph Submit
    A[Edge/API]:::Do --> B[Orchestration]:::Own
    B --> C[Reporting]:::Informed
  end
  subgraph Schedule
    B --> D[Timer]:::Supplier
  end
  subgraph Execute
    B --> E[Execution]:::Supplier
    E --> C
  end

  classDef Own fill:#e3f2fd,stroke:#1e88e5,color:#0d47a1
  classDef Supplier fill:#e8f5e9,stroke:#43a047,color:#1b5e20
  classDef Do fill:#fff3e0,stroke:#fb8c00,color:#e65100
  classDef Informed fill:#f3e5f5,stroke:#8e24aa,color:#4a148c
```

- API: validation, idempotency surface, HTTP mapping
- Orchestration: invariants, policy, idempotency, state transitions
- Execution: HTTP call, response/error mapping
- Timer: due handling
- Reporting: projections

Message Index

- Orchestration:
  - [SubmitServiceCall],
  - [ServiceCallSubmitted],
  - [ServiceCallScheduled],
  - [StartExecution],
  - [RegisterTimer]
- Execution:
  - [StartExecution],
  - [ExecutionStarted],
  - [ExecutionSucceeded],
  - [ExecutionFailed]
- Timer:
  - [RegisterTimer],
  - [DueTimeReached]
- Reporting: consumes all domain events (see above), no commands
- API (Edge): produces [SubmitServiceCall]

ES-first MVP Note

- Events are the source of truth in the event store; consumers subscribe and update projections.
- Repository is optional for snapshotting; add only if rebuild becomes expensive.

Ports Used (overview)

- Orchestration: [Clock], [EventStore], [Timer](./ports.md#timerport), [Repository] (optional)
- Execution: [HttpClient], [EventStore], [Clock]
- Timer: [Clock], [EventStore]
- Reporting: [EventStore], [ReadStore]
- API: [ReadStore]

[DueTimeReached]: ./messages.md#duetimereached
[ExecutionFailed]: ./messages.md#executionfailed
[ExecutionStarted]: ./messages.md#executionstarted
[ExecutionSucceeded]: ./messages.md#executionsucceeded
[RegisterTimer]: ./messages.md#registertimer
[ServiceCallScheduled]: ./messages.md#servicecallscheduled
[ServiceCallSubmitted]: ./messages.md#servicecallsubmitted
[StartExecution]: ./messages.md#startexecution
[SubmitServiceCall]: ./messages.md#submitservicecall
[Edge/API]: ./contexts/api.md
[Execution]: ./contexts/execution.md
[Orchestration]: ./contexts/orchestration.md
[Reporting]: ./contexts/reporting.md
[Timer]: ./contexts/timer.md
[Clock]: ./ports.md#clockport
[EventStore]: ./ports.md#eventstoreport
[HttpClient]: ./ports.md#httpclientport
[ReadStore]: ./ports.md#readstore
[Repository]: ./ports.md#repository
