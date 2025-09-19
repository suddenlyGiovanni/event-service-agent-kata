# ADR-0001: Broker choice, topics, and partitioning

Status: Proposed
Date: 2025-09-19

## Problem

We need a message broker to carry commands and domain events between bounded contexts, including internal Core communications. The choice of broker, topic taxonomy, and partitioning strategy must guarantee per-aggregate ordering, tenant scoping, consumer scaling, and the ability to support dead-letter queues. These decisions influence local development ergonomics, operational complexity, and how we express ordering and idempotency across the system.

## Context

- All inter-context communication is broker-first.
- Per-aggregate ordering is required for correctness.
- At-least-once delivery will be used; consumers must be idempotent.
- API is a separate process; Core modules communicate via the broker as well.
