# ADR-0008: Privacy, redaction, and body/header snippets

Status: Proposed
Date: 2025-09-19

## Problem

We need a consistent policy for capturing and exposing request/response metadata while protecting sensitive information. The policy must define snippet size limits, header allowlists/denylists, and redaction rules to apply before persisting events and read models.

## Context

- Events and projections include `bodySnippet` and some headers.
- Tenants may send PII; defaults must be safe.
- Policy should balance debuggability with privacy.
