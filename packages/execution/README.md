# @event-service-agent/execution

**Execution worker - HTTP request execution handler**

## Purpose

The `execution` module is responsible for **executing HTTP requests** on behalf of service calls. It listens for `StartExecution` commands from orchestration, performs the HTTP call, and publishes success/failure events back.

## Responsibilities

### 🚀 Execute HTTP Requests

1. Receive `StartExecution` command (contains RequestSpec without body)
2. Fetch full request body from storage (using serviceCallId)
3. Execute HTTP request via HttpClientPort
4. Capture response metadata (status, headers, latency, body snippet)
5. Publish `ExecutionSucceeded` or `ExecutionFailed` event

### 🔄 Error Handling

Classify and report errors:

- **Network errors**: Connection failures, timeouts
- **HTTP errors**: 4xx/5xx status codes
- **Validation errors**: Invalid response format
- Sanitize error details (no secrets in events)

## Architecture Role

The Execution module is a **domain module** that orchestrates external HTTP calls:

```txt
┌─────────────────────────────────┐
│  Orchestration                  │
│  Publishes: StartExecution      │
└─────────────────────────────────┘
          ↓ (EventBus)
┌─────────────────────────────────┐
│  @execution (This Package)      │
│  • Fetch request body           │
│  • Execute HTTP call            │
│  • Capture metadata             │
│  • Publish result event         │
└─────────────────────────────────┘
          ↓ (EventBus)
┌─────────────────────────────────┐
│  Orchestration                  │
│  Handles: ExecutionSucceeded    │
│           ExecutionFailed       │
└─────────────────────────────────┘
```

**Key Characteristics:**

- ✅ Consumes commands, produces events
- ✅ Stateless (no persistence)
- ✅ Idempotent via deduplication in orchestration
- ✅ Isolated from other modules

## Current Status

**Not Yet Implemented (PL-5)**

This package exists as a placeholder. The Execution module will be implemented after:

- ✅ Timer module (PL-4) - Complete
- ✅ Schema migration (PL-14) - Complete
- [ ] Orchestration module (PL-2) - Pending
- [ ] Broker adapter (PL-3) - Pending

## Dependencies

- **@event-service-agent/platform**: Commands, events, ports
- **@event-service-agent/schemas**: Validated types
- **@effect/platform**: HTTP client abstractions
- **effect**: Effect runtime

## Planned Structure

```txt
packages/execution/
├── src/
│   ├── domain/
│   │   └── errors.domain.ts       # Domain error types
│   ├── workflows/
│   │   └── execute-request.workflow.ts # Main workflow
│   ├── ports/
│   │   ├── http-client.port.ts    # HTTP execution interface
│   │   └── body-storage.port.ts   # Request body retrieval
│   └── adapters/
│       ├── http-client.adapter.ts # Bun fetch wrapper
│       └── body-storage.adapter.ts # SQLite storage
└── README.md
```

## Workflow Design (Planned)

### executeRequestWorkflow

```typescript ignore
const executeRequestWorkflow = Effect.fn('Execution.ExecuteRequest')(function* (
	command: StartExecution
) {
	// 1. Fetch full request body from storage
	const requestSpec = yield* bodyStorage.getRequestBody(
		command.tenantId,
		command.serviceCallId
	)

	// 2. Execute HTTP request
	const result = yield* httpClient.execute(requestSpec).pipe(
		Effect.either // Catch errors
	)

	// 3. Publish result event
	yield* Either.match(result, {
		onLeft: (error) =>
			eventBus.publish([
				{
					type: 'ExecutionFailed',
					errorMeta: classifyError(error)
				}
			]),
		onRight: (response) =>
			eventBus.publish([
				{
					type: 'ExecutionSucceeded',
					responseMeta: captureMetadata(response)
				}
			])
	})
})
```

## Ports Required

### HttpClientPort

```typescript ignore
interface HttpClientPort {
	// Execute HTTP request with timeout/retry
	execute: (spec: RequestSpec) => Effect.Effect<Response, HttpError>
}
```

### BodyStoragePort

```typescript ignore
interface BodyStoragePort {
	// Retrieve full request body by serviceCallId
	getRequestBody: (
		tenantId: TenantId,
		serviceCallId: ServiceCallId
	) => Effect.Effect<RequestSpec, StorageError>
}
```

## Error Classification

Errors are classified for metrics and retry decisions:

```typescript ignore
type ErrorKind =
	| 'NetworkError' // Connection failed, DNS lookup failed
	| 'TimeoutError' // Request exceeded timeout
	| 'HttpError' // Got response but 4xx/5xx status
	| 'ValidationError' // Response failed validation
	| 'UnknownError' // Unexpected error
```

Each error includes:

- `kind`: Error classification
- `message`: Sanitized user-facing message
- `details`: Additional context (no secrets)
- `latencyMs`: Time until failure

## Response Metadata

Success responses capture:

```typescript ignore
interface ResponseMeta {
	status: number // HTTP status code (2xx)
	headers?: Record // Selected headers (filtered)
	bodySnippet?: string // First 1KB of body (sanitized)
	latencyMs?: number // Request duration
}
```

**Privacy considerations:**

- `bodySnippet` is truncated and may be redacted
- Sensitive headers excluded (Authorization, etc.)
- Full response body stored separately if needed

## Testing Strategy

### Unit Tests

- Error classification logic
- Metadata capture (sanitization)
- Workflow orchestration

### Integration Tests

- Real HTTP calls to test server
- Timeout handling
- Error scenarios (network down, 500 errors)

### Contract Tests

- Verify published events match schema
- Ensure EventBusPort usage correct

## Related Documentation

- [Execution Module Design](../../docs/design/modules/execution.md)
- [Messages Design](../../docs/design/messages.md)
- [Ports Design](../../docs/design/ports.md)
- [ADR-0001: Topology](../../docs/decisions/ADR-0001-topology.md)

## Future Work (PL-5)

1. Define HttpClientPort and BodyStoragePort
2. Implement executeRequestWorkflow
3. Error classification and mapping
4. Mock HTTP adapter for testing
5. Integration tests with test broker
6. Observability (spans, metrics)

## Security Notes

- Request bodies may contain secrets (API keys, tokens)
- Store bodies encrypted at rest
- Sanitize logs/events (no body content)
- Limit bodySnippet to non-sensitive data
