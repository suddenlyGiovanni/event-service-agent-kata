/**
 * Platform Adapters — Infrastructure implementations for platform ports
 *
 * This module exports adapter namespaces that provide concrete implementations of platform port interfaces.
 * Adapters bridge the gap between domain abstractions (ports) and infrastructure technologies.
 *
 * Available adapters:
 *
 * - {@link UUID} — UUID v7 generation adapters (Bun native, fixed test values, sequential test values)
 * - {@link UUID7} — High-level UUID v7 utilities
 *
 * @module @event-service-agent/platform/adapters
 * @see {@link ../../docs/design/hexagonal-architecture-layers.md} for adapter pattern guidelines
 */

export * from './uuid.adapter.ts'
export * from './uuid7.adapter.ts'
