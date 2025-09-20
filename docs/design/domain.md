# Domain (Problem Space)

Purpose

- Contract the discovery into problem-space essentials: constraints, core concepts, and high-level workflows, independent of implementation or solution structures.

Constraints (MVP)

- Single attempt per Service Call; no retries/cancellations.
- HTTP is the only supported protocol.
- Due time semantics: execute at/after `dueAt`; if `dueAt <= now`, eligible immediately.
- Multi-tenancy: every action is tenant-scoped; all queries filter by `tenantId`.
- Minimal persistence of bodies/headers (size-limited snippets; redaction allowed).
- Event-driven messaging with at-least-once delivery tolerance.
- DB is the source of truth; Orchestration is the only writer of domain state.

Core Concepts (Ubiquitous Language)

- **Tenant**: logical owner of Service Calls.
- **Service Call**: intention to invoke an external service with a request spec and a due time.
- **Due Time** (`dueAt`): earliest instant at which execution may start.
- **Execution**: the single attempt to perform the Service Call.
- **Outcome/Status**: Scheduled | Running | Succeeded | Failed.
- **Tag**: label(s) associated at submission for later filtering.

Glossary (Problem-Space)

- Intention: the user’s desire to have a call executed.
- Eligibility: the condition that time has reached or passed `dueAt`.
- Attempt: one try to turn intention into an outcome.
- Outcome: the terminal result of an attempt (Succeeded/Failed).

> [!NOTE] **Tenancy**
>
> - **Scope**:
>   All operations are tenant-scoped.
>   Every command, event, and query includes `tenantId`.
>   Cross-tenant access is not permitted.
> - **Identity**:
>   The primary business identity is `(tenantId, serviceCallId)`.
>   Idempotency keys are per-tenant.
> - **Isolation**:
>   Read models and stores are logically partitioned by `tenantId`
>   Physical isolation (DB per tenant) is not required for MVP but must remain feasible.
> - **Storage/indexing**:
>   All primary indexes include `tenantId` first;
>   common secondary indexes: `(tenantId, status)`, `(tenantId, dueAt)`, `(tenantId, tags)`.
>   API queries the domain tables directly; no projections are maintained for MVP.
> - **Messaging**:
>   Topics/queues are either shared with `tenantId` in message envelopes or logically partitioned per tenant.
>   Consumers must filter by `tenantId`.
> - **API/auth**:
>   Authentication/authorization is out-of-scope for MVP;
>   however, all API routes embed `:tenantId` and handlers enforce scoping and idempotency within the tenant.
> - **Timers**:
>   Registrations carry `(tenantId, serviceCallId, dueAt)`.
>   Timer emissions include `tenantId` to preserve scoping on wakeup.
> - **Observability**:
>   Logs/metrics/traces annotate `tenantId` for correlation;

High-Level Workflows

- **Submission**
  - A tenant submits a Service Call with `name`, `requestSpec`, `dueAt`, and optional `tags`.
  - Orchestration validates, persists `Scheduled` state in the domain DB, and emits domain events after commit.
- **Scheduling**
  - Orchestration ensures a timer exists for `dueAt` (or starts immediately when `dueAt <= now`).
- **Becoming Due**
  - At/after `dueAt`, the Service Call becomes eligible to start; Timer emits a due signal; Orchestration decides to start.
- **Execution**
  - Exactly one attempt is performed, producing either success (response metadata) or failure (error metadata). Orchestration is the single writer for `Running` and terminal states.
- **Observation**
  - The tenant can list and filter calls by status, tags, and date; API serves queries directly from the domain DB with proper indexes.

Business State Diagram (Problem-Space)

```mermaid
stateDiagram-v2
  [*] --> Scheduled: Submission recorded
  Scheduled --> Running: Becomes due and starts
  Running --> Succeeded: Attempt outcome (success)
  Running --> Failed: Attempt outcome (failure)
  Succeeded --> [*]
  Failed --> [*]
```

Quality Attributes

- Correctness: one attempt; legal transitions only; Orchestration is the only writer.
- Observability: state transitions produce domain events published after DB commit (via outbox); correlation IDs propagate across messages.
- Evolvability: protocol-agnostic value objects; IO behind ports; broker-first without ES/CQRS.

Out-of-Scope (MVP)

- Retries/backoff, cancellation, editing requests, CRON-like schedules, authentication/egress policy.

Implementation Notes (Non-normative)

- Idempotency: API computes `serviceCallId` deterministically from `(tenantId, idempotencyKey)`; Orchestration enforces uniqueness on `(tenantId, serviceCallId)`.
- Due-time guard: Orchestration checks `dueAt <= now` when starting; Timer may deliver duplicates; transitions are conditional (e.g., only `Scheduled → Running`).
- Privacy: bodies/headers are redacted/truncated before persistence and when included in events.
