# ADR-0007: API HTTP Mapping

Status: Proposed

Problem

- Define HTTP semantics (status codes, headers, errors) for the API surface of the Service Agent.

Context

- Submission is asynchronous. The system assigns or derives a `serviceCallId` and processes via Orchestration and broker.

Options

1. 202 Accepted on submit with `Location: /tenants/{tenantId}/service-calls/{serviceCallId}`; 409 on idempotency violation.
2. 201 Created when idempotency claims immediate resource creation; still 202 for processing.

Decision (TBD)

- Use 202 Accepted with Location and echo of `serviceCallId` in body. 400 for validation errors; 409 when idempotencyKey conflicts across payloads.
- List supports filters: `status`, `tags`, `from`, `to`, pagination via `cursor`.
- Errors follow RFC 7807 (problem+json) with correlationId.

Consequences (TBD)

- Predictable async API; clients can poll or subscribe; consistent errors.
