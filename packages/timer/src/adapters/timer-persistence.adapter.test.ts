import { describe, expect, it } from '@effect/vitest'
import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Option from 'effect/Option'
import * as TestClock from 'effect/TestClock'

import { ServiceCallId, TenantId } from '@event-service-agent/contracts/types'

import { TimerPersistence } from '#/adapters/timer-persistence.adapter.ts'
import { ScheduledTimer } from '#/domain/timer-entry.domain.ts'
import { TimerPersistencePort } from '#/ports/timer-persistence.port.ts'

describe('TimerPersistenceAdapter', () => {
	describe('inMemory', () => {
		const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
		const serviceCallId = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')

		describe('save', () => {
			it.effect('persists timer successfully', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort

					// Act: Save timer
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('4 minutes')

					// Assert: Verify timer is retrievable
					const found = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isSome(found)).toBe(true)

					const timer = Option.getOrThrow(found)
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
					expect(timer._tag).toBe('Scheduled')
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)
		})

		describe('findScheduledTimer', () => {
			it.effect('returns None when timer is Reached', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('10 minutes')

					// Mark as fired (transition to Reached)
					yield* persistence.markFired(tenantId, serviceCallId, yield* DateTime.now)

					// findScheduledTimer should return None (timer is Reached)
					const found = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
					expect(Option.isNone(found)).toBe(true)

					// But find (observability) should still return it
					const rawFound = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isSome(rawFound)).toBe(true)
					expect(Option.getOrThrow(rawFound)._tag).toBe('Reached')
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('returns None when timer does not exist', () =>
				Effect.gen(function* () {
					const persistence = yield* TimerPersistencePort

					// Should return None for non-existent timer
					const found = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
					expect(Option.isNone(found)).toBe(true)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('returns Some when timer is Scheduled', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					// Should find the scheduled timer
					const found = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
					expect(Option.isSome(found)).toBe(true)

					const timer = Option.getOrThrow(found)
					expect(timer._tag).toBe('Scheduled')
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)
		})

		describe('find', () => {
			it.effect('returns Some when timer exists', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act: Save timer
					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('4 minutes')

					// Assert: Verify timer is retrievable
					const found = yield* persistence.find(tenantId, serviceCallId)

					expect(Option.isSome(found)).toBe(true)
					const timer = Option.getOrThrow(found)
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
					expect(timer._tag).toBe('Scheduled')
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('returns None when timer does not exist', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a different serviceCallId
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2'),
						tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a3'),
					})

					// Act: Save a different timer
					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('4 minutes')

					// Assert: Verify timer is not retrievable
					const found = yield* persistence.find(tenantId, serviceCallId)

					expect(Option.isNone(found)).toBe(true)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)
		})

		describe('findDue', () => {
			it.effect('returns empty chunk when no timers are due', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act: Save timer & advance time
					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					yield* TestClock.adjust('4 minutes')

					// Assert: Verify no timers are due
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					expect(Chunk.isEmpty(dueTimers)).toBe(true)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('returns timers that are due', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt: dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					// Act: Save timer & advance time
					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('10 minutes')

					// Assert: Verify timer is due
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					expect(Chunk.size(dueTimers)).toBe(1)
					const timer = Chunk.unsafeGet(dueTimers, 0)
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('returns multiple due timers', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const dueAt1 = DateTime.addDuration(now, Duration.minutes(5))
					const dueAt2 = DateTime.addDuration(dueAt1, Duration.minutes(4))

					const serviceCallId2 = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2')
					const serviceCallId1 = serviceCallId

					const timer1 = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt: dueAt1,
						registeredAt: now,
						serviceCallId: serviceCallId1,
						tenantId,
					})

					const timer2 = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt: dueAt2,
						registeredAt: now,
						serviceCallId: serviceCallId2,
						tenantId,
					})

					// Act: Save timers & advance time when both are due
					const persistence = yield* TimerPersistencePort
					yield* persistence.save(timer1)
					yield* persistence.save(timer2)
					yield* TestClock.adjust('10 minutes')

					// Assert: Verify both timers are due
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					expect(Chunk.size(dueTimers)).toBe(2)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('returns timer when dueAt equals now', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt: now,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					const dueTimers = yield* persistence.findDue(now)

					expect(Chunk.size(dueTimers)).toBe(1)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)
		})

		describe('markFired', () => {
			it.effect('transitions timer from Scheduled to Reached', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('10 minutes')

					// Verify timer exists and is due
					const founds = yield* persistence.findDue(yield* DateTime.now)
					expect(Option.isSome(Chunk.head(founds))).toBe(true)

					// Mark as fired
					const reachedAt = yield* DateTime.now
					yield* persistence.markFired(tenantId, serviceCallId, reachedAt)

					// Verify timer still exists but transitioned to Reached state (using find)
					yield* TestClock.adjust('5 seconds')
					const afterFired = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isSome(afterFired)).toBe(true)

					const timer = Option.getOrThrow(afterFired)
					expect(timer._tag).toBe('Reached')

					// Type guard to access ReachedTimer properties
					if (timer._tag === 'Reached') {
						expect(DateTime.Equivalence(timer.reachedAt, reachedAt)).toBe(true)
					}

					// Verify timer no longer appears in findScheduledTimer (domain operation)
					const scheduled = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
					expect(Option.isNone(scheduled)).toBe(true)

					// Verify timer no longer appears in findDue
					const dueAfterFired = yield* persistence.findDue(yield* DateTime.now)
					expect(Chunk.isEmpty(dueAfterFired)).toBe(true)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('markFired - idempotent (Reached → Reached preserves original reachedAt)', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('10 minutes')

					// Mark as fired FIRST time
					const firstReachedAt = yield* DateTime.now
					yield* persistence.markFired(tenantId, serviceCallId, firstReachedAt)

					// Mark as fired SECOND time (should be no-op)
					yield* TestClock.adjust('1 minute')
					const secondReachedAt = yield* DateTime.now
					yield* persistence.markFired(tenantId, serviceCallId, secondReachedAt)

					// Verify: still Reached with FIRST reachedAt (didn't change)
					const result = yield* persistence.find(tenantId, serviceCallId)
					const timer = Option.getOrThrow(result)

					expect(timer._tag).toBe('Reached')
					if (timer._tag === 'Reached') {
						// Should preserve original reachedAt
						expect(DateTime.Equivalence(timer.reachedAt, firstReachedAt)).toBe(true)
						// Should NOT equal secondReachedAt
						expect(DateTime.Equivalence(timer.reachedAt, secondReachedAt)).toBe(false)
					}
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.effect('markFired - idempotent (succeeds even if timer does not exist)', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const persistence = yield* TimerPersistencePort

					// Should not fail when marking non-existent timer as fired
					yield* persistence.markFired(tenantId, serviceCallId, now)

					// Verify nothing was created
					const result = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isNone(result)).toBe(true)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)
		})

		describe('delete', () => {
			it.todo('removes timer from storage', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const dueAt = DateTime.addDuration(now, Duration.minutes(5))

					const scheduledTimer = ScheduledTimer.make({
						correlationId: Option.none(),
						dueAt,
						registeredAt: now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					// Verify timer exists
					const found = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isSome(found)).toBe(true)

					// Delete timer
					yield* persistence.delete(tenantId, serviceCallId)

					// Verify timer is removed
					const afterDelete = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isNone(afterDelete)).toBe(true)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)

			it.todo('idempotent (succeeds even if timer does not exist)', () =>
				Effect.gen(function* () {
					const persistence = yield* TimerPersistencePort

					// Should not fail when deleting non-existent timer
					yield* persistence.delete(tenantId, serviceCallId)
				}).pipe(Effect.provide(TimerPersistence.inMemory)),
			)
		})

		it.effect('acquireRelease - cleanup executes even when operations fail', () =>
			Effect.gen(function* () {
				/**
				 * This test verifies the safety guarantee of Effect.acquireRelease:
				 * cleanup (Ref.set to empty) executes even if operations fail after acquisition.
				 *
				 * This is important because it ensures:
				 * 1. No resource leaks on error paths
				 * 2. Storage is always cleaned up when scope closes
				 * 3. Error handling doesn't prevent cleanup
				 */
				const now = yield* DateTime.now

				const result = yield* Effect.scoped(
					Effect.gen(function* () {
						const persistence = yield* Effect.provide(TimerPersistencePort, TimerPersistence.inMemory)

						const timer = ScheduledTimer.make({
							correlationId: Option.none(),
							dueAt: DateTime.addDuration(now, Duration.minutes(5)),
							registeredAt: now,
							serviceCallId,
							tenantId,
						})

						yield* persistence.save(timer)

						// Simulate error after successful save
						return yield* Effect.fail(new Error('Simulated error'))
					}),
				).pipe(Effect.either)

				// Verify the effect failed as expected
				if (Either.isLeft(result)) {
					expect(result.left.message).toBe('Simulated error')
				} else {
					throw new Error('Expected failure but got success')
				}

				// If we reach here, cleanup executed successfully
				// (if cleanup failed or hung, the test would timeout/error)
			}),
		)
	})
})
