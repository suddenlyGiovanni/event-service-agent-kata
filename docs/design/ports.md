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

Minimal envelope shared by publishers/consumers. See [Semantics](./messages.md#semantics-essentials).

**Note**: MessageEnvelope exists as both:

- **TypeScript interface** (type-level documentation, below)
- **Effect Schema** (`MessageEnvelope` in `@event-service-agent/schemas`) for runtime validation

The schema provides JSON serialization (`parseJson`/`encodeJson`) and validation at infrastructure boundaries.

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

**Design Note**: The envelope is self-contained with all routing metadata (tenantId, correlationId, aggregateId). No separate context parameter needed - this eliminates duplication and ensures single source of truth.

```ts
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

export interface EventBusPort {
  publish(
    envelopes: NonEmptyReadonlyArray<MessageEnvelope>
  ): Effect.Effect<void, PublishError>;

  subscribe<E>(
    topics: string[],
    handler: (env: MessageEnvelope) => Effect.Effect<void, E>
  ): Effect.Effect<void, SubscribeError>;
}

export class PublishError extends Data.TaggedError("PublishError")<{
  readonly cause: string;
}> {}

export class SubscribeError extends Data.TaggedError("SubscribeError")<{
  readonly cause: string;
}> {}
```

**Routing**: Adapter extracts `tenantId` and optional `aggregateId` from envelope to construct partition/routing key (e.g., `tenantId.serviceCallId`).

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

Note: `responseMeta` and `errorMeta` follow the payload shapes defined in the messages catalog — see [ExecutionSucceeded] (responseMeta) and [ExecutionFailed] (errorMeta) in `design/messages.md`.

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

## TimerEventBusPort

Role: Domain-specific event publishing/subscribing for Timer module. Accepts/returns pure domain events (`DueTimeReached`), adapter handles envelope wrapping and broker delegation.  
Used in: [Timer] (workflows publish events, handlers consume commands).

**Design Pattern**: Port accepts **pure domain events**, not infrastructure DTOs. Adapter wraps events in `MessageEnvelope` and delegates to shared `EventBusPort`. See [Hexagonal Architecture: Event Publishing Pattern](./hexagonal-architecture-layers.md#event-publishing-pattern-domain-events-at-port-boundary) for rationale.

```ts
import type * as Effect from "effect/Effect";
import type * as Messages from "@event-service-agent/schemas/messages";

export interface TimerEventBusPort {
  /**
   * Publish DueTimeReached domain event with MessageMetadata Context
   *
   * Workflow provides MessageMetadata via Effect.provideService:
   *   - correlationId: From timer aggregate (original ScheduleTimer command)
   *   - causationId: Option.none() (time-triggered, not command-caused)
   *
   * Adapter responsibility:
   *   - Extract MessageMetadata from Context: `yield* MessageMetadata`
   *   - Generate EnvelopeId (UUID v7)
   *   - Wrap event in MessageEnvelope with metadata fields
   *   - Delegate to EventBusPort.publish([envelope])
   *
   * @param event - Pure domain event (DueTimeReached.Type)
   * @returns Effect requiring MessageMetadata Context
   */
  publishDueTimeReached(
    event: Messages.Timer.Events.DueTimeReached.Type
  ): Effect.Effect<void, PublishError, MessageMetadata>;

  /**
   * Subscribe to ScheduleTimer commands from Orchestration
   *
   * Asymmetric pattern: Adapter passes MessageMetadata as handler parameter
   * (not via Context). This aligns with Effect ecosystem conventions:
   *   - Publishing: Workflow provides Context (ambient data)
   *   - Subscribing: Adapter passes parameter (explicit data flow)
   *
   * Adapter responsibility:
   *   - Subscribe to timer.commands topic
   *   - Parse MessageEnvelope<ScheduleTimer>
   *   - Extract MessageMetadata from envelope:
   *       correlationId: envelope.correlationId
   *       causationId: Option.some(envelope.id)  // Command envelope becomes causation
   *   - Invoke handler with command + metadata
   *
   * @param handler - Command handler (workflow invocation)
   */
  subscribeToScheduleTimerCommands<E, R>(
    handler: (
      cmd: Messages.Orchestration.Commands.ScheduleTimer.Type,
      metadata: MessageMetadata.Type
    ) => Effect.Effect<void, E, R>
  ): Effect.Effect<void, SubscribeError | E, R>;
}
```

**MessageMetadata Context Pattern** (ADR-0013):

- **Publishing**: Port requires `MessageMetadata` in R parameter. Workflow provides via `Effect.provideService(MessageMetadata, { correlationId, causationId })`. Adapter extracts `yield* MessageMetadata`.
- **Subscribing**: Adapter passes `MessageMetadata` as handler parameter (not via Context). This asymmetry aligns with Effect ecosystem: Context for ambient cross-cutting concerns, parameters for explicit data flow.

- **Rationale**: Keeps domain events pure (no infrastructure fields). Enables correlation tracking without polluting domain types. Type-safe: compiler enforces metadata provisioning.

Notes

- Message types should align with `design/messages.md`.
- Add retries/observability later only if needed by concrete adapters.

[Orchestration]: ./modules/orchestration.md
[Timer]: ./modules/timer.md
[Execution]: ./modules/execution.md
[API]: ./modules/api.md
[ExecutionSucceeded]: ./messages.md#executionsucceeded
[ExecutionFailed]: ./messages.md#executionfailed
