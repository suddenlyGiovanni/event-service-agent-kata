# ADR-0005: API contracts (submit, list, detail) and idempotency

Status: Proposed
Date: 2025-09-19

## Problem

We need stable HTTP API contracts for submitting a service call, listing calls with filters, and retrieving details. The API must enforce tenant scoping and idempotency semantics (Idempotency-Key per tenant) while acknowledging eventual consistency of projections. These choices affect client behavior, UX, and backend guarantees.

## Context

- Multi-tenant API surface embeds `tenantId` and enforces scoping.
- Idempotency maps repeated submits to the same `serviceCallId`.
- Read models lag behind writes; responses must reflect that reality.
