# ADR-0003: Timer Strategy

Status: Accepted

## Problem

The Service Agent domain requires scheduled execution of service calls: a user submits a service call with a `dueAt` timestamp, and the system must initiate execution at or shortly after that time.

**Core Requirements:**

1. **Schedule registration**: Accept `(tenantId, serviceCallId, dueTimeMs)` and persist durably
2. **Due detection**: Identify when `dueTimeMs <= now` and emit signal to trigger execution
3. **Durability**: Survive process crashes/restarts without losing scheduled timers
4. **At-least-once delivery**: Emit due signal at least once; duplicates acceptable (Orchestration guards)
5. **Idempotency**: Multiple schedule requests for same `(tenantId, serviceCallId)` don't create duplicates

**Domain Constraints:**

- Single-shot timers (no recurring/CRON)
- No cancellation/rescheduling after execution starts
- Multi-tenant aware: all timers scoped by `tenantId`
- Accuracy: "best effort after due" — seconds-level delays acceptable
- Integration: consume `[ScheduleTimer]` commands, publish `[DueTimeReached]` events via broker

**Key Question:** How do we implement durable, at-least-once, single-shot timers that remain broker-agnostic (per ADR-0002)?

---

## Context

### Timer Module Responsibility

Timer is an **Infrastructure supporting module** that tracks future due times and emits `[DueTimeReached]` events when time arrives. It must remain broker-agnostic and stateless with respect to domain logic.

**Timer Lifecycle (per serviceCallId):**

```mermaid
stateDiagram-v2
    [*] --> Pending: ScheduleTimer(tenantId, serviceCallId, dueAt)
    Pending --> Firing: time passes (now >= dueAt)
    Firing --> [*]: emit DueTimeReached(tenantId, serviceCallId)
```

**Message Contract:**

- **Input**: `ScheduleTimer` command → `{ tenantId, serviceCallId, dueAt: ISO8601 }`
- **Output**: `DueTimeReached` event → `{ tenantId, serviceCallId, reachedAt?: ISO8601 }`
- **Storage Key**: `(tenantId, serviceCallId)` ensures idempotency

### Broker Landscape

[ADR-0002: Broker Selection][ADR-0002] evaluated broker options and concluded **all brokers require external Timer service**. NATS JetStream chosen for MVP, but Timer must remain **broker-agnostic** for architectural flexibility.

### MVP Constraints

- **Single instance** (no distributed coordination)
- **Tenant count**: dozens to low hundreds
- **Time horizon**: minutes to hours (not days/weeks)
- **Accuracy**: seconds-level granularity acceptable

**Out of Scope:**

- Distributed coordination (defer to scale phase)
- CRON/recurring schedules
- Timer cancellation
- Sub-second precision

---

## Approach: First Principles Analysis

### How do we detect when `now >= dueAt`?

**Option 1: External Notification (Push)**

- Examples: `pg_cron`, OS schedulers, cloud scheduler services
- **Problem**: Couples to specific infrastructure (PostgreSQL extensions, cloud providers)
- **Verdict**: ❌ Violates broker-agnostic and portability requirements

**Option 2: Self-Checking (Poll)**

- Worker loop queries storage periodically: `WHERE dueAt <= now`
- **Benefits**: Portable, simple, no external dependencies, meets "seconds acceptable" requirement
- **Verdict**: ✅ Only viable path for our constraints

### Can we optimize with in-memory scheduling?

**Idea**: Load schedules into memory, use `setTimeout`-like timers for exact wake-ups.

**Analysis:**

- **Benefit**: More efficient (wake only when needed)
- **Cost**: Complexity—reload on startup, subscribe to new schedules, crash edge cases
- **MVP Reality**: Polling every 5s is simple and meets requirements
- **Verdict**: ❌ Premature optimization

### Conclusion

**Converged Design:**

```
1. Subscribe to ScheduleTimer commands from broker
2. On command: Persist to storage (upsert by tenantId, serviceCallId)
3. Worker loop (every 5s):
   - Query: SELECT WHERE dueAt <= now AND state = 'Scheduled'
   - For each: Publish DueTimeReached, update state = 'Reached'
4. On restart: Resume worker loop (durable in DB)
```

**Requirements satisfied:**

- ✅ Durability: Storage persists across crashes
- ✅ Detection: Polling finds due schedules
- ✅ At-least-once: Broker handles delivery semantics
- ✅ Idempotency: Upsert on `(tenantId, serviceCallId)`
- ✅ Broker-agnostic: Standard DB queries, no special features
- ✅ Portable: No external dependencies

---

## Decision

**Adopt periodic polling (5-second interval) as the Timer detection mechanism.**

**Rationale:** First principles analysis shows this as the only viable path satisfying all MVP constraints (durable, broker-agnostic, portable, simple). Alternatives violate architectural principles or add unjustified complexity.

---

## Key Design Choices

### 1. Storage Model: Shared DB with Strong Boundaries

**Choice**: Single SQLite database (`event_service.db`) with Timer owning `timer_schedules` table.

**Boundaries (enforced in code):**

- ❌ **No Cross-Module JOINs**: Timer queries ONLY its own table
- ✅ **Denormalized Storage**: Timer stores all needed data from `ScheduleTimer` event
- ✅ **Event-Driven Communication**: Timer receives data via broker, not DB queries
- ⚠️ **Foreign Keys**: For integrity only (can be removed when extracting to separate service)

**Migration Path:**

```
Phase 1 (MVP): Single event_service.db + strong code boundaries
Phase N: Extract to separate timer.db (already event-driven, denormalized)
```

---

### 2. Data Model

**Entity-Relationship Diagram**:

```mermaid
erDiagram
    TENANTS {
        string tenant_id PK "Tenant identifier"
    }

    SERVICE_CALLS {
        string tenant_id PK,FK "Tenant owner"
        string service_call_id PK "Aggregate identity"
    }

    TIMER_SCHEDULES {
        string tenant_id PK,FK "References TENANTS"
        string service_call_id PK,FK "References SERVICE_CALLS"
        timestamp due_at "When to fire (indexed)"
        string state "Scheduled | Reached"
        timestamp registered_at "When schedule was created"
        timestamp reached_at "When event was published (nullable)"
        string correlation_id "For distributed tracing (nullable)"
    }

    TENANTS ||--o{ SERVICE_CALLS : "owns"
    TENANTS ||--o{ TIMER_SCHEDULES : "scopes"
    SERVICE_CALLS ||--|| TIMER_SCHEDULES : "has exactly one"
```

**Table: `timer_schedules`**

```typescript
type TimerSchedule = {
  // Composite Primary Key
  readonly tenantId: TenantId;
  readonly serviceCallId: ServiceCallId;

  // Schedule
  readonly dueAt: timestamp; // When to fire (indexed!)
  state: "Scheduled" | "Reached"; // Lifecycle

  // Audit
  readonly registeredAt: timestamp;
  reachedAt?: timestamp; // When event published

  // Observability
  readonly correlationId?: string;
};
```

**Indexes:**

- Composite: `(state, dueAt)` for polling query
- Unique: `(tenantId, serviceCallId)` primary key

**Critical Polling Query:**

```sql
SELECT tenant_id, service_call_id, due_at, correlation_id
FROM timer_schedules
WHERE state = 'Scheduled' AND due_at <= datetime('now')
ORDER BY due_at ASC
LIMIT 100;
```

---

### 3. Command Handler vs Polling Worker

**Observation**: Timer has two distinct responsibilities with different characteristics.

**Command Handler (Reactive, Lightweight):**

- **Trigger**: External (commands from broker)
- **Action**: Persist schedule to DB
- **Duration**: Milliseconds
- **Scaling**: Horizontal (stateless)

**Polling Worker (Autonomous, Heavy):**

- **Trigger**: Internal (every 5 seconds)
- **Action**: Query DB, publish events, update state
- **Duration**: Seconds
- **Scaling**: Single instance (MVP)

**Benefits of Separation:**

1. Different performance profiles (low-latency writes vs batch processing)
2. Isolated failures (command fails ≠ polling fails)
3. Independent testing strategies
4. Clear scaling paths (command handler scales horizontally, worker stays single instance)

**MVP Deployment**: Both in same process, different threads.

---

### 4. State Transition Pattern

**Critical Decision**: How to handle `Publish → Update` atomicity?

**Pattern: Publish-then-update** (accept at-least-once duplicates)

```typescript
for (const schedule of dueSchedules) {
  await eventBus.publish(DueTimeReached(schedule)); // First
  await db.update("SET state = 'Reached' WHERE ..."); // Second
}
```

**Failure Scenarios:**

| Scenario                       | Outcome                    | Acceptable? |
| ------------------------------ | -------------------------- | ----------- |
| Publish succeeds, update fails | Duplicate event next poll  | ✅ Yes      |
| Update succeeds, publish fails | Event never sent           | ❌ No       |
| Crash after publish            | Duplicate event on restart | ✅ Yes      |

**Rationale:**

- Aligns with "at-least-once delivery" requirement
- Orchestration already guards duplicates via state checks
- Simpler than outbox pattern
- Worst case: duplicate (safe) vs lost event (unsafe)

**Consequence**: Orchestration MUST be idempotent on `DueTimeReached`.

---

### 5. Idempotency Edge Case

**Question**: What if duplicate `ScheduleTimer` arrives after timer already fired?

**Decision**: Ignore if state = 'Reached'

```sql
INSERT INTO timer_schedules (...)
VALUES (?, ?, ?, 'Scheduled')
ON CONFLICT (tenant_id, service_call_id)
DO UPDATE SET due_at = EXCLUDED.due_at
WHERE timer_schedules.state = 'Scheduled';
-- WHERE clause prevents updating 'Reached' schedules
```

**Rationale**: Domain constraint "no rescheduling after execution starts."

---

## Consequences

### MVP Scope (What We Build)

**Core Functionality:**

- ✅ Command Handler: Accept `ScheduleTimer` via broker
- ✅ Polling Worker: 5-second interval loop
- ✅ Storage: `timer_schedules` table in shared DB
- ✅ State Model: `Scheduled` → `Reached`
- ✅ Idempotency: UPSERT on `(tenantId, serviceCallId)`
- ✅ At-least-once: Publish-then-update pattern

**Minimal Error Handling:**

- Transient errors: Retry with exponential backoff
- Permanent errors: Log and skip
- Critical errors: Fail-fast (exit process)

**Deployment:**

- Single process (command handler + worker)
- Single instance (no HA)

**What This Gives Us**: Satisfies all 5 core requirements for dozens to hundreds of tenants.

---

### Deferred to Future

- ⏳ In-memory optimization (setTimeout)
- ⏳ Retention cleanup job
- ⏳ Advanced observability (Prometheus, Grafana)
- ⏳ Leader election for HA
- ⏳ Separate Timer service extraction

**Why Defer**: MVP constraints make simple solution sufficient. Build what we need, not what we might need.

---

### Scale Limits (When MVP Breaks)

**The design stops being sufficient when:**

1. **Tenant count > ~500**: Polling query becomes I/O bound → partition by tenant
2. **Schedule density > 1000/min**: Can't process batch in 5s → reduce interval or increase batch size
3. **Time horizon extends to days/weeks**: Table grows large → tiered storage (near-term in memory)
4. **HA required (99.9% uptime)**: Single instance is SPOF → leader election
5. **Command rate > 100/sec**: Write contention → horizontal scaling of command handler

**Key Insight**: These limits are **well beyond MVP scope**. Room to grow before needing complexity.

---

### Integration Impact

**Orchestration Module:**

- ✅ **Required**: Idempotent handling of `DueTimeReached` events
- ✅ **Required**: State machine guards duplicate events

**Execution Module:**

- ✅ No direct coupling (Timer → Orchestration → Execution)

**API Module:**

- ✅ No direct coupling (API → Orchestration → Timer)
- ⚠️ **Future**: If API needs "when will this execute?" query, Timer must expose read model

---

### Operational Requirements

**Deployment:**

- Single binary: `timer-service`
- Database: SQLite file (backup via file copy)
- Broker: NATS JetStream

**Monitoring:**

- Metrics: `timer.commands.received`, `timer.schedules.processed`, `timer.polling.duration`
- Alerts: No polls in 30s, permanent error rate > 1%

**Configuration:**

```bash
TIMER_POLLING_INTERVAL=5000        # 5s default
TIMER_BATCH_SIZE=100               # Max per poll
TIMER_DB_PATH=./event_service.db
TIMER_BROKER_URL=nats://localhost:4222
```

---

## References

- [ADR-0002]: Broker selection (NATS JetStream, all require external Timer)
- [ScheduleTimer]: Message contract in `docs/design/messages.md`
- [DueTimeReached]: Message contract in `docs/design/messages.md`
- [ADR-0004]: Database selection (SQLite for MVP)

[ADR-0002]: ./ADR-0002-broker.md
[ScheduleTimer]: ../design/messages.md#scheduletimer
[DueTimeReached]: ../design/messages.md#duetimereached
[ADR-0004]: ./ADR-0004-database.md
