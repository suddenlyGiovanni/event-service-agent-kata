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

export type Tag =
	| typeof ServiceCallFailed.Tag
	| typeof ServiceCallRunning.Tag
	| typeof ServiceCallScheduled.Tag
	| typeof ServiceCallSubmitted.Tag
	| typeof ServiceCallSucceeded.Tag
	| typeof DueTimeReached.Tag
	| typeof ScheduleTimer.Tag
	| typeof StartExecution.Tag
	| typeof ExecutionFailed.Tag
	| typeof ExecutionStarted.Tag
	| typeof ExecutionSucceeded.Tag
	| typeof SubmitServiceCall.Tag
