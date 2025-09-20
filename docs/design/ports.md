# Ports

Minimal domain-facing ports to keep the system simple and broker/storage agnostic. Adapters implement these interfaces.

## Shared Types

```ts
export type TenantId = string & { readonly __tag: "TenantId" };
export type CorrelationId = string & { readonly __tag: "CorrelationId" };
export type EnvelopeId = string & { readonly __tag: "EnvelopeId" };

export interface RequestContext {
  tenantId: TenantId;
  correlationId: CorrelationId;
}
```

## MessageEnvelope

Minimal envelope shared by publishers/consumers. See [message semantics](./messages.md#semantics).

```ts
export interface MessageEnvelope<T = unknown> {
  id: EnvelopeId; // unique id
  type: string; // message type
  tenantId: TenantId;
  aggregateId?: string; // ordering key (e.g., serviceCallId)
  timestampMs: number; // producer timestamp
  correlationId?: CorrelationId;
  causationId?: string;
  payload: T;
}
```

## Storage Roles

- PersistencePort (domain DB): CRUD and conditional updates for domain state; only Orchestration writes.
- OutboxPublisher: append messages in the same transaction as DB writes; background dispatcher publishes to broker.

## ClockPort

Adapter responsibilities: Provide stable UTC milliseconds; no blocking; test fake allowed.  
Used in: [Orchestration] (timeouts), [Timer] (scheduling).

```ts
export interface ClockPort {
  nowMs(): number; // Epoch millis (UTC)
}
```

## EventBusPort

Adapter responsibilities: Publish to broker; consume from topics/partitions; preserve per-aggregate order via partition key.  
Used in: [Orchestration], [Execution], [Timer], [API] (publish only).

```ts
export interface EventBusPort {
  publish(envelopes: MessageEnvelope[], ctx: RequestContext): Promise<void>;
  subscribe(
    topics: string[],
    handler: (env: MessageEnvelope) => Promise<void>
  ): Promise<void>;
}
```

## TimerPort

Adapter responsibilities: Schedule/cancel one-shot timers with at-least-once delivery semantics.  
Used in: [Orchestration].

```ts
export interface TimerSpec {
  id: string; // idempotent key
  dueTimeMs: number; // epoch millis when due
  tenantId: TenantId;
}

export interface TimerPort {
  schedule(spec: TimerSpec, ctx: RequestContext): Promise<void>;
  cancel(id: string, tenantId: TenantId, ctx: RequestContext): Promise<void>;
}
```

## HttpClientPort

Adapter responsibilities: Perform HTTP call and return status/headers/body without extra concerns.  
Used in: [Execution].

```ts
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body?: T;
}

export interface HttpClientPort {
  request<T = unknown>(
    req: HttpRequest,
    ctx: RequestContext
  ): Promise<HttpResponse<T>>;
}
```

## PersistencePort (Domain DB)

Role: domain CRUD with conditional transitions; Orchestration is the only writer.  
Used in: [Orchestration] (write), [API] (read-only).

```ts
export interface PersistencePort {
  // Read models for API
  getServiceCall(
    tenantId: string,
    serviceCallId: string,
    ctx: RequestContext
  ): Promise<unknown | null>;
  listServiceCalls(
    tenantId: string,
    filters: Record<string, unknown>,
    paging: { limit: number; offset: number },
    ctx: RequestContext
  ): Promise<unknown[]>;

  // Single-writer transitions (guarded updates)
  createServiceCall(dto: unknown, ctx: RequestContext): Promise<void>;
  setRunning(
    tenantId: string,
    serviceCallId: string,
    startedAtMs: number,
    ctx: RequestContext
  ): Promise<boolean>; // returns true if updated from Scheduled
  setSucceeded(
    tenantId: string,
    serviceCallId: string,
    finishedAtMs: number,
    responseMeta: unknown,
    ctx: RequestContext
  ): Promise<boolean>;
  setFailed(
    tenantId: string,
    serviceCallId: string,
    finishedAtMs: number,
    errorMeta: unknown,
    ctx: RequestContext
  ): Promise<boolean>;
}
```

## OutboxPublisher

Role: ensure messages are published after DB commit. Orchestration appends messages to an outbox table within the same transaction; a dispatcher publishes them to the broker in order.  
Used in: [Orchestration].

```ts
export interface OutboxPublisher {
  append(envelopes: MessageEnvelope[], ctx: RequestContext): Promise<void>; // called within DB tx
  dispatch(batchSize?: number): Promise<void>; // background loop
}
```

Notes

- Message types should align with `design/messages.md`.
- Add retries/observability later only if needed by concrete adapters.

[Orchestration]: ./contexts/orchestration.md
[Timer]: ./contexts/timer.md
[Execution]: ./contexts/execution.md
[API]: ./contexts/api.md
