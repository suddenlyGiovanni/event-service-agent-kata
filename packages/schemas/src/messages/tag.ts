/**
 * biome-ignore-all lint/style/useNamingConvention: Tag names intentionally use PascalCase
 * 	to match canonical message contracts and broker routing keys. Renaming would break
 * 	runtime consumers and the `as const satisfies Modules` type shape.
 */
import type { ReadonlyRecord } from 'effect/Record'

import { SubmitServiceCall } from './api/commands.schema.ts'
import { ExecutionFailed, ExecutionStarted, ExecutionSucceeded } from './execution/events.schema.ts'
import { ScheduleTimer, StartExecution } from './orchestration/commands.schema.ts'
import {
	ServiceCallFailed,
	ServiceCallRunning,
	ServiceCallScheduled,
	ServiceCallSubmitted,
	ServiceCallSucceeded,
} from './orchestration/events.schema.ts'
import { DueTimeReached } from './timer/events.schema.ts'

export const Tag = {
	Api: {
		Commands: {
			SubmitServiceCall: SubmitServiceCall.Tag,
		},
	},
	Execution: {
		Events: {
			ExecutionFailed: ExecutionFailed.Tag,
			ExecutionStarted: ExecutionStarted.Tag,
			ExecutionSucceeded: ExecutionSucceeded.Tag,
		},
	},
	Orchestration: {
		Commands: {
			ScheduleTimer: ScheduleTimer.Tag,
			StartExecution: StartExecution.Tag,
		},
		Events: {
			ServiceCallFailed: ServiceCallFailed.Tag,
			ServiceCallRunning: ServiceCallRunning.Tag,
			ServiceCallScheduled: ServiceCallScheduled.Tag,
			ServiceCallSubmitted: ServiceCallSubmitted.Tag,
			ServiceCallSucceeded: ServiceCallSucceeded.Tag,
		},
	},
	Timer: {
		Events: {
			DueTimeReached: DueTimeReached.Tag,
		},
	},
} as const satisfies Modules

type Dictionary<T extends string> = ReadonlyRecord<T, T>
type Command = 'Commands'
type Event = 'Events'
type Module = 'Api' | 'Execution' | 'Orchestration' | 'Timer'
type Modules = ReadonlyRecord<
	Module,
	| ReadonlyRecord<Event, Dictionary<string>>
	| ReadonlyRecord<Command, Dictionary<string>>
	| ReadonlyRecord<Event | Command, Dictionary<string>>
>
type ExtractTags<K extends Event | Command, M> = M extends ReadonlyRecord<K, Dictionary<infer T>> ? T : never
type ExtractModuleTags<M> = ExtractTags<Event, M> | ExtractTags<Command, M>
type ExtractModule<M extends Modules> = M[keyof M]

export type Tag = ExtractModuleTags<ExtractModule<typeof Tag>>
