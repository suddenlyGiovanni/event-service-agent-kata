/**
 * Ports - Domain-facing interfaces for external dependencies
 *
 * Ports define what the domain needs without specifying how it's implemented.
 * Adapters provide concrete implementations for different technologies.
 */

export { EventBusPort, PublishError, SubscribeError } from './event-bus.port.ts'
export { UUIDPort } from './uuid.port.ts'
