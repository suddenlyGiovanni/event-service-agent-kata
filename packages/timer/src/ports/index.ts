/**
 * Timer Module Ports
 *
 * Port interfaces that the Timer module depends on, following hexagonal architecture principles (dependency inversion).
 *
 * Ports defined here:
 *
 * - ClockPort: Time operations (current time)
 * - TimerPersistencePort: Timer storage operations
 *
 * Ports reused from platform:
 *
 * - EventBusPort: Message publishing/subscribing
 *
 * Usage in Timer module:
 *
 * - Command handlers depend on these ports
 * - Polling worker depends on these ports
 * - Adapters implement these interfaces (in-memory, SQLite, etc.)
 */

// Re-export EventBusPort from platform for convenience
export {
	EventBusPort,
	type EventBusPort as EventBusPortType,
	PublishError,
	SubscribeError,
} from '@event-service-agent/platform/ports'

export * from './clock.port.ts'
export * from './timer-event-bus.port.ts'
export * from './timer-persistence.port.ts'
