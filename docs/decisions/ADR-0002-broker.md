# ADR-0002: Message Broker Family (dev/prod)

Status: Proposed

Problem

- Select a broker used consistently across dev/CI/prod to provide per-aggregate ordering and at-least-once delivery.

Context

- Ordering key: `tenantId.serviceCallId`. Consumers must be idempotent. Broker choice affects timer capabilities and observability.

Options

1. Kafka/Redpanda: strong partition ordering and durability; heavier ops; no native per-message delay.
2. NATS JetStream: lightweight ops; ordered streams, delayed messages; strong dev ergonomics.
3. RabbitMQ: flexible routing; delayed-exchange plugin; ordering not guaranteed across queues.

Decision (TBD)

- Select one family for all environments; provide a dev Compose setup; keep `EventBusPort` neutral.

Consequences (TBD)

- Timer strategy depends on this choice; observability and tooling align with the broker ecosystem.
