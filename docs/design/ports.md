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

## EventEnvelope (essentials)

Minimal event envelope shared by publishers/consumers. See message semantics: `./messages.md#semantics-essentials`.

```ts
export interface EventEnvelope<T = unknown> {
  id: EnvelopeId; // unique id
  type: string; // event type
  tenantId: TenantId;
  aggregateId?: string; // optional ordering key
  timestampMs: number; // producer timestamp
  payload: T;
}
```

## Storage Roles

- EventStorePort (command-side events): append/load events per aggregate. ES-first MVP default.
- ReadStore (read-side projections): query store built from events; used by Reporting/API.
- Repository<T> (optional): aggregate snapshots with optimistic concurrency; add later if needed for performance.

Choosing a mode:

- ES-first MVP: EventStorePort + ReadStore. `EventBusPort` may be a thin façade over the same log; `Repository` optional.
- Non-ES: Repository + EventBus + ReadStore. EventStorePort not used.

## ClockPort

Adapter responsibilities: Provide stable UTC milliseconds; no blocking; test fake allowed.  
Used in: [Orchestration] (timeouts), [Timer] (scheduling).

```ts
export interface ClockPort {
  nowMs(): number; // Epoch millis (UTC)
}
```

## EventBusPort

Adapter responsibilities: Publish to broker; preserve per-aggregate order when `aggregateId` is set. In ES-first MVP, this can be implemented on top of `EventStorePort` subscriptions/writes.  
Used in: [Orchestration], [Execution], [Timer].

```ts
export interface EventBusPort {
  publish(envelopes: EventEnvelope[], ctx: RequestContext): Promise<void>;
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

## Repository<T>

Role: optional aggregate snapshots (command-side); in ES-first, use only if rebuild cost is high.
Used in: [Orchestration], [Execution] (optional).

```ts
export interface Versioned<T> {
  state: T;
  version: number;
}

export interface Repository<TAggregate, TId = string> {
  load(id: TId, ctx: RequestContext): Promise<Versioned<TAggregate> | null>;
  save(
    id: TId,
    snapshot: TAggregate,
    expectedVersion: number,
    ctx: RequestContext
  ): Promise<number>; // returns newVersion
}
```

## ReadStore

Role: read-side projection store for queries; independent of Repository choice.  
Used in: [Reporting], [API].

```ts
export interface ReadStore {
  upsert(
    docType: string,
    id: string,
    document: unknown,
    ctx: RequestContext
  ): Promise<void>;
  getById<T = unknown>(
    docType: string,
    id: string,
    ctx: RequestContext
  ): Promise<T | null>;
}
```

## EventStorePort

Minimal event store interface for ES/CQRS posture. Uses the shared `EventEnvelope` shape.

Role: command-side event log; default source of truth in ES-first MVP.

Adapter responsibilities: atomically append with optimistic concurrency; `load` returns ordered events.

```ts
export interface EventStream {
  events: EventEnvelope[];
  version: number; // last aggregate version
}

export interface EventStorePort {
  append(
    aggregateType: string,
    aggregateId: string,
    events: EventEnvelope[],
    expectedVersion: number,
    ctx: RequestContext
  ): Promise<number>; // returns newVersion

  load(
    aggregateType: string,
    aggregateId: string,
    ctx: RequestContext
  ): Promise<EventStream>; // empty if not found
}
```

Notes

- Message types should align with `design/ddd/messages.md`.
- Add options/retries/observability later only if needed by concrete adapters.

[Orchestration]: ./contexts/orchestration.md
[Timer]: ./contexts/timer.md
[Execution]: ./contexts/execution.md
[Reporting]: ./contexts/reporting.md
[API]: ./contexts/api.md
