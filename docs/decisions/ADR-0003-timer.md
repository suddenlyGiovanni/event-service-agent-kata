# ADR-0003: Timer Strategy

Status: Proposed

Problem

- Decide how to implement due-time wake-ups with at-least-once semantics.

Context

- If the broker supports delayed messages, prefer delegation; otherwise maintain a durable timer service.

Options

1. Broker-native delays (e.g., NATS JetStream, RabbitMQ delayed exchange).
2. Minimal durable timer service publishing `DueTimeReached` to the broker.
3. Kafka/Redpanda delay-topic pattern or external scheduler.

Decision (TBD)

- MVP delegates when supported; otherwise plan a small durable scheduler; Orchestration guards start.

Consequences (TBD)

- Simpler ops with broker-native delays; otherwise an extra small service is added.
