import * as Platform from '@effect/platform'
import * as PlatformBun from '@effect/platform-bun'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import { PollingWorkerRequests } from '../worker-protocol/polling.worker-requests.ts'
import * as PollingWorker from '../workers/polling.worker.ts'

const RunnerLive = Effect.gen(function* () {
	const state = yield* Ref.make(Option.none<Fiber.RuntimeFiber<unknown, unknown>>())

	return Platform.WorkerRunner.layerSerialized(PollingWorkerRequests, {
		StartPolling: Effect.fn(function* () {
			const current = yield* Ref.get(state)
			if (Option.isSome(current)) {
				return { didTransition: false, state: 'Running' } as const
			}

			const fiber = yield* Effect.fork(PollingWorker.run)

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
}).pipe(
	(_) => _,
	Layer.effectDiscard,
	(_) => _,
)

pipe(
	RunnerLive,
	Layer.provide(PlatformBun.BunWorkerRunner.layer),
	PlatformBun.BunWorkerRunner.launch,
	PlatformBun.BunRuntime.runMain,
)
