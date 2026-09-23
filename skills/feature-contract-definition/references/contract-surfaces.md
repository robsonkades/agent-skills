# Contract surfaces

Read only the sections matching boundary crossings in the impact map.

## API or RPC

- operation identity, caller, request/response fields and invariants;
- units, precision, time zone/clock semantics, absent versus null/default, and pagination
  or result completeness when callers depend on them;
- validation, error taxonomy, status/code mapping, retryability and idempotency;
- authentication, authorization, rate/capacity limits and sensitive fields;
- versioning, deprecation, old/new caller compatibility and contract tests.

For operations acknowledged before completion, define how terminal success/failure becomes visible,
status/result retention, behavior after expiry, and cancellation semantics if cancellation is supported.
Use the accepted interaction mechanism; route an unresolved mechanism choice back to solution analysis.
[HTTP 202](https://httpwg.org/specs/rfc9110.html#status.202) indicates acceptance for processing,
not completed processing or a guarantee of eventual success.

## Event or message

- event meaning, owner, producer, consumers and schema version;
- delivery guarantee, ordering scope, duplication, replay and poison behavior;
- partition/routing key, correlation/idempotency identity and evolution rules;
- atomicity scope of publication and business effect, acknowledgement meaning, retention and
  consumer recovery; correlation identity is not automatically an idempotency key;
- consumer compatibility evidence and coordinated versus independent rollout.

## Data or schema

- owner, semantics, constraints, null/default behavior and existing-row treatment;
- readers/writers, transaction/consistency assumptions and retention;
- expand/migrate/contract sequence, coexistence window and rollback boundary;
- old-code/new-schema and new-code/old-data verification.

Include existing rows and archived payloads in the supported-version inventory. Backfill
completion and writer cutover need observable criteria; a deployed schema does not prove
all data migrated. State what makes rollback unsafe after new writes or destructive changes.

## External integration

- ownership on both sides, protocol, credentials, limits and availability expectation;
- timeout, retry, duplicate, partial failure and reconciliation semantics;
- unknown-outcome recovery and whether repeated requests reuse an operation identity;
- sandbox/certification evidence, version lifecycle and support escalation.

Link the supplier's applicable published revision or agreement and define local integration
obligations alongside it. Separate documented guarantees from assumptions and observed behavior:
a passing sandbox test does not establish a production guarantee absent from those sources.
When required semantics are missing, record the gap and dependent work; resolve it through the
established decision/support policy rather than rewriting the provider contract. Reuse existing
agreements and authority without requiring fresh supplier approval for already supported behavior.

## Security

- principal identity and trust boundary;
- authorization decision and enforcement point;
- data classification, minimization, audit and prohibited disclosure;
- negative cases and accountable security/compliance approval.

Use the established approval policy and requirements, not an invented compliance mandate.
For a tenant boundary, include a valid identity attempting another tenant's object and define
the expected denial/non-disclosure. Keep secrets and live personal data out of contract fixtures.

## Operational or SLO

- service level indicator, population/window and target;
- telemetry names, alert ownership, diagnosis and recovery obligation;
- capacity envelope, degradation behavior and dependency budget.

Define denominator, exclusions, measurement location and whether the target is a proposed SLO
or an existing commitment. A recovery obligation needs its scope and evidence; do not infer
RTO/RPO from availability percentage alone.

## Compatibility evidence

For each relevant direction, identify actual artifacts and the observable assertion:

| Pair or scenario                                   | What to establish                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Old consumer with new producer                     | Existing inputs/results/errors retain supported semantics, including unknown fields/enum values        |
| New consumer with old producer                     | Missing/defaulted fields and old failure shapes remain understood                                      |
| New reader with retained old records               | Archived writer versions decode and preserve intended meaning                                          |
| Rollback reader with records written after rollout | Reverting code can still read new writes, or the rollback limit is explicit                            |
| Repeated request after response loss               | Duplicate handling preserves the declared effect and outcome, including key reuse with changed payload |

These are applicability prompts, not five mandatory tests. Select supported combinations
from rollout and retention evidence. Distinguish syntax/code generation, wire decoding,
business semantics and deployed configuration; passing one does not establish the others.
Route format-specific rules to `schema-evolution-and-compatibility` and remote protocol
details to `rpc-and-api-contracts`, checking their claims against the actual versions.

## Acceptance check

A contract is acceptable when an independent party can answer: what may I send or rely on, what can
fail, what must I do then, which versions coexist, who owns it, and what evidence proves compatibility.
At definition time, planned tests may specify that proof; label them pending rather than
claiming compatibility was observed. For example, "an extra enum value is additive" is not
sufficient: require the supported old consumer's defined behavior for that value.
