# Implementation Plan: Option E (Ambient Context for CorrelationId Propagation)

**Status**: Planning\
**Decision**: Full Effect-idiomatic solution (Ambient Context pattern)\
**Context**: PR#36 P0 issue - restore correlationId propagation after pure domain events refactoring\
**Date**: 2025-11-05

---

## 🎯 Executive Summary

**Problem**: Timer adapter currently sets `correlationId: Option.none()` in envelopes, breaking distributed tracing after PR#36 refactoring to pure domain events.

**Root Cause**: Port signature changed from `publishDueTimeReached(timer, firedAt)` to `publishDueTimeReached(event)`, losing access to `timer.correlationId`.

**Solution**: Implement **Option E (Ambient Context)** using Effect Context system for implicit metadata propagation.

**Scope**:

- Fix Timer module (P0 - CRITICAL)
- Update outdated documentation (P1 - MAJOR)
- Establish pattern for future modules (Orchestration, Execution)

---

## 📊 Current State Assessment

### What Actually Exists (Checked git log + actual code)

✅ **MessageEnvelope** - Effect Schema implementation (commit d16df59, PR #34):

```typescript
// packages/schemas/src/envelope/message-envelope.schema.ts
export class MessageEnvelope extends Schema.Class<MessageEnvelope>('MessageEnvelope')({
  id: EnvelopeId,
  type: Schema.String,
  payload: DomainMessage,  // Union of all domain messages
  tenantId: TenantId,
  timestampMs: Schema.DateTimeUtcFromNumber,
  aggregateId: Schema.optionalWith(ServiceCallId, { as: 'Option', exact: true }),
  causationId: Schema.optionalWith(EnvelopeId, { as: 'Option', exact: true }),
  correlationId: Schema.optionalWith(CorrelationId, { as: 'Option', exact: true }),
}){}
```

✅ **Timer Implementation** - Manual envelope construction in adapter:

```typescript
// packages/timer/src/adapters/timer-event-bus.adapter.ts (lines 40-69)
const envelopeId = yield * EnvelopeId.makeUUID7()
const envelope = new MessageEnvelope({
	id: envelopeId,
	type: dueTimeReached._tag,
	payload: dueTimeReached, // Pure domain event
	tenantId: dueTimeReached.tenantId,
	timestampMs: yield * clock.now(),
	aggregateId: Option.some(dueTimeReached.serviceCallId),
	causationId: Option.none(),
	correlationId: Option.none(), // ❌ BROKEN - loses correlation!
})
```

✅ **Test Suite** - Shows actual usage pattern (not hypothetical `makeEnvelope`):

```typescript
// packages/timer/src/adapters/timer-event-bus.adapter.test.ts (lines 40-70)
const dueTimeReachedEvent = new Messages.Timer.Events.DueTimeReached({
	reachedAt: now,
	serviceCallId,
	tenantId,
})

yield * timerEventBus.publishDueTimeReached(dueTimeReachedEvent)

// Test assertion shows problem:
assertEquals(envelope.correlationId, Option.none()) // TODO comment
```

❌ **Orchestration/Execution** - Only placeholder files (not implemented):

```typescript
// packages/orchestration/src/index.ts
// TODO: Implement orchestration logic
export {}
```

❌ **`makeEnvelope` helper** - Referenced in docs but DOES NOT EXIST in codebase

### What Documentation Claims (LIES!)

❌ **Design docs claim `makeEnvelope` pattern** (docs/design/modules/orchestration.md, execution.md):

```typescript
// THIS DOES NOT EXIST IN CODE:
const envelope =
	yield* makeEnvelope('ServiceCallSubmitted', dto, {
		tenantId,
		correlationId: Option.getOrUndefined(correlationId),
		timestampMs: now.epochMillis,
		aggregateId: finalServiceCallId,
	})
```

❌ **ADR-0011 documents makeEnvelope** (lines 399-450):

```typescript
// THIS IS ASPIRATIONAL, NOT IMPLEMENTED:
export const makeEnvelope = <T extends DomainMessage.Encoded>(
  type: string,
  payload: T,
  metadata: { tenantId, correlationId, ... }
): Effect.Effect<MessageEnvelope.Type, ParseError, UUID7> => { ... }
```

**Reality**: Timer manually constructs `MessageEnvelope` via `new MessageEnvelope({ ... })` (direct Schema class instantiation).

---

## 🏗️ Solution Architecture: Option E (Ambient Context)

### Core Pattern: Effect Context for Metadata

```typescript
// 1. Define Context Tag for message metadata
export class MessageMetadata extends Context.Tag('MessageMetadata')<
	MessageMetadata,
	{
		readonly correlationId: Option.Option<CorrelationId.Type>
		readonly causationId: Option.Option<EnvelopeId.Type>
	}
>() {}
```

### Type-Driven Requirements (R Parameter)

```typescript
// Port signature includes MessageMetadata requirement
export interface TimerEventBusPort {
	readonly publishDueTimeReached: (
		event: DueTimeReached.Type
	) => Effect.Effect<
		void,
		PublishError,
		MessageMetadata // ← Requires metadata context
	>
}
```

### Value Provisioning (Per-Request Data)

```typescript
// Workflow extracts from aggregate and provisions context
const workflow = Effect.gen(function* () {
  const timer = yield* findTimer()  // Has timer.correlationId

  const event = new DueTimeReached({ ... })

  // Provision metadata context for this specific publish
  yield* eventBus.publishDueTimeReached(event).pipe(
    Effect.provideService(MessageMetadata, {
      correlationId: timer.correlationId,  // From aggregate
      causationId: Option.none(),          // Autonomous event
    })
  )
})
```

### Adapter Consumption (Context Lookup)

```typescript
// Adapter reads from ambient context
const adapter = Effect.gen(function* () {
	const metadata = yield* MessageMetadata // Type-safe requirement

	const envelope = new MessageEnvelope({
		payload: event,
		correlationId: metadata.correlationId, // From context
		causationId: metadata.causationId,
		// ...
	})

	yield* bus.publish([envelope])
})
```

---

## 📋 Implementation Tasks

### Phase 1: Core Infrastructure (Option E)

**PL-24.1** Define MessageMetadata Context Tag [platform]

- [ ] Create `packages/platform/src/context/message-metadata.context.ts`
- [ ] Export `MessageMetadata` Context.Tag with correlationId + causationId
- [ ] Add unit tests for context value creation
- [ ] Update `packages/platform/src/index.ts` exports
- **Files**: 1 new, 1 modified
- **Tests**: 3 new tests
- **Estimate**: 30 minutes

**PL-24.2** Update TimerEventBusPort signature [timer]

- [ ] Add `MessageMetadata` to `publishDueTimeReached` requirements (R parameter)
- [ ] Update JSDoc to document context requirement
- [ ] **Files**: `packages/timer/src/ports/timer-event-bus.port.ts`
- **Tests**: None (interface only)
- **Estimate**: 15 minutes

**PL-24.3** Update TimerEventBus adapter implementation [timer]

- [ ] Extract `MessageMetadata` from context in adapter
- [ ] Replace `correlationId: Option.none()` with `metadata.correlationId`
- [ ] Add `causationId: metadata.causationId`
- [ ] Update error messages if metadata missing
- [ ] **Files**: `packages/timer/src/adapters/timer-event-bus.adapter.ts`
- **Tests**: Existing tests updated (see Phase 2)
- **Estimate**: 30 minutes

### Phase 2: Test Infrastructure (Effect Context Testing)

**PL-24.4** Create test helper for MessageMetadata provisioning [timer]

- [ ] Extract `BaseTestLayers` helper for common layers
- [ ] Create `withMessageMetadata` test helper for context provisioning
- [ ] Pattern:

    ```typescript
    const withMessageMetadata = (correlationId: Option<CorrelationId.Type>) =>
    	Effect.provideService(MessageMetadata, {
    		correlationId,
    		causationId: Option.none(),
    	})
    ```

- [ ] **Files**: `packages/timer/src/adapters/timer-event-bus.adapter.test.ts`
- **Tests**: Helper used in existing tests
- **Estimate**: 20 minutes

**PL-24.5** Update all TimerEventBus tests [timer]

- [ ] Add `MessageMetadata` provisioning to all tests
- [ ] Test scenarios:
  - With correlationId (happy path)
  - Without correlationId (Option.none)
  - Missing context (should fail with clear error)
- [ ] Update 14 existing tests in timer-event-bus.adapter.test.ts
- [ ] **Files**: `packages/timer/src/adapters/timer-event-bus.adapter.test.ts`
- **Tests**: 14 updated, 1 new (missing context error)
- **Estimate**: 45 minutes

**PL-24.6** Update workflow tests [timer]

- [ ] Update `pollDueTimersWorkflow` to provision MessageMetadata
- [ ] Extract correlationId from timer aggregate mock
- [ ] Update `scheduleTimerWorkflow` tests (if applicable)
- [ ] **Files**:
  - `packages/timer/src/workflows/poll-due-timers.workflow.test.ts`
  - `packages/timer/src/workflows/schedule-timer.workflow.test.ts`
- **Tests**: 13 poll tests + 9 schedule tests = 22 updated
- **Estimate**: 60 minutes

### Phase 3: Workflow Implementation (Context Provisioning)

**PL-24.7** Update pollDueTimersWorkflow [timer]

- [ ] Extract `correlationId` from `timer` aggregate (timer.correlationId)
- [ ] Wrap `publishDueTimeReached` call with `Effect.provideService(MessageMetadata, ...)`
- [ ] Handle case where timer has no correlationId (Option.none)
- [ ] **Files**: `packages/timer/src/workflows/poll-due-timers.workflow.ts`
- **Tests**: Covered by Phase 2 updates
- **Estimate**: 30 minutes

**PL-24.8** Run full test suite and fix any issues [timer]

- [ ] Run `bun run --filter @event-service-agent/timer test --run`
- [ ] Fix any type errors from MessageMetadata requirement
- [ ] Ensure all 66 timer tests pass
- [ ] **Estimate**: 30 minutes

### Phase 4: Documentation Updates (Fix Lies!)

**PL-24.9** Update ADR-0011 to reflect actual implementation [docs]

- [ ] Remove hypothetical `makeEnvelope` helper section (lines 399-450)
- [ ] Document actual pattern: direct `MessageEnvelope` Schema class usage
- [ ] Add section on Option E (Ambient Context) pattern
- [ ] Link to PR#36 and this implementation plan
- [ ] **Files**: `docs/decisions/ADR-0011-message-schemas.md`
- **Estimate**: 30 minutes

**PL-24.10** Update module design docs (Orchestration, Execution, Timer) [docs]

- [ ] Remove `makeEnvelope` references from:
  - `docs/design/modules/orchestration.md` (lines 76-86)
  - `docs/design/modules/execution.md` (lines 41-51)
  - `docs/design/modules/timer.md` (if exists)
- [ ] Document actual pattern with MessageMetadata Context
- [ ] Add code examples matching real implementation
- [ ] **Files**: 3 design docs
- **Estimate**: 45 minutes

**PL-24.11** Update hexagonal architecture docs [docs]

- [ ] Fix `docs/design/hexagonal-architecture-layers.md` (lines 520-535)
- [ ] Clarify adapter responsibility: "wrap domain events in MessageEnvelope"
- [ ] Document MessageMetadata Context requirement pattern
- [ ] **Files**: `docs/design/hexagonal-architecture-layers.md`
- **Estimate**: 20 minutes

**PL-24.12** Update ports.md documentation [docs]

- [ ] Fix `docs/design/ports.md` (lines 200-243)
- [ ] Update TimerEventBusPort signature with MessageMetadata requirement
- [ ] Add section on Effect Context pattern for metadata
- [ ] **Files**: `docs/design/ports.md`
- **Estimate**: 20 minutes

**PL-24.13** Update ADR-0009 (Observability) [docs]

- [ ] Clarify Phase 1: correlationId in MessageEnvelope (application-level)
- [ ] Clarify Phase 2: OpenTelemetry (infrastructure-level, separate concern)
- [ ] Document MessageMetadata Context pattern for Phase 1
- [ ] Link to correlation-propagation-analysis.md for design rationale
- [ ] **Files**: `docs/decisions/ADR-0009-observability.md`
- **Estimate**: 20 minutes

### Phase 5: Future-Proofing (Orchestration/Execution Pattern)

**PL-24.14** Document MessageMetadata pattern for future modules [docs]

- [ ] Create reference implementation guide in docs/patterns/
- [ ] Document workflow → port → adapter flow with Context
- [ ] Add testing patterns for MessageMetadata provisioning
- [ ] Create checklist for new modules
- [ ] **Files**: `docs/patterns/message-metadata-context.md` (new)
- **Estimate**: 30 minutes

---

## 🎯 Success Criteria

### Functional

- ✅ Timer adapter publishes envelopes with correlationId from timer aggregate
- ✅ All 66 timer tests pass
- ✅ Full suite (282 tests) passes without regressions
- ✅ No type errors (MessageMetadata requirement satisfied)

### Architectural

- ✅ Effect Context pattern used consistently
- ✅ Domain purity preserved (no infrastructure in domain events)
- ✅ Type-safe metadata propagation (R parameter enforces requirement)

### Documentation

- ✅ No false claims about `makeEnvelope` helper
- ✅ All design docs reflect actual implementation
- ✅ Pattern documented for future modules (Orchestration, Execution)
- ✅ ADR-0009 updated with Phase 1 vs Phase 2 clarity

---

## 📐 Estimates

| Phase                            | Tasks              | Estimated Time |
| -------------------------------- | ------------------ | -------------- |
| Phase 1: Core Infrastructure     | PL-24.1 - PL-24.3  | 1h 15m         |
| Phase 2: Test Infrastructure     | PL-24.4 - PL-24.6  | 2h 5m          |
| Phase 3: Workflow Implementation | PL-24.7 - PL-24.8  | 1h             |
| Phase 4: Documentation Updates   | PL-24.9 - PL-24.13 | 2h 5m          |
| Phase 5: Future-Proofing         | PL-24.14           | 30m            |
| **Total**                        | **14 tasks**       | **~7 hours**   |

**Recommended breakdown**:

- Day 1 (3h): Phase 1 + Phase 2 (get tests green)
- Day 2 (2h): Phase 3 (workflow implementation)
- Day 3 (2h): Phase 4 + Phase 5 (documentation cleanup)

---

## 🔗 Dependencies & Blockers

### Prerequisites

- ✅ PR#36 review comments analyzed (DONE)
- ✅ Option E chosen (DONE - user decision)
- ✅ Effect Context mechanics understood (DONE - prior discussion)

### Blocked By

- None (all prerequisites met)

### Blocks

- PR#36 merge (CRITICAL - P0 blocker)
- PL-2 Orchestration implementation (should follow same pattern)
- PL-5 Execution implementation (should follow same pattern)

---

## 🚨 Risks & Mitigations

### Risk: MessageMetadata missing in context

**Impact**: Runtime error when adapter tries to access context\
**Mitigation**: Type system enforces requirement (R parameter); compile error if not provided\
**Testing**: Add explicit test for missing context error

### Risk: Confusion between Layers vs Service Provisioning

**Impact**: Developers try to use Layers for per-request data\
**Mitigation**: Clear documentation + examples in docs/patterns/\
**Testing**: Include both patterns in test suite as reference

### Risk: Documentation drift (again!)

**Impact**: Docs get out of sync with implementation\
**Mitigation**: Add doc validation to CI (future: compare code snippets to actual code)\
**Process**: Update docs in same PR as implementation

---

## 📝 Git Workflow (TDD Discipline)

### Commit Strategy (RED-GREEN-REFACTOR)

Each phase follows atomic commits:

**Phase 1 Example**:

```bash
# RED
git commit -m "test(platform): add failing tests for MessageMetadata context (TDD red)

Refs: PL-24.1"

# GREEN
git commit -m "feat(platform): implement MessageMetadata Context.Tag (TDD green)

- Define MessageMetadata service with correlationId + causationId
- Export from platform/context module
- All tests passing

Refs: PL-24.1, PR#36"

# REFACTOR (if needed)
git commit -m "refactor(platform): extract MessageMetadata type alias

No behavior change; improves readability.

Refs: PL-24.1"
```

### Branch Strategy

- Work on existing branch: `timer/pl-23-pure-domain-events-at-port`
- All commits add to PR#36 (already open)
- Final PR title: "feat(timer): implement MessageMetadata context for correlationId propagation (PL-23, PL-24)"

---

## 🔍 Review Checklist (Before Merge)

### Code

- [ ] All 14 tasks completed
- [ ] 282 tests passing (full suite)
- [ ] No TypeScript errors
- [ ] No biome lint errors
- [ ] All TODO comments addressed or tracked

### Documentation

- [ ] No references to non-existent `makeEnvelope` helper
- [ ] All code examples match actual implementation
- [ ] ADR-0009 updated with Phase 1/2 distinction
- [ ] Module design docs reflect MessageMetadata pattern

### PR Review Response

- [ ] P0 (CRITICAL) - correlationId propagation fixed (4 comments)
- [ ] P1 (MAJOR) - documentation updated (2 comments)
- [ ] P3 (NITPICK) - already fixed (3 commits)
- [ ] All PR comments addressed with commit references

---

## 🎓 Lessons Learned (Capture During Work)

### What Worked Well

- (TBD - fill in during implementation)

### What Could Be Better

- (TBD - fill in during implementation)

### Design Insights

- (TBD - fill in during implementation)

---

## 📚 References

- **PR#36**: feat(timer): refactor EventBusPort to use pure domain types (PL-23)
- **[ADR-0013]**: CorrelationId Propagation Through Pure Domain Events (decision rationale)
- **[ADR-0009]**: Observability baseline (correlationId vs OpenTelemetry)
- **[ADR-0011]**: Message Schema Validation with Effect Schema
- **Effect Docs**: Context system (use MCP tools for latest)
- **Git Log**: Commit d16df59 (MessageEnvelope Effect Schema migration)

[ADR-0009]: ../decisions/ADR-0009-observability.md
[ADR-0011]: ../decisions/ADR-0011-message-schemas.md
[ADR-0013]: ../decisions/ADR-0013-correlation-propagation.md
