# Contract surfaces

Read only the sections matching boundary crossings in the impact map.

## API or RPC

- operation identity, caller, request/response fields and invariants;
- validation, error taxonomy, status/code mapping, retryability and idempotency;
- authentication, authorization, rate/capacity limits and sensitive fields;
- versioning, deprecation, old/new caller compatibility and contract tests.

## Event or message

- event meaning, owner, producer, consumers and schema version;
- delivery guarantee, ordering scope, duplication, replay and poison behavior;
- partition/routing key, correlation/idempotency identity and evolution rules;
- consumer compatibility evidence and coordinated versus independent rollout.

## Data or schema

- owner, semantics, constraints, null/default behavior and existing-row treatment;
- readers/writers, transaction/consistency assumptions and retention;
- expand/migrate/contract sequence, coexistence window and rollback boundary;
- old-code/new-schema and new-code/old-data verification.

## External integration

- ownership on both sides, protocol, credentials, limits and availability expectation;
- timeout, retry, duplicate, partial failure and reconciliation semantics;
- sandbox/certification evidence, version lifecycle and support escalation.

## Security

- principal identity and trust boundary;
- authorization decision and enforcement point;
- data classification, minimization, audit and prohibited disclosure;
- negative cases and accountable security/compliance approval.

## Operational or SLO

- service level indicator, population/window and target;
- telemetry names, alert ownership, diagnosis and recovery obligation;
- capacity envelope, degradation behavior and dependency budget.

## Acceptance check

A contract is acceptable when an independent party can answer: what may I send or rely on, what can
fail, what must I do then, which versions coexist, who owns it, and what evidence proves compatibility.
