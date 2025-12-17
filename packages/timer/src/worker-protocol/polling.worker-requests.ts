import * as Duration from 'effect/Duration'
import * as Schema from 'effect/Schema'

const PollingState = Schema.Literal('Running', 'Stopped')

const Success = Schema.Struct({
	didTransition: Schema.Boolean,
	state: PollingState,
})

export class StartPolling extends Schema.TaggedRequest<StartPolling>()('StartPolling', {
	failure: Schema.Never,
	payload: {
		pollInterval: Schema.optionalWith(Schema.DurationFromMillis, {
			default: () => Duration.decode('5  seconds'),
		}),
	},
	success: Success,
}) {}

export class StopPolling extends Schema.TaggedRequest<StopPolling>()('StopPolling', {
	failure: Schema.Never,
	payload: {},
	success: Success,
}) {}

export const PollingWorkerRequests = Schema.Union(StartPolling, StopPolling)
