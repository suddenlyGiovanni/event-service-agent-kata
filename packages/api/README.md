# @event-service-agent/api

**API edge - HTTP API for submitting and querying service calls**

## Purpose

The `api` module provides the **HTTP REST API** that external clients use to interact with the event service agent. It handles HTTP requests, validates input, and publishes commands to the orchestration module via the message broker.

## Responsibilities

### 📨 Submit Service Calls (POST /service-calls)
Accept HTTP requests with:
- Service call name
- Scheduled execution time (`dueAt`)
- HTTP request specification (method, URL, headers, body)
- Optional tags for categorization

Publish `SubmitServiceCall` command to orchestration.

### 📋 Query Service Calls (GET /service-calls)
Return list of service calls with:
- Filtering by status, tags, time range
- Pagination support
- Summary information (not full details)

### 🔍 Get Service Call Details (GET /service-calls/:id)
Return full details of a specific service call:
- Current state
- Request/response metadata
- Execution history
- Timeline of events

## Architecture Role

The API module is an **edge adapter** that translates HTTP to domain commands:

```
HTTP Client
    ↓
┌─────────────────────────────────┐
│  @api (This Package)            │
│  • Parse HTTP requests          │
│  • Validate input               │
│  • Generate IDs                 │
│  • Publish commands             │
└─────────────────────────────────┘
    ↓
EventBusPort.publish(SubmitServiceCall)
    ↓
┌─────────────────────────────────┐
│  @orchestration                 │
│  Handles SubmitServiceCall      │
└─────────────────────────────────┘
```

**Key Characteristics:**
- ✅ No business logic (domain-free zone)
- ✅ Thin translation layer (HTTP ↔ Commands)
- ✅ Stateless (no persistence)
- ✅ Authentication/authorization at edge

## Current Status

**Not Yet Implemented (PL-7)**

This package exists as a placeholder. The API module will be implemented after:
- ✅ Timer module (PL-4) - Complete
- ✅ Schema migration (PL-14) - Complete
- [ ] Orchestration module (PL-2) - Pending
- [ ] Broker adapter (PL-3) - Pending

## Dependencies

- **@event-service-agent/platform**: Commands, EventBusPort, types
- **@event-service-agent/schemas**: UUID7 service, validated types
- **@effect/platform**: HTTP server abstractions
- **effect**: Effect runtime

## Planned Structure

```
packages/api/
├── src/
│   ├── routes/
│   │   ├── submit.route.ts        # POST /service-calls
│   │   ├── list.route.ts          # GET /service-calls
│   │   └── detail.route.ts        # GET /service-calls/:id
│   ├── validation/
│   │   └── request.validation.ts  # Effect Schema validators
│   ├── middleware/
│   │   ├── auth.middleware.ts     # Authentication
│   │   └── tenant.middleware.ts   # Multi-tenancy
│   └── server.ts                  # HTTP server setup
└── README.md
```

## API Design (Planned)

### Submit Service Call
```http
POST /service-calls
Content-Type: application/json
X-Tenant-ID: 01234567-89ab-7def-0123-456789abcdef

{
  "name": "Check API Health",
  "dueAt": "2025-12-25T10:00:00Z",
  "requestSpec": {
    "method": "GET",
    "url": "https://api.example.com/health",
    "headers": { "User-Agent": "EventServiceAgent/1.0" }
  },
  "tags": ["health-check", "production"]
}
```

**Response (201 Created):**
```json
{
  "serviceCallId": "01234567-89ab-7def-0123-456789abcdef",
  "status": "submitted",
  "submittedAt": "2025-10-28T10:42:00Z"
}
```

### List Service Calls
```http
GET /service-calls?status=scheduled&limit=50&offset=0
X-Tenant-ID: 01234567-89ab-7def-0123-456789abcdef
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "serviceCallId": "...",
      "name": "Check API Health",
      "status": "scheduled",
      "dueAt": "2025-12-25T10:00:00Z",
      "submittedAt": "2025-10-28T10:42:00Z"
    }
  ],
  "total": 127,
  "limit": 50,
  "offset": 0
}
```

### Get Service Call Details
```http
GET /service-calls/01234567-89ab-7def-0123-456789abcdef
X-Tenant-ID: 01234567-89ab-7def-0123-456789abcdef
```

**Response (200 OK):**
```json
{
  "serviceCallId": "...",
  "name": "Check API Health",
  "status": "succeeded",
  "requestSpec": { "method": "GET", "url": "..." },
  "responseMeta": {
    "status": 200,
    "latencyMs": 142,
    "bodySnippet": "{\"status\":\"ok\"}"
  },
  "timeline": [
    { "event": "submitted", "timestamp": "2025-10-28T10:42:00Z" },
    { "event": "scheduled", "timestamp": "2025-10-28T10:42:01Z" },
    { "event": "running", "timestamp": "2025-12-25T10:00:00Z" },
    { "event": "succeeded", "timestamp": "2025-12-25T10:00:01Z" }
  ]
}
```

## Security Considerations

### Multi-Tenancy
Every request must include `X-Tenant-ID` header:
- Validated against tenant registry
- Used for data isolation in queries
- Included in all published commands

### Authentication
To be determined (options):
- API keys (simple, good for MVP)
- JWT tokens (OAuth 2.0)
- mTLS (for service-to-service)

### Rate Limiting
Protect against abuse:
- Per-tenant rate limits
- Adaptive throttling under load

## Related Documentation

- [API Module Design](../../docs/design/modules/api.md)
- [ADR-0007: API Design](../../docs/decisions/ADR-0007-api.md)
- [Messages Design](../../docs/design/messages.md)
- [User Story](../../docs/design/user-story.jpeg)

## Future Work (PL-7)

1. HTTP server setup with `@effect/platform`
2. Route handlers for submit/list/detail
3. Input validation with Effect Schema
4. Command publishing via EventBusPort
5. Integration tests with test broker
6. OpenAPI/Swagger documentation
