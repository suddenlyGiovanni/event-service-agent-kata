import * as Duration from 'effect/Duration'
import * as Schema from 'effect/Schema'

export class StartPolling extends Schema.TaggedRequest<StartPolling>()('StartPolling', {
	failure: Schema.Never,
	payload: {
		pollIntervalMs: Schema.optionalWith(Schema.DurationFromMillis, {
			default: () => Duration.decode('5  seconds'),
		}),
	},
	success: Schema.Struct({
		started: Schema.Boolean,
	}),
}) {}

export class StopPolling extends Schema.TaggedRequest<StopPolling>()('StopPolling', {
	failure: Schema.Never,
	payload: {},
	success: Schema.Struct({
		stopped: Schema.Boolean,
	}),
}) {}

export const PollingWorkerRequests = Schema.Union(StartPolling, StopPolling)
