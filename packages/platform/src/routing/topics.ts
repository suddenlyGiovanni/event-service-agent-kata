/**
 * Centralized topic/routing configuration
 *
 * Topic Naming Convention:
 * - Format: {module}.{message-class}
 * - Examples: timer.commands, orchestration.events
 *
 * Routing Strategy:
 * - Module-level topics (all commands/events for a module)
 * - Consumers filter by envelope.type discriminator
 * - Multi-tenancy via broker partition keys (not separate topics)
 *
 * Evolution Path:
 * - Can add message-level sub-topics later if needed
 * - Structure allows: Topics.Timer.Commands.ScheduleTimer
 *
 * @see ADR-0002 for broker choice and partitioning strategy
 * @see packages/schemas/src/messages/ for message schemas
 */
export namespace Topics {
	const commands = 'commands' as const
	const events = 'events' as const

	/**
	 * Timer module topics
	 *
	 * @example
	 * ```typescript ignore
	 * // Subscribe to timer commands
	 * bus.subscribe([Topics.Timer.Commands], handler)
	 *
	 * // Publish timer event
	 * bus.publish([envelope]) // envelope.type determines routing
	 * ```
	 */
	export namespace Timer {
		const timer = 'timer' as const
		/**
		 * Commands consumed by Timer module
		 * - ScheduleTimer (from Orchestration)
		 */
		export const Commands = `${timer}.${commands}` as const

		/**
		 * Events published by Timer module
		 * - DueTimeReached (to Orchestration)
		 */
		export const Events = `${timer}.${events}` as const

		/** All Timer module topics */
		export type Topic = typeof Commands | typeof Events
	}

	/**
	 * Orchestration module topics
	 */
	export namespace Orchestration {
		const orchestration = 'orchestration' as const
		/**
		 * Commands consumed by Orchestration module
		 * (None in MVP)
		 */
		export const Commands = `${orchestration}.${commands}` as const

		/**
		 * Events published by Orchestration module
		 * - ServiceCallSubmitted
		 * - ServiceCallScheduled
		 * - ServiceCallRunning
		 * - ServiceCallSucceeded
		 * - ServiceCallFailed
		 */
		export const Events = `${orchestration}.${events}` as const

		/** All Orchestration module topics */
		export type Topic = typeof Commands | typeof Events
	}

	/**
	 * Execution module topics
	 */
	export namespace Execution {
		const execution = 'execution' as const
		/**
		 * Events published by Execution module
		 * - ExecutionStarted
		 * - ExecutionSucceeded
		 * - ExecutionFailed
		 */
		export const Events = `${execution}.${events}` as const

		/** All Execution module topics */
		export type Topic = typeof Events
	}

	/**
	 * API module topics
	 */
	export namespace Api {
		const api = 'api' as const
		/**
		 * Commands from API module
		 * - SubmitServiceCall (to Orchestration)
		 */
		export const Commands = `${api}.${commands}` as const

		/** All API module topics */
		export type Topic = typeof Commands
	}

	/**
	 * Valid topic type (compile-time validation)
	 *
	 * Use this type to validate topic strings at compile time.
	 * Broker adapters can use this to ensure only valid topics are subscribed to.
	 *
	 * @example
	 * ```typescript ignore
	 * function subscribe(topic: Topics.Type) {
	 *   // TypeScript ensures only valid topics
	 * }
	 * subscribe(Topics.Timer.Commands) // ✅
	 * subscribe('invalid.topic')       // ❌ Compile error
	 * ```
	 */
	export type Type = Timer.Topic | Orchestration.Topic | Execution.Topic | Api.Topic

	/**
	 * Canonical list of all topics
	 *
	 * Enables runtime iteration over all known topics for configuration,
	 * validation, and adapter setup.
	 */
	export const All: ReadonlyArray<Type> = [
		Timer.Commands,
		Timer.Events,
		Orchestration.Commands,
		Orchestration.Events,
		Execution.Events,
		Api.Commands,
	] as const

	/**
	 * Runtime type guard for topic validation
	 *
	 * @param t - String to validate
	 * @returns True if t is a valid topic
	 */
	export const isTopic = (t: string): t is Type => (All as ReadonlyArray<string>).includes(t)

	/**
	 * Module names for type-safe metadata
	 */
	export type Module = 'Api' | 'Orchestration' | 'Execution' | 'Timer'

	/**
	 * Metadata shape for a topic
	 *
	 * Defines the structure of metadata for each topic:
	 * - producer: Which module publishes to this topic (null if external/user-initiated)
	 * - consumers: Which module(s) subscribe to this topic
	 * - description: Human-readable description of the topic's purpose
	 */
	type TopicMetadata = Readonly<{
		producer: Module | null
		consumers: ReadonlyArray<Module>
		description: string
	}>

	/**
	 * Topic metadata for documentation and tooling
	 *
	 * Provides human-readable information about each topic:
	 * - description: What messages flow through this topic
	 * - producer: Which module publishes to this topic
	 * - consumers: Which module(s) subscribe to this topic
	 *
	 * This metadata is optional but useful for:
	 * - Generated documentation
	 * - Runtime introspection
	 * - Debugging routing issues
	 *
	 * The `satisfies` clause ensures all topics have complete metadata.
	 */
	export const Metadata = {
		[Timer.Commands]: {
			consumers: ['Timer'],
			description: 'Commands consumed by Timer module (e.g., ScheduleTimer)',
			producer: 'Orchestration',
		},
		[Timer.Events]: {
			consumers: ['Orchestration'],
			description: 'Events published by Timer module (e.g., DueTimeReached)',
			producer: 'Timer',
		},
		[Orchestration.Commands]: {
			consumers: ['Orchestration'],
			description: 'Commands consumed by Orchestration module (none in MVP)',
			producer: null,
		},
		[Orchestration.Events]: {
			consumers: ['Timer', 'Execution'],
			description: 'Events published by Orchestration module (e.g., ServiceCallScheduled, ServiceCallSubmitted)',
			producer: 'Orchestration',
		},
		[Execution.Events]: {
			consumers: ['Orchestration'],
			description: 'Events published by Execution module (e.g., ExecutionStarted, ExecutionSucceeded)',
			producer: 'Execution',
		},
		[Api.Commands]: {
			consumers: ['Orchestration'],
			description: 'Commands from API module (e.g., SubmitServiceCall)',
			producer: 'Api',
		},
	} as const satisfies Record<Type, TopicMetadata>
}
