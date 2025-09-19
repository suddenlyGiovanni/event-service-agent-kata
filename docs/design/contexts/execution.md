# Execution Context

Responsibility

- Perform a single attempt of the external call using protocol adapters.
- Emit `ExecutionStarted`, then either `ExecutionSucceeded` or `ExecutionFailed`.

Interfaces

- Command in: [StartExecution] { tenantId, serviceCallId }
- Ports: HttpClientPort, EventStore, Clock

Behavior

-- On [StartExecution]:

- Emit [ExecutionStarted] { startedAt }.
- Call HttpClientPort with requestSpec (fetched via correlation, or provided by contract in a future iteration).
- Map adapter result to either [ExecutionSucceeded] { finishedAt, responseMeta } or [ExecutionFailed] { finishedAt, errorMeta }.
- Exactly one terminal outcome emission per StartExecution.

Notes

- Non-2xx are failures in MVP.
- Stateless; idempotent on duplicate StartExecution (ignore if already started for same id).

Load from stream

- Before calling the external service, Execution resolves the `requestSpec` by loading the `ServiceCall` stream from [EventStorePort] and folding events in order (in MVP, the [ServiceCallSubmitted] event carries `requestSpec`). No local state is persisted; optionally, future iterations may pass a minimal request spec in the command to avoid the read.

Resolve RequestSpec

```mermaid
sequenceDiagram
  autonumber
  participant EXECUTION as Execution
  participant EVENT_STORE as EventStorePort
  participant HTTP_CLIENT as HttpClientPort

  Note over EXECUTION,HTTP_CLIENT: solid = command/port, dashed = event
  link EXECUTION: Doc @ ./execution.md
  link EVENT_STORE: Port @ ../ports.md#eventstoreport
  link HTTP_CLIENT: Port @ ../ports.md#httpclientport

  EXECUTION->>EVENT_STORE: load(ServiceCall stream)
  EVENT_STORE-->>EXECUTION: events (incl. ServiceCallSubmitted)
  EXECUTION->>HTTP_CLIENT: execute(requestSpec)
```

Inputs/Outputs Recap

- Inputs: [StartExecution] (command)
- Outputs:
  - [ExecutionStarted],
  - [ExecutionSucceeded] OR [ExecutionFailed] (events)
- Ports:
  - [HttpClientPort],
  - [EventStorePort],
  - [ClockPort]
- Storage: none (stateless)

Sequence (StartExecution → HTTP → Outcome)

```mermaid
sequenceDiagram
  autonumber
  participant ORCHESTRATION as Orchestration
  participant EXECUTION as Execution
  participant HTTP_CLIENT as HttpClientPort
  participant EXTERNAL_SERVICE as External Service

  Note over ORCHESTRATION,EXECUTION: solid = command/port, dashed = event
  link ORCHESTRATION: Doc @ ./orchestration.md
  link EXECUTION: Doc @ ./execution.md

  ORCHESTRATION->>EXECUTION: StartExecution [command]
  EXECUTION-->>ORCHESTRATION: ExecutionStarted [event]
  EXECUTION->>HTTP_CLIENT: execute(requestSpec)
  HTTP_CLIENT->>EXTERNAL_SERVICE: request
  alt success
    EXTERNAL_SERVICE-->>HTTP_CLIENT: response(status, headers, body)
  HTTP_CLIENT-->>EXECUTION: ok(statusCode, headers, bodySnippet, durationMs)
  EXECUTION-->>ORCHESTRATION: ExecutionSucceeded [event]
  else failure/timeout
    EXTERNAL_SERVICE--x HTTP_CLIENT: error/timeout
  HTTP_CLIENT-->>EXECUTION: fail(kind, statusCode?, message, responseSnippet?, durationMs)
  EXECUTION-->>ORCHESTRATION: ExecutionFailed [event]
  end
```

State (Attempt lifecycle)

```mermaid
stateDiagram-v2
  [*] --> Starting: StartExecution received
  Starting --> Succeeded: Response ok
  Starting --> Failed: Timeout/Network/HttpError
  Succeeded --> [*]
  Failed --> [*]
```

Messages

- [StartExecution]
- [ExecutionStarted]
- [ExecutionSucceeded]
- [ExecutionFailed]

## Ports Used

- HttpClientPort: see `../ports.md#httpclientport`
- EventStore: see `../ports.md#eventstoreport`
- Clock: see `../ports.md#clockport`

[StartExecution]: ../messages.md#startexecution
[ExecutionStarted]: ../messages.md#executionstarted
[ExecutionSucceeded]: ../messages.md#executionsucceeded
[ExecutionFailed]: ../messages.md#executionfailed
[ServiceCallSubmitted]: ../messages.md#servicecallsubmitted
[EventStorePort]: ../ports.md#eventstoreport
[HttpClientPort]: ../ports.md#httpclientport
[ClockPort]: ../ports.md#clockport
