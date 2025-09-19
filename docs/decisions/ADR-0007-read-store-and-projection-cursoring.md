# ADR-0007: Read store and projection cursoring

Status: Proposed
Date: 2025-09-19

## Problem

We need a read-side storage approach and a projection cursoring mechanism that support idempotent upserts, per-tenant partitioning, and resumable processing after restarts. The read store choice affects query shapes, paging, and the operational simplicity of rebuilding projections.

## Context

- Projections consume domain events in order and upsert read models.
- Cursor/position must be persisted per projection.
- Queries must filter by tenant and support basic filters/pagination.
