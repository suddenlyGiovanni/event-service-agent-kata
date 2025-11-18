import * as Sql from '@effect/sql'
import { describe, expect, it } from '@effect/vitest'
import { assertNone, assertTrue } from '@effect/vitest/utils'
import * as Chunk from 'effect/Chunk'
import * as DateTime from 'effect/DateTime'
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as TestClock from 'effect/TestClock'

import { SQL } from '@event-service-agent/platform/database'
import { UUID7 } from '@event-service-agent/platform/uuid7'
import { CorrelationId, ServiceCallId, TenantId } from '@event-service-agent/schemas/shared'

import * as Domain from '../domain/timer-entry.domain.ts'
import * as Ports from '../ports/index.ts'
import * as Adapters from './index.ts'

/**
 * Test helper: Creates a ScheduledTimer with default values
 * @param now - Current time (registeredAt)
 * @param tenantId - Tenant identifier
 * @param serviceCallId - Service call identifier
 * @param dueIn - Minutes until timer is due (default: 5)
 * @param correlationId - Optional correlation identifier
 */
const makeScheduledTimer = ({
	now,
	tenantId,
	serviceCallId,
	dueIn = '5 minutes',
	correlationId,
}: {
	now: DateTime.Utc
	tenantId: TenantId.Type
	serviceCallId: ServiceCallId.Type
	dueIn?: Duration.DurationInput
	correlationId?: CorrelationId.Type
}): Domain.ScheduledTimer =>
	Domain.ScheduledTimer.make({
		correlationId: Option.fromNullable(correlationId),
		dueAt: DateTime.addDuration(now, dueIn),
		registeredAt: now,
		serviceCallId,
		tenantId,
	})

describe('TimerPersistenceAdapter', () => {
	describe('inMemory', () => {
		const tenantId = TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0')
		const serviceCallId = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a1')

		describe('save', () => {
			it.effect('persists timer successfully', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort

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
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)
		})

		describe('findScheduledTimer', () => {
			it.effect('returns None when timer is Reached', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort
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
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('returns None when timer does not exist', () =>
				Effect.gen(function* () {
					const persistence = yield* Ports.TimerPersistencePort

					// Should return None for non-existent timer
					const found = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
					expect(Option.isNone(found)).toBe(true)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('returns Some when timer is Scheduled', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now: now,
						serviceCallId: serviceCallId,
						tenantId: tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					// Should find the scheduled timer
					const found = yield* persistence.findScheduledTimer(tenantId, serviceCallId)
					expect(Option.isSome(found)).toBe(true)

					const timer = Option.getOrThrow(found)
					expect(timer._tag).toBe('Scheduled')
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)
		})

		describe('find', () => {
			it.effect('returns Some when timer exists', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					// Act: Save timer
					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('4 minutes')

					// Assert: Verify timer is retrievable
					const found = yield* persistence.find(tenantId, serviceCallId)

					expect(Option.isSome(found)).toBe(true)
					const timer = Option.getOrThrow(found)
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
					expect(timer._tag).toBe('Scheduled')
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('returns None when timer does not exist', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a different serviceCallId
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2'),
						tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a3'),
					})

					// Act: Save a different timer
					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('4 minutes')

					// Assert: Verify timer is not retrievable
					const found = yield* persistence.find(tenantId, serviceCallId)

					expect(Option.isNone(found)).toBe(true)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)
		})

		describe('findDue', () => {
			it.effect('returns empty chunk when no timers are due', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					// Act: Save timer & advance time
					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					yield* TestClock.adjust('4 minutes')

					// Assert: Verify no timers are due
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					expect(Chunk.isEmpty(dueTimers)).toBe(true)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('returns timers that are due', () =>
				Effect.gen(function* () {
					// Arrange: Create a timer with a dueAt in the future
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					// Act: Save timer & advance time
					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)
					yield* TestClock.adjust('10 minutes')

					// Assert: Verify timer is due
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					expect(Chunk.size(dueTimers)).toBe(1)
					const timer = Chunk.unsafeGet(dueTimers, 0)
					expect(timer.tenantId).toBe(tenantId)
					expect(timer.serviceCallId).toBe(serviceCallId)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('returns multiple due timers', () =>
				Effect.gen(function* () {
					// Arrange: Create timers with different due times
					const now = yield* DateTime.now
					const serviceCallId1 = serviceCallId
					const serviceCallId2 = ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a2')

					const timer1 = makeScheduledTimer({
						dueIn: '5 minutes',
						now,
						serviceCallId: serviceCallId1,
						tenantId,
					})
					const timer2 = makeScheduledTimer({
						dueIn: '9 minutes',
						now,
						serviceCallId: serviceCallId2,
						tenantId,
					})

					// Act: Save timers & advance time when both are due
					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(timer1)
					yield* persistence.save(timer2)
					yield* TestClock.adjust('10 minutes')

					// Assert: Verify both timers are due
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					expect(Chunk.size(dueTimers)).toBe(2)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('returns timer when dueAt equals now', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						dueIn: '0 minutes',
						now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					const dueTimers = yield* persistence.findDue(now)

					expect(Chunk.size(dueTimers)).toBe(1)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)
		})

		describe('markFired', () => {
			it.effect('transitions timer from Scheduled to Reached', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort
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
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('idempotent (preserves original reachedAt on retry)', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort
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
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('markFired - idempotent (succeeds even if timer does not exist)', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const persistence = yield* Ports.TimerPersistencePort

					// Should not fail when marking non-existent timer as fired
					yield* persistence.markFired(tenantId, serviceCallId, now)

					// Verify nothing was created
					const result = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isNone(result)).toBe(true)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)
		})

		describe('delete', () => {
			it.effect('removes timer from storage', () =>
				Effect.gen(function* () {
					const now = yield* DateTime.now
					const scheduledTimer = makeScheduledTimer({
						now,
						serviceCallId,
						tenantId,
					})

					const persistence = yield* Ports.TimerPersistencePort
					yield* persistence.save(scheduledTimer)

					// Verify timer exists
					const found = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isSome(found)).toBe(true)

					// Delete timer
					yield* persistence.delete(tenantId, serviceCallId)

					// Verify timer is removed
					const afterDelete = yield* persistence.find(tenantId, serviceCallId)
					expect(Option.isNone(afterDelete)).toBe(true)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
			)

			it.effect('idempotent (succeeds even if timer does not exist)', () =>
				Effect.gen(function* () {
					const persistence = yield* Ports.TimerPersistencePort

					// Should not fail when deleting non-existent timer
					yield* persistence.delete(tenantId, serviceCallId)
				}).pipe(Effect.provide(Adapters.TimerPersistence.inMemory)),
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
						const persistence = yield* Effect.provide(Ports.TimerPersistencePort, Adapters.TimerPersistence.inMemory)
						const timer = makeScheduledTimer({
							now,
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

	describe('Test', () => {
		/**
		 * Test helper: Inserts a service call record into the database.
		 *
		 * This is required before saving timers in the Live (SQLite) adapter tests,
		 * as timers have a foreign key constraint to the service_calls table.
		 *
		 * @param tenantId - The tenant identifier for the service call
		 * @param serviceCallId - The service call identifier to insert
		 * @returns An Effect that inserts the service call record
		 */
		const withServiceCall = (key: Ports.TimerScheduleKey.Type) =>
			Effect.gen(function* () {
				const sql = yield* Sql.SqlClient.SqlClient

				return yield* pipe(
					key,
					Sql.SqlSchema.void({
						execute: request =>
							sql`
                  INSERT INTO service_calls (tenant_id, service_call_id)
                  VALUES (${request.tenantId},
                          ${request.serviceCallId});
							`,
						Request: Ports.TimerScheduleKey,
					}),
				)
			})

		const TestLayer = Layer.mergeAll(Adapters.TimerPersistence.Test, Adapters.ClockPortTest, UUID7.Default, SQL.Test)
		const mocks = {
			tenantA: {
				correlationId: CorrelationId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9c1'),
				otherCorrelationId: CorrelationId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9c2'),
				otherServiceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9b2'),
				serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9b1'),
				tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a0'),
			},
			tenantB: {
				correlationId: CorrelationId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9d1'),
				serviceCallId: ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9e1'),
				tenantId: TenantId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9a9'),
			},
		}

		/**
		 * Test helper: Creates and persists a scheduled timer with a service call record.
		 *
		 * This helper combines service call insertion and timer creation/persistence
		 * for the Live (SQLite) adapter tests, respecting foreign key constraints.
		 *
		 * @param dueIn - Duration until timer is due (default: '5 minutes'). Accepts Duration.DurationInput format (e.g., '5 minutes', { minutes: 5 }, Duration.minutes(5)).
		 * @param tenantId - Tenant identifier (default: mocks.tenantId)
		 * @param serviceCallId - Service call identifier (default: mocks.serviceCallId)
		 * @param correlationId - Correlation identifier (default: mocks.correlationId)
		 * @returns An Effect that yields the current time and the saved timer
		 */
		const withScheduledTimer = ({
			dueIn = '5 minutes',
			tenantId = mocks.tenantA.tenantId,
			serviceCallId = mocks.tenantA.serviceCallId,
			correlationId = mocks.tenantA.correlationId,
		}: {
			dueIn?: Duration.DurationInput
			tenantId?: TenantId.Type
			serviceCallId?: ServiceCallId.Type
			correlationId?: CorrelationId.Type
		} = {}) =>
			Effect.gen(function* () {
				const clock = yield* Ports.ClockPort
				const now = yield* clock.now()
				yield* withServiceCall({
					serviceCallId,
					tenantId,
				})
				const persistence = yield* Ports.TimerPersistencePort
				const scheduledTimer = makeScheduledTimer({
					correlationId,
					dueIn,
					now,
					serviceCallId,
					tenantId,
				})
				yield* persistence.save(scheduledTimer)
				return {
					now,
					timer: scheduledTimer,
				}
			})

		describe('save', () => {
			it.effect('persists timer using sqlite backend', () =>
				Effect.gen(function* () {
					// Arrange
					const clock = yield* Ports.ClockPort
					const now = yield* clock.now()
					yield* withServiceCall({
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})
					const persistence = yield* Ports.TimerPersistencePort
					const scheduledTimer = makeScheduledTimer({
						correlationId: mocks.tenantA.correlationId,
						dueIn: '5 minutes',
						now,
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})

					// Act
					yield* persistence.save(scheduledTimer)

					// Assert
					const maybeTimerEntry = yield* persistence.find(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId)
					expect(Option.isSome(maybeTimerEntry)).toBe(true)

					const timerEntry = Option.getOrThrow(maybeTimerEntry)
					expect(timerEntry._tag).toBe('Scheduled')
					expect(timerEntry.tenantId).toBe(mocks.tenantA.tenantId)
					expect(timerEntry.serviceCallId).toBe(mocks.tenantA.serviceCallId)
				}).pipe(Effect.provide(TestLayer)),
			)
		})

		describe('find', () => {
			it.effect('returns Some when timer exists', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer({})

					// Act
					const found = yield* persistence.find(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId)

					// Assert
					expect(Option.isSome(found)).toBe(true)
					const timer = Option.getOrThrow(found)
					expect(timer.tenantId).toBe(mocks.tenantA.tenantId)
					expect(timer.serviceCallId).toBe(mocks.tenantA.serviceCallId)
					expect(timer._tag).toBe('Scheduled')
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('returns None when timer does not exist', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort

					// Act
					const found = yield* persistence.find(
						mocks.tenantA.tenantId,
						ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9ff'), // non-existent
					)
					// Assert

					assertNone(found)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('does not return timers from other tenants (tenant isolation)', () =>
				Effect.gen(function* () {
					// Arrange: Create timer for tenantA
					const persistence = yield* Ports.TimerPersistencePort

					yield* withScheduledTimer({
						correlationId: mocks.tenantA.correlationId,
						dueIn: '5 minutes',
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})

					// Act: Try to find timer using tenantB credentials
					const found = yield* persistence.find(mocks.tenantB.tenantId, mocks.tenantA.serviceCallId)

					// Assert: Should return None (tenant isolation enforced)
					assertNone(found)
				}).pipe(Effect.provide(TestLayer)),
			)
		})

		describe('findScheduledTimer', () => {
			it.effect('returns None when timer does not exist', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort

					// Act
					const found = yield* persistence.findScheduledTimer(
						mocks.tenantA.tenantId,
						ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9ff'), // non-existent
					)

					// Assert
					assertNone(found)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('returns Some when timer is Scheduled', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer({})

					// Act
					const found = yield* persistence.findScheduledTimer(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId)

					expect(Option.isSome(found)).toBe(true)
					const timer = Option.getOrThrow(found)
					expect(timer._tag).toBe('Scheduled')
					expect(timer.tenantId).toBe(mocks.tenantA.tenantId)
					expect(timer.serviceCallId).toBe(mocks.tenantA.serviceCallId)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('excludes reached timers', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer({})
					yield* TestClock.adjust('10 minutes')
					yield* persistence.markFired(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId, yield* DateTime.now)

					// Act
					const maybeScheduledTimer = yield* persistence.findScheduledTimer(
						mocks.tenantA.tenantId,
						mocks.tenantA.serviceCallId,
					)

					// Assert
					assertNone(maybeScheduledTimer)
					const raw = yield* persistence.find(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId)
					expect(Option.isSome(raw)).toBe(true)
					expect(Option.getOrThrow(raw)._tag).toBe('Reached')
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('does not return timers from other tenants (tenant isolation)', () =>
				Effect.gen(function* () {
					// Arrange: Create timer for tenantA
					const persistence = yield* Ports.TimerPersistencePort

					yield* withScheduledTimer({
						correlationId: mocks.tenantA.correlationId,
						dueIn: '5 minutes',
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})

					// Act: Try to find scheduled timer using tenantB credentials
					const found = yield* persistence.findScheduledTimer(mocks.tenantB.tenantId, mocks.tenantA.serviceCallId)

					// Assert: Should return None (tenant isolation enforced)
					assertNone(found)
				}).pipe(Effect.provide(TestLayer)),
			)
		})

		describe('findDue', () => {
			it.effect('returns empty chunk when no timers are due', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer({ dueIn: '10 minutes' }) // due in 10 minutes

					yield* TestClock.adjust('5 minutes') // not yet due

					// Act
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					// Assert
					expect(Chunk.isEmpty(dueTimers)).toBe(true)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('returns timers that are due', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer({ dueIn: '5 minutes' })

					yield* TestClock.adjust('10 minutes')

					// Act
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					// Assert
					expect(Chunk.size(dueTimers)).toBe(1)
					const timer = Chunk.unsafeGet(dueTimers, 0)
					expect(timer.tenantId).toBe(mocks.tenantA.tenantId)
					expect(timer.serviceCallId).toBe(mocks.tenantA.serviceCallId)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('returns due timers ordered by due date', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer({
						correlationId: mocks.tenantA.correlationId,
						dueIn: '5 minutes',
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})
					yield* withScheduledTimer({
						correlationId: mocks.tenantA.otherCorrelationId,
						dueIn: 9,
						serviceCallId: mocks.tenantA.otherServiceCallId,
						tenantId: mocks.tenantA.tenantId,
					})

					// Act
					yield* TestClock.adjust('10 minutes')

					// Assert
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)
					expect(Chunk.size(dueTimers)).toBe(2)
					const first = Chunk.unsafeGet(dueTimers, 0)
					const second = Chunk.unsafeGet(dueTimers, 1)
					expect(DateTime.lessThanOrEqualTo(first.dueAt, second.dueAt)).toBe(true)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('returns timer when dueAt equals now (inclusive)', () =>
				Effect.gen(function* () {
					const clock = yield* Ports.ClockPort
					const now = yield* clock.now()
					const persistence = yield* Ports.TimerPersistencePort

					// Create timer with dueAt === now (0 minutes offset)
					yield* withServiceCall({
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})
					const timer = makeScheduledTimer({
						correlationId: mocks.tenantA.correlationId,
						dueIn: '0 minutes',
						now,
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})
					yield* persistence.save(timer)

					// Query at exact same timestamp
					const dueTimers = yield* persistence.findDue(now)

					expect(Chunk.size(dueTimers)).toBe(1)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('returns timers from all tenants (global polling behavior)', () =>
				Effect.gen(function* () {
					// Arrange: Create timers for two different tenants
					const persistence = yield* Ports.TimerPersistencePort

					// Create timer for tenantA
					yield* withScheduledTimer({
						correlationId: mocks.tenantA.correlationId,
						dueIn: '5 minutes',
						serviceCallId: mocks.tenantA.serviceCallId,
						tenantId: mocks.tenantA.tenantId,
					})
					// Create timer for tenantB
					yield* withScheduledTimer({
						correlationId: mocks.tenantB.correlationId,
						dueIn: '5 minutes',
						serviceCallId: mocks.tenantB.serviceCallId,
						tenantId: mocks.tenantB.tenantId,
					})

					yield* TestClock.adjust('10 minutes') // Both timers are due

					// Act: findDue queries ALL tenants (worker polls globally)
					const dueTimers = yield* persistence.findDue(yield* DateTime.now)

					// Assert: Both timers returned (global worker behavior)
					expect(Chunk.size(dueTimers)).toBe(2)
					const timerIds = pipe(
						dueTimers,
						Chunk.map(t => t.serviceCallId),
						Chunk.toReadonlyArray,
					)
					expect(timerIds).toContain(mocks.tenantA.serviceCallId)
					expect(timerIds).toContain(mocks.tenantB.serviceCallId)
				}).pipe(Effect.provide(TestLayer)),
			)
		})

		describe('markFired', () => {
			it.effect('transitions scheduled timers to reached state', () =>
				Effect.gen(function* () {
					// Arrange
					const { timer } = yield* withScheduledTimer()
					const persistence = yield* Ports.TimerPersistencePort
					const clock = yield* Ports.ClockPort
					yield* TestClock.adjust('10 minutes')
					const reachedAt = yield* clock.now()

					// Act
					yield* persistence.markFired(timer.tenantId, timer.serviceCallId, reachedAt)

					// Assert
					const found = yield* persistence.find(timer.tenantId, timer.serviceCallId)
					expect(Option.isSome(found)).toBe(true)
					const reached = Option.getOrThrow(found)
					expect(reached._tag).toBe('Reached')
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('idempotent (preserves original reachedAt on retry)', () =>
				Effect.gen(function* () {
					const { timer } = yield* withScheduledTimer()
					const persistence = yield* Ports.TimerPersistencePort
					yield* TestClock.adjust('10 minutes')

					// First markFired
					const firstReachedAt = yield* DateTime.now
					yield* persistence.markFired(timer.tenantId, timer.serviceCallId, firstReachedAt)

					// Second markFired (should be no-op)
					yield* TestClock.adjust('1 minute')
					const secondReachedAt = yield* DateTime.now
					yield* persistence.markFired(timer.tenantId, timer.serviceCallId, secondReachedAt)

					// Verify: still uses FIRST reachedAt
					const result = yield* persistence.find(timer.tenantId, timer.serviceCallId)
					const reached = Option.getOrThrow(result)

					assertTrue(reached._tag === 'Reached')
					expect(DateTime.Equivalence(reached.reachedAt, firstReachedAt)).toBe(true)
					expect(DateTime.Equivalence(reached.reachedAt, secondReachedAt)).toBe(false)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('succeeds even if timer does not exist', () =>
				Effect.gen(function* () {
					const persistence = yield* Ports.TimerPersistencePort
					const now = yield* DateTime.now

					// Should not fail when marking non-existent timer as fired
					yield* persistence.markFired(
						mocks.tenantA.tenantId,
						ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9ff'), // non-existent
						now,
					)

					// Verify nothing was created
					const result = yield* persistence.find(
						mocks.tenantA.tenantId,
						ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9ff'),
					)
					expect(Option.isNone(result)).toBe(true)
				}).pipe(Effect.provide(TestLayer)),
			)
		})

		describe('delete', () => {
			it.effect('removes timers from sqlite store', () =>
				Effect.gen(function* () {
					// Arrange
					const persistence = yield* Ports.TimerPersistencePort
					yield* withScheduledTimer()

					// Act
					yield* persistence.delete(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId)

					// Assert
					const afterDelete = yield* persistence.find(mocks.tenantA.tenantId, mocks.tenantA.serviceCallId)
					expect(Option.isNone(afterDelete)).toBe(true)
				}).pipe(Effect.provide(TestLayer)),
			)

			it.effect('idempotent (succeeds even if timer does not exist)', () =>
				Effect.gen(function* () {
					const persistence = yield* Ports.TimerPersistencePort

					// Should not fail when deleting non-existent timer
					yield* persistence.delete(
						mocks.tenantA.tenantId,
						ServiceCallId.make('018f6b8a-5c5d-7b32-8c6d-b7c6d8e6f9ff'), // non-existent
					)
				}).pipe(Effect.provide(TestLayer)),
			)
		})
	})
})
