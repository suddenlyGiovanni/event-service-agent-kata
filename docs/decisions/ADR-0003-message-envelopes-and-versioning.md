# ADR-0003: Message envelope schema and versioning

Status: Proposed
Date: 2025-09-19

## Problem

We need a consistent envelope for commands and events to carry identity, ordering, tracing, and schema versioning metadata. The envelope fields determine how we correlate messages, preserve per-aggregate order, and evolve payloads without breaking consumers. This schema must be stable across processes and tooling.

## Context

- Broker-first communication requires uniform envelopes for all messages.
- Correlation/causation IDs are needed for observability.
- Versioning policy affects backward compatibility and rollout safety.
