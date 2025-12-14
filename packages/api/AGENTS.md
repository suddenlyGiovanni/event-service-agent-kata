# Agent Instructions — API Module

## Module Purpose

The API module provides the **HTTP REST interface** for end users to interact with the event service agent. It accepts service call submissions and provides query endpoints for tracking execution status.

## Key Responsibilities

- Expose HTTP endpoints for service call management
- Validate incoming requests (schema, auth, tenant isolation)
- Translate HTTP requests to domain commands
- Forward commands to Orchestration module via EventBus
- Query read models for service call status (future: CQRS read side)
- Handle HTTP-specific concerns (CORS, auth, rate limiting)

## Architecture Constraints

### ✅ Must Do

- **Stateless:** No in-memory state; all data persisted via Orchestration
- **Command-Only:** POST endpoints send commands to Orchestration (no direct DB writes)
- **Query via Events:** Read models built from events (CQRS pattern)
- **Multi-Tenancy:** Extract `tenantId` from auth context, enforce in all operations
- **Validation:** Validate all inputs with Effect Schema before sending commands
- **Error Mapping:** Map domain errors to appropriate HTTP status codes

### ❌ Must Not Do

- Never write to any database tables (only Orchestration writes)
- Never call Timer or Execution modules directly
- Never expose internal error details to clients
- Never allow cross-tenant queries
- Never skip input validation

## Project Structure

```text
packages/api/
├── src/
│   ├── routes/           # HTTP route handlers
│   │   ├── submit.route.ts
│   │   ├── status.route.ts
│   │   └── list.route.ts
│   ├── middleware/       # Auth, validation, logging
│   ├── schemas/          # HTTP request/response schemas
│   └── adapters/         # HTTP server adapter
└── README.md
```

## HTTP Endpoints

API endpoint specifications are maintained in design documentation:

- **Endpoint definitions:** See `../../docs/design/modules/api.md` for complete API spec
- **Key patterns:** POST for commands, GET for queries, tenant-scoped access
- **Validation:** Effect Schema validation before command dispatch

## Testing Guidelines

### Route Tests

```typescript ignore
it.effect("should submit service call", () =>
  Effect.gen(function* () {
    const app = yield* ApiApp;
    const eventBus = yield* EventBusPort;

    // Send HTTP request
    const response = yield* app.fetch({
      method: "POST",
      url: "/api/v1/service-calls",
      headers: { Authorization: "Bearer tenant-token" },
      body: JSON.stringify({
        name: "Test Call",
        request: { method: "GET", url: "https://example.com" },
      }),
    });

    // Verify HTTP response
    expect(response.status).toBe(201);
    const json = yield* response.json();
    expect(json.serviceCallId).toBeDefined();

    // Verify command published
    const events = yield* eventBus.getPublishedEvents();
    expect(events).toContainCommand("SubmitServiceCall");
  }).pipe(Effect.provide(testLayer))
);
```

### Tenant Isolation Tests

```typescript ignore
it.effect("should not allow cross-tenant queries", () =>
  Effect.gen(function* () {
    const app = yield* ApiApp;

    // Submit for tenant A
    yield* submitServiceCall({ tenantId: tenantA });

    // Query as tenant B
    const response = yield* app.fetch({
      url: `/api/v1/service-calls/${serviceCallId}`,
      headers: { Authorization: "Bearer tenant-b-token" },
    });

    // Should return 404 (not 403, to avoid information disclosure)
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer))
);
```

## Error Mapping

Map domain errors to HTTP status codes:

```typescript ignore
const mapErrorToHttpStatus = (error: unknown): number => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof ConflictError) return 409;
  return 500; // Internal server error
};
```

**Never expose internal error details:**

```typescript ignore
// ❌ Bad: Exposes stack traces
return Response.json({ error: error.stack }, { status: 500 });

// ✅ Good: Generic message, log full error
yield* Effect.logError(error);
return Response.json({ error: "Internal server error" }, { status: 500 });
```

## Multi-Tenancy Checklist

- [ ] Extract `tenantId` from auth token/header
- [ ] Include `tenantId` in all commands sent to Orchestration
- [ ] Verify `tenantId` matches authenticated user
- [ ] Filter all queries by `tenantId`
- [ ] Return 404 (not 403) for unauthorized access to prevent information disclosure
- [ ] Tests verify cross-tenant isolation

## Authentication & Authorization

**Planned approach:**

- Extract `tenantId` from JWT token or API key
- Validate token signature and expiration
- Inject `tenantId` into request context
- Use `tenantId` for all downstream operations

**Effect pattern:**

```typescript ignore
class TenantContext extends Context.Tag("TenantContext")<
  TenantContext,
  { readonly tenantId: TenantId }
>() {}

const extractTenant = (request: Request): Effect.Effect<TenantId, UnauthorizedError> =>
  Effect.gen(function* () {
    const token = request.headers.get("Authorization");
    if (!token) return yield* Effect.fail(new UnauthorizedError());

    const decoded = yield* verifyToken(token);
    return decoded.tenantId;
  });
```

## Related Documentation

- **Module Design:** `../../docs/design/modules/api.md`
- **Domain Model:** `../../docs/design/domain.md`
- **Messages:** `../../docs/design/messages.md` (SubmitServiceCall command)

## Current Status

**Status:** Not yet implemented

**Prerequisites:**

- [ ] Orchestration module (PL-2)
- [ ] HTTP server adapter (Effect Platform)
- [ ] Auth middleware

**Next Steps:**

1. Define HTTP schemas for requests/responses
2. Implement POST /service-calls route
3. Implement GET /service-calls/:id route
4. Implement GET /service-calls (list) route
5. Add auth middleware
6. Add validation middleware
7. Integration tests with Orchestration

---

See root-level `AGENTS.md` for project-wide guidelines.
