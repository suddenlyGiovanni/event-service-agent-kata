/**
 * biome-ignore-all lint/style/useNamingConvention: Disabled because message tag names intentionally
 * 	use PascalCase string literals to match the canonical message contracts used across modules and the broker routing keys.
 * 	Renaming would break runtime consumers and the `as const satisfies Modules` type shape.
 * 	See `docs/design/messages.md` and ADR-0002.
 */
import type { ReadonlyRecord } from 'effect/Record'

export const Tag = {
	Api: {
		Commands: {
			SubmitServiceCall: 'SubmitServiceCall',
		},
	},
	Execution: {
		Events: {
			ExecutionFailed: 'ExecutionFailed',
			ExecutionStarted: 'ExecutionStarted',
			ExecutionSucceeded: 'ExecutionSucceeded',
		},
	},
	Orchestration: {
		Commands: {
			ScheduleTimer: 'ScheduleTimer',
			StartExecution: 'StartExecution',
		},
		Events: {
			ServiceCallFailed: 'ServiceCallFailed',
			ServiceCallRunning: 'ServiceCallRunning',
			ServiceCallScheduled: 'ServiceCallScheduled',
			ServiceCallSubmitted: 'ServiceCallSubmitted',
			ServiceCallSucceeded: 'ServiceCallSucceeded',
		},
	},
	Timer: {
		Events: {
			DueTimeReached: 'DueTimeReached',
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
