import * as Api from './api/index.ts'
import * as Execution from './execution/index.ts'
import * as Orchestration from './orchestration/index.ts'
import * as Timer from './timer/index.ts'

export type Tag =
	| Api.Commands.Tag
	| Execution.Events.Tag
	| Orchestration.Events.Tag
	| Orchestration.Commands.Tag
	| Timer.Events.Tag

export { Api, Execution, Orchestration, Timer }
