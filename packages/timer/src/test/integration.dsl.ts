// biome-ignore lint/correctness/noUndeclaredDependencies: vitest is hoisted from root workspace
import { expect } from '@effect/vitest'
import * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import type { DurationInput } from 'effect/Duration'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as TestClock from 'effect/TestClock'

import { SQL } from '@event-service-agent/platform/database'
import type { MessageEnvelope } from '@event-service-agent/schemas/envelope'
import { ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Adapters from '../adapters/index.ts'
import { TimerDomain } from '../domain/index.ts'
import * as Ports from '../ports/index.ts'
import { withServiceCall } from './service-call.fixture.ts'

// ═══════════════════════════════════════════════════════════════════════════
// TEST INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test-only service for capturing published events.
 *
 * Provides access to the internal Ref used by the mocked EventBusPort,
 * enabling test assertions on published messages.
 */
export class TestEventCapture extends Context.Tag('TestEventCapture')<
	TestEventCapture,
	Ref.Ref<Chunk.Chunk<MessageEnvelope.Type>>
>() {}

/**
 * Layer providing both EventBusPort (mock) and TestEventCapture.
 *
 * - EventBusPort.publish: appends events to internal Ref
 * - EventBusPort.subscribe: returns Effect.never (no commands delivered)
 * - TestEventCapture: exposes the Ref for test assertions
 */
const EventBusTest: Layer.Layer<Ports.Platform.EventBusPort | TestEventCapture> = Layer.unwrapEffect(
	Effect.gen(function* () {
		const ref = yield* Ref.make(Chunk.empty<MessageEnvelope.Type>())

		const EventBusMock = Layer.mock(Ports.Platform.EventBusPort, {
			publish: (events) => Ref.update(ref, (existing) => Chunk.appendAll(existing, Chunk.fromIterable(events))),
			subscribe: () => Effect.never,
		})

		const TestEventCaptureLayer = Layer.succeed(TestEventCapture, ref)

		return Layer.merge(EventBusMock, TestEventCaptureLayer)
	}),
)

export const TestHarness = {
	Layer: Adapters.TimerEventBus.Live.pipe(
		Layer.provideMerge(EventBusTest),
		Layer.provideMerge(Adapters.TimerPersistence.Test),
		Layer.provideMerge(Adapters.Clock.Test),
		Layer.provideMerge(Adapters.Platform.UUID7.Sequence()),
		Layer.provideMerge(SQL.Test),
	),
} as const

// ═══════════════════════════════════════════════════════════════════════════
// TEST DSL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Time control DSL - wraps TestClock with domain-meaningful names
 */
export const Time = {
	/**
	 * Advance virtual clock and yield to allow fibers to execute
	 */
	advance: (duration: DurationInput) =>
		pipe(
			duration,
			TestClock.adjust,
			Effect.andThen(() => Effect.yieldNow()),
		),

	/**
	 * Get current virtual time
	 */
	now: pipe(
		Ports.ClockPort,
		Effect.flatMap((clock) => clock.now()),
	),
} as const

/**
 * Event capture DSL - query published events
 */
export const Events = (() => {
	const all = TestEventCapture.pipe(Effect.flatMap(Ref.get))

	return {
		/**
		 * Get all published events
		 */
		all,

		/**
		 * Get event at specific index
		 */
		at: <Idx extends number>(index: Idx) => all.pipe(Effect.flatMap(Chunk.get(index))),

		/**
		 * Get count of published events
		 */
		count: all.pipe(Effect.map(Chunk.size)),
	} as const
})()

/**
 * Timer state DSL - query and create timers
 */
export const Timers = {
	/**
	 * Get all currently due timers
	 */
	due: Effect.all([Ports.TimerPersistencePort, Ports.ClockPort]).pipe(
		Effect.flatMap(([persistence, clock]) => Effect.flatMap(clock.now(), persistence.findDue)),
	),

	/**
	 * Find timer by key (any state)
	 */
	find: ({ serviceCallId, tenantId }: TimerDomain.TimerEntry.Type) =>
		Ports.TimerPersistencePort.pipe(
			Effect.flatMap((timerPersistence) => timerPersistence.find({ serviceCallId, tenantId })),
		),

	/**
	 * Schedule a timer at given duration from now.
	 * Creates service call fixture and persists timer.
	 */
	scheduleAt: (dueIn: DurationInput) =>
		Effect.gen(function* () {
			const now = yield* Time.now
			const persistence = yield* Ports.TimerPersistencePort

			const scheduledTimer = TimerDomain.ScheduledTimer.make({
				correlationId: Option.none(),
				dueAt: DateTime.addDuration(now, dueIn),
				registeredAt: now,
				serviceCallId: yield* ServiceCallId.makeUUID7(),
				tenantId: yield* TenantId.makeUUID7(),
			})

			yield* withServiceCall({
				serviceCallId: scheduledTimer.serviceCallId,
				tenantId: scheduledTimer.tenantId,
			})

			yield* persistence.save(scheduledTimer)

			return scheduledTimer
		}),
} as const

/**
 * Assertion DSL - domain-focused expectations
 *
 * Two-phase design:
 * - `Expect.event.*` — EventBus assertions (published events)
 * - `Expect.timer(t)` — Database assertions (persisted state)
 */
export const Expect = (() => {
	// TODO: move stuff here and just return the object?

	const event = {
		/**
		 * Start assertion chain at specific event index (no count check)
		 */
		atIndex: (position: number) => Expect.event.toHaveCount(position + 1).atIndex(position),

		/**
		 * Assert no events were published
		 */
		toBeEmpty: () => Expect.event.toHaveCount(0),

		/**
		 * Assert exact number of events were published.
		 * Returns a builder that can chain to atIndex or verify directly.
		 */
		toHaveCount: (expected: number) => {
			type AssertionFn = (ctx: string) => Effect.Effect<void, any, TestEventCapture>

			const countAssertion: AssertionFn = (ctx) =>
				Events.count.pipe(
					Effect.tap((actual) => expect(actual, `${ctx}: expected ${expected} event(s) published`).toBe(expected)),
				)

			const createIndexBuilder = (assertions: AssertionFn[], position: number) => {
				const toBeForTimer = (timer: TimerDomain.ScheduledTimer) =>
					createIndexBuilder(
						[
							...assertions,
							(ctx) =>
								Events.at(position).pipe(
									Effect.tap((event) => {
										const { serviceCallId } = event.payload as { serviceCallId?: string }

										expect(serviceCallId, `${ctx}: event[${position}].serviceCallId`).toBe(timer.serviceCallId)
									}),
								),
						],
						position,
					)

				const toHaveTenant = (tenantId: TenantId.Type) =>
					createIndexBuilder(
						[
							...assertions,
							(ctx) =>
								pipe(
									Events.at(position),
									Effect.tap((event) => {
										expect(event.tenantId, `${ctx}: event[${position}].tenantId`).toBe(tenantId)
									}),
								),
						],
						position,
					)

				const toHaveType = (type: MessageEnvelope.Type['type']) =>
					createIndexBuilder(
						[
							...assertions,
							(ctx) =>
								pipe(
									Events.at(position),
									Effect.tap((event) => {
										expect(event.type, `${ctx}: event[${position}].type`).toBe(type)
									}),
								),
						],
						position,
					)

				const verify = (context: string) =>
					Effect.all(
						assertions.map((fn) => fn(context)),
						{ discard: true },
					)

				return {
					/**
					 * Assert event is for the given timer (serviceCallId matches)
					 */
					toBeForTimer,

					/**
					 * Assert event has the given tenantId
					 */
					toHaveTenant,

					/**
					 * Assert event has the given type
					 */
					toHaveType,

					/**
					 * Execute all chained assertions with the given context
					 */
					verify,
				}
			}

			return {
				/**
				 * Continue to assert on event at specific index
				 */
				atIndex: (position: number) => createIndexBuilder([countAssertion], position),

				/**
				 * Execute count assertion only
				 */
				verify: (context: string) => countAssertion(context),
			}
		},
	}

	const timer = (timer: TimerDomain.ScheduledTimer) => {
		type AssertionFn = (ctx: string) => Effect.Effect<void, any, Ports.TimerPersistencePort>

		const createBuilder = (assertions: AssertionFn[]) => ({
			/**
			 * Assert timer has transitioned to Reached state in persistence
			 */
			toBeReached: () =>
				createBuilder([
					...assertions,
					(ctx) =>
						pipe(
							Timers.find(timer),
							Effect.tap((found) => {
								expect(Option.isSome(found), `${ctx}: timer should exist in DB`).toBe(true)
								expect(found.pipe(Option.map((t) => t._tag)), `${ctx}: timer._tag`).toEqual(Option.some('Reached'))
							}),
						),
				]),

			/**
			 * Assert timer is still in Scheduled state
			 */
			toBeScheduled: () =>
				createBuilder([
					...assertions,
					(ctx) =>
						pipe(
							Timers.find(timer),
							Effect.tap((found) => {
								expect(Option.isSome(found), `${ctx}: timer should exist in DB`).toBe(true)
								expect(found.pipe(Option.map((t) => t._tag)), `${ctx}: timer._tag`).toEqual(Option.some('Scheduled'))
							}),
						),
				]),

			/**
			 * Execute all chained assertions with the given context
			 */
			verify: (context: string) =>
				Effect.all(
					assertions.map((fn) => fn(context)),
					{ discard: true },
				),
		})

		return createBuilder([])
	}

	const noTimersDue = (context: string) =>
		Timers.due.pipe(Effect.tap((due) => expect(Chunk.isEmpty(due), `${context}: no timers should be due`).toBe(true)))

	return {
		/**
		 * Event assertions namespace - all EventBus-related checks
		 */
		event,

		/**
		 * Assert no timers are currently due
		 */
		noTimersDue,

		/**
		 * Timer assertion builder - chainable API for Database assertions.
		 */
		timer,
	} as const
})()
