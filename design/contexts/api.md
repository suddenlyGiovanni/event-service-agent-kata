# API (Edge) Context (Contracted)

Responsibility

- Accept external requests, validate, map to commands/queries.

Interfaces

- POST `/api/tenants/:tenantId/service-calls` [SubmitServiceCall]
- GET `/api/tenants/:tenantId/service-calls` (list with filters)
- GET `/api/tenants/:tenantId/service-calls/:serviceCallId` (detail)

Sequence (Submit)

```mermaid
sequenceDiagram
  autonumber
  participant CLIENT as Client
  participant API as API
  participant ORCHESTRATION as Orchestration

  Note over CLIENT,ORCHESTRATION: solid = command/port, dashed = event
  link API: Doc @ ./api.md
  link ORCHESTRATION: Doc @ ./orchestration.md

  CLIENT->>API: POST /service-calls
  API->>ORCHESTRATION: [SubmitServiceCall] [command]
  ORCHESTRATION-->>API: [ServiceCallSubmitted] [event]
  API-->>CLIENT: 202 Accepted (idempotency key)
```

Sequence (Query List)

```mermaid
sequenceDiagram
  autonumber
  participant CLIENT as Client
  participant API as API
  participant REPORTING as Reporting

  Note over CLIENT,REPORTING: solid = command/port, dashed = event
  link API: Doc @ ./api.md
  link REPORTING: Doc @ ./reporting.md

  CLIENT->>API: GET /service-calls
  API->>REPORTING: listExecutions(query)
  REPORTING-->>API: list
  API-->>CLIENT: 200 OK list
```

Inputs/Outputs Recap

- Inputs: HTTP requests (submit, list, detail)
- Outputs: HTTP responses
- Ports: `Reporting` (queries via ReadStore)

Messages

- [SubmitServiceCall]
- [ServiceCallSubmitted]

## Ports Used

- [ReadStore] (via Reporting): see `../ports.md#readstore`

[SubmitServiceCall]: ../messages.md#submitservicecall
[ServiceCallSubmitted]: ../messages.md#servicecallsubmitted
[ReadStore]: ../ports.md#readstore
