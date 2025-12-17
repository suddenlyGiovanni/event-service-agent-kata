import * as Platform from '@effect/platform'
import * as PlatformBun from '@effect/platform-bun'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import { PollingWorkerRequests } from '../worker-protocol/polling.worker-requests.ts'

const RunnerLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const state = yield* Ref.make(Option.none<Fiber.Fiber<never, never>>())

		return Platform.WorkerRunner.layerSerialized(PollingWorkerRequests, {
			StartPolling: Effect.fn(function* ({ pollInterval: _pollInterval }) {
				const current = yield* Ref.get(state)
				if (Option.isSome(current)) {
					return { didTransition: false, state: 'Running' } as const
				}

				// TODO: build the polling loop (repeat pollDueTimersWorkflow, catch/log, sleep interval)
				const fiber = yield* Effect.fork(Effect.never)

				yield* Ref.set(state, Option.some(fiber))
				return { didTransition: true, state: 'Running' } as const
			}),
			StopPolling: Effect.fn(function* () {
				const current = yield* Ref.get(state)

				if (Option.isNone(current)) {
					return { didTransition: false, state: 'Stopped' } as const
				}

				yield* Fiber.interrupt(current.value)
				yield* Ref.set(state, Option.none())
				return { didTransition: true, state: 'Stopped' } as const
			}),
		})
	}),
)

pipe(
	RunnerLive,
	Layer.provide(PlatformBun.BunWorkerRunner.layer),
	PlatformBun.BunWorkerRunner.launch,
	PlatformBun.BunRuntime.runMain,
)
