# ADR-0004: Outbox for append-then-publish ordering

Status: Proposed
Date: 2025-09-19

## Problem

We must guarantee that domain events are published to the broker only after they are durably persisted in the event store, and in the same order as appended. Without an outbox pattern, failures between append and publish can cause lost or reordered events. We need a reliable, operationally simple outbox approach for the MVP.

## Context

- ES-first: Event Store is the source of truth.
- Broker distributes events to other contexts and projections.
- At-least-once delivery and idempotent consumers are assumed, but producers must not drop events.
