/**
 * Ports - Domain-facing interfaces for external dependencies
 *
 * Ports define what the domain needs without specifying how it's implemented.
 * Adapters provide concrete implementations for different technologies.
 */

export * from './event-bus.port.ts'
export * from './uuid.port.ts'
