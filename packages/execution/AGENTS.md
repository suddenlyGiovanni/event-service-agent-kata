# Agent Instructions — Execution Module

## Module Purpose

The Execution module handles the **actual HTTP request execution** for service calls. It receives `StartExecution` commands from Orchestration, performs the HTTP request, and publishes success/failure events based on the outcome.

## Key Responsibilities

- Accept `StartExecution` commands from Orchestration
- Execute HTTP requests according to RequestSpec (method, URL, headers, body)
- Handle HTTP client concerns (timeouts, retries, connection pooling)
- Capture response metadata (status, headers, body, timing)
- Publish `ExecutionSucceeded` or `ExecutionFailed` events
- Support request mocking for offline testing

## Architecture Constraints

### ✅ Must Do

- **Event-Driven:** Consume StartExecution commands, publish result events
- **Idempotency:** Safe to retry same execution (use execution tracking)
- **Multi-Tenancy:** All operations scoped by `tenant_id`
- **Timeout Enforcement:** Respect configured request timeout
- **Error Mapping:** Map HTTP errors to domain errors
- **Observability:** Log all requests with correlation ID for tracing

### ❌ Must Not Do

- Never write to Orchestration or Timer tables
- Never call other modules synchronously
- Never expose sensitive data in error messages (strip auth headers from logs)
- Never execute requests without validation
- Never block indefinitely (enforce timeouts)

## Project Structure

```text
packages/execution/
├── src/
│   ├── domain/
│   │   ├── request-spec.domain.ts     # HTTP request specification
│   │   ├── response.domain.ts         # HTTP response model
│   │   └── errors.domain.ts           # Execution errors
│   ├── workflows/
│   │   └── execute.workflow.ts        # Handle StartExecution command
│   ├── ports/
│   │   ├── http-client.port.ts        # HTTP client interface
│   │   └── execution-event-bus.port.ts
│   └── adapters/
│       ├── http-client.adapter.ts     # Real HTTP client
│       └── mock-http-client.adapter.ts # For testing
└── README.md
```

## Key Workflow

### executeWorkflow

```typescript
// Input: StartExecution command
// Actions:
//   1. Validate RequestSpec (URL, method, headers)
//   2. Execute HTTP request via HttpClientPort
//   3. Capture response metadata (status, timing, body)
//   4. Publish ExecutionSucceeded OR ExecutionFailed event
//   5. Include correlation ID for distributed tracing
```

**Implementation pattern:**

```typescript
const executeWorkflow = Effect.fn("Execution.Execute")(
  function* (command: StartExecution) {
    const httpClient = yield* HttpClientPort;
    const eventBus = yield* ExecutionEventBusPort;

    // Execute HTTP request with timeout
    const result = yield* Effect.race(
      httpClient.request(command.requestSpec),
      Effect.sleep("30 seconds").pipe(
        Effect.andThen(Effect.fail(new TimeoutError()))
      )
    );

    // Map to domain event
    const event = Either.match(result, {
      onLeft: (error) => ({
        type: "ExecutionFailed" as const,
        tenantId: command.tenantId,
        serviceCallId: command.serviceCallId,
        correlationId: command.correlationId,
        error: mapErrorToMeta(error),
      }),
      onRight: (response) => ({
        type: "ExecutionSucceeded" as const,
        tenantId: command.tenantId,
        serviceCallId: command.serviceCallId,
        correlationId: command.correlationId,
        response: mapResponseToMeta(response),
      }),
    });

    // Publish result
    yield* eventBus.publish([event]);
  }
);
```

## Request Specification

**RequestSpec Schema:**

```typescript
const RequestSpec = Schema.Struct({
  method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/)),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  body: Schema.optional(Schema.String),
  timeout: Schema.optional(Schema.Number), // milliseconds
});
```

**Validation:**

- URL must be valid HTTP/HTTPS
- Method must be one of allowed HTTP methods
- Headers must be key-value pairs
- Body is optional (required for POST/PUT/PATCH)
- Timeout defaults to 30 seconds

## Response Handling

**Capture metadata:**

```typescript
type ResponseMeta = {
  status: number; // HTTP status code
  statusText: string; // e.g., "OK", "Not Found"
  headers: Record<string, string>; // Response headers
  body: string; // Response body (truncated if large)
  duration: number; // Request duration in ms
};
```

**Body truncation:**

```typescript
// Limit response body to 10KB to avoid memory issues
const truncateBody = (body: string): string =>
  body.length > 10_000 ? body.slice(0, 10_000) + "... (truncated)" : body;
```

## Error Handling

**Domain Errors:**

```typescript
class HttpRequestError extends Schema.TaggedError<HttpRequestError>()(
  "HttpRequestError",
  { message: Schema.String, cause: Schema.Unknown }
) {}

class TimeoutError extends Schema.TaggedError<TimeoutError>()(
  "TimeoutError",
  { timeout: Schema.Number }
) {}

class NetworkError extends Schema.TaggedError<NetworkError>()(
  "NetworkError",
  { message: Schema.String }
) {}
```

**Error mapping:**

```typescript
const mapErrorToMeta = (error: unknown): ErrorMeta => {
  if (error instanceof TimeoutError) {
    return {
      type: "timeout",
      message: `Request timeout after ${error.timeout}ms`,
    };
  }
  if (error instanceof NetworkError) {
    return {
      type: "network",
      message: error.message,
    };
  }
  // Generic error
  return {
    type: "unknown",
    message: "Request failed",
  };
};
```

## Testing Guidelines

### Mock HTTP Client

```typescript
// Use mock adapter for offline testing
const MockHttpClientTest = Layer.effect(
  HttpClientPort,
  Effect.gen(function* () {
    const responses = new Map<string, Response>();

    return HttpClientPort.of({
      request: (spec) =>
        Effect.gen(function* () {
          const mockResponse = responses.get(spec.url);
          if (!mockResponse) {
            return yield* Effect.fail(
              new NetworkError({ message: "Not found" })
            );
          }
          return mockResponse;
        }),
      setMockResponse: (url, response) =>
        Effect.sync(() => responses.set(url, response)),
    });
  })
);
```

### Workflow Tests

```typescript
it.effect("should execute HTTP request and publish success event", () =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClientPort;
    const eventBus = yield* ExecutionEventBusPort;

    // Set up mock response
    yield* httpClient.setMockResponse("https://example.com", {
      status: 200,
      statusText: "OK",
      body: '{"success": true}',
    });

    // Execute workflow
    yield* executeWorkflow({
      type: "StartExecution",
      tenantId,
      serviceCallId,
      correlationId,
      requestSpec: {
        method: "GET",
        url: "https://example.com",
      },
    });

    // Verify event published
    const events = yield* eventBus.getPublishedEvents();
    expect(events).toContainEvent("ExecutionSucceeded");
    expect(events[0].response.status).toBe(200);
  }).pipe(Effect.provide(testLayer))
);
```

### Timeout Tests

```typescript
it.effect("should timeout long-running requests", () =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClientPort;

    // Mock slow response
    yield* httpClient.setMockDelay("https://slow.com", "60 seconds");

    // Execute with 5 second timeout
    const result = yield* executeWorkflow({
      requestSpec: {
        method: "GET",
        url: "https://slow.com",
        timeout: 5000,
      },
    }).pipe(Effect.either);

    // Should fail with timeout
    expect(Either.isLeft(result)).toBe(true);
    expect(result.left).toBeInstanceOf(TimeoutError);
  }).pipe(Effect.provide(testLayer))
);
```

## Multi-Tenancy Checklist

- [ ] `tenantId` in all command/event payloads
- [ ] Include `tenantId` in execution logs
- [ ] Tests verify tenant isolation (separate execution contexts)
- [ ] Never log sensitive tenant data (strip auth headers)

## Security Considerations

**Sensitive Data Handling:**

```typescript
// Strip sensitive headers from logs
const sanitizeHeaders = (headers: Record<string, string>) => {
  const sensitive = ["authorization", "api-key", "x-api-token"];
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) => !sensitive.includes(key.toLowerCase())
    )
  );
};

// Log requests with sanitized headers
yield* Effect.logInfo("Executing HTTP request", {
  url: spec.url,
  method: spec.method,
  headers: sanitizeHeaders(spec.headers),
});
```

**URL Validation:**

```typescript
// Prevent SSRF attacks: disallow private IPs
const isPrivateIP = (url: string): boolean => {
  const hostname = new URL(url).hostname;
  return (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.")
  );
};

// Validate URL before execution
if (isPrivateIP(spec.url)) {
  return yield* Effect.fail(
    new ValidationError({ message: "Private IPs not allowed" })
  );
}
```

## Related Documentation

- **Module Design:** `../../docs/design/modules/execution.md`
- **Messages:** `../../docs/design/messages.md` (StartExecution, ExecutionSucceeded, ExecutionFailed)

## Current Status

**Status:** Not yet implemented

**Prerequisites:**

- [ ] Orchestration module (PL-2) — To send StartExecution commands
- [ ] HTTP client adapter (Effect Platform)
- [ ] Request/response schemas

**Next Steps:**

1. Define RequestSpec and ResponseMeta schemas
2. Create HttpClientPort interface
3. Implement mock HTTP client adapter
4. Create executeWorkflow
5. Add timeout enforcement
6. Add error handling and mapping
7. Implement real HTTP client adapter
8. Integration tests with Orchestration

---

See root-level `AGENTS.md` for project-wide guidelines.
