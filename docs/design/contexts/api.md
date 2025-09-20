# API (Edge) Context

Responsibility

- Accept external requests, validate, publish commands, and query DB for UI.

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
  API-->>CLIENT: 202 Accepted (Location: /service-calls/:id)
```

Sequence (Query List)

```mermaid
sequenceDiagram
  autonumber
  participant CLIENT as Client
  participant API as API
  participant DB as Domain DB

  link API: Doc @ ./api.md
  Note over API,DB: API reads directly from domain DB

  CLIENT->>API: GET /service-calls
  API->>DB: listServiceCalls(query)
  DB-->>API: list
  API-->>CLIENT: 200 OK list
```

Inputs/Outputs Recap

- Inputs: HTTP requests (submit, list, detail)
- Outputs: HTTP responses
- Ports: EventBus (publish commands), Persistence (read-only for queries)

Messages

- [SubmitServiceCall]

## Ports Used

- [EventBusPort]: see `../ports.md#eventbusport`
- [PersistencePort]: see `../ports.md#persistence`

[SubmitServiceCall]: ../messages.md#submitservicecall
[EventBusPort]: ../ports.md#eventbusport
[PersistencePort]: ../ports.md#persistenceport-domain-db
