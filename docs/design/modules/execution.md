# Execution Module

Responsibility

- Perform a single attempt of the external call using protocol adapters.
- Emit `ExecutionStarted`, then either `ExecutionSucceeded` or `ExecutionFailed`.

Interfaces

- Command in: [StartExecution] { tenantId, serviceCallId, requestSpec }
- Ports: HttpClientPort, EventBus (publish), Clock

Behavior

-- On [StartExecution]:

- Emit [ExecutionStarted] { startedAt }.
- Call HttpClientPort with requestSpec (provided in command).
- Map adapter result to either [ExecutionSucceeded] { finishedAt, responseMeta } or [ExecutionFailed] { finishedAt, errorMeta }.
- Exactly one terminal outcome emission per StartExecution.

Notes

- Non-2xx are failures in MVP.
- Stateless; idempotent on duplicate StartExecution (publisher partitioning keeps order; duplicates harmless to Orchestration).
- Reliability (MVP): producer acks + retry; Orchestration watchdog times out long-running executions to a Failed state.

Resolve RequestSpec

- Provided in [StartExecution]; no DB or event-store read required.

Resolve RequestSpec

```mermaid
sequenceDiagram
  autonumber
  participant EXECUTION as Execution
  participant HTTP_CLIENT as HttpClientPort

  Note over EXECUTION,HTTP_CLIENT: solid = command/port, dashed = event
  link EXECUTION: Doc @ ./execution.md
  link HTTP_CLIENT: Port @ ../ports.md#httpclientport

  EXECUTION->>HTTP_CLIENT: execute(requestSpec)
```

Inputs/Outputs Recap

- Inputs: [StartExecution] (command)
- Outputs:
  - [ExecutionStarted],
  - [ExecutionSucceeded] OR [ExecutionFailed] (events)
- Ports:
  - [HttpClientPort],
  - [EventBusPort],
  - [ClockPort]
- Storage: none (stateless)

Sequence (StartExecution HTTP Outcome)

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

- [ExecutionFailed]
- [ExecutionStarted]
- [ExecutionSucceeded]
- [StartExecution]

## Ports Used

- [ClockPort]
- [EventBusPort]
- [HttpClientPort]

<!-- Commands -->

[StartExecution]: ../messages.md#startexecution

<!-- Messages -->

[ExecutionFailed]: ../messages.md#executionfailed
[ExecutionStarted]: ../messages.md#executionstarted
[ExecutionSucceeded]: ../messages.md#executionsucceeded

<!-- Ports -->

[ClockPort]: ../ports.md#clockport
[EventBusPort]: ../ports.md#eventbusport
[HttpClientPort]: ../ports.md#httpclientport
