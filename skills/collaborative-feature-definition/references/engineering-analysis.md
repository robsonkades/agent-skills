# Engineering Analysis for a Product Feature

Read this only after a Product Feature's business definition has been accepted and handed to an
identified architect or senior engineer. This is a companion artefact: preserve the product baseline
and link decisions back to it.

## Required structure

```markdown
# Engineering Analysis: <Product Feature title>

Status: Not started | In progress | Blocked on product decision | Complete
Engineering owner: <architect or senior engineer>
Input feature revision: <immutable identifier or date>
Engineering-analysis revision: <immutable identifier or date>
Workshop depth: Light | Standard | Deep
Depth drivers: <evidence supporting the selected depth>
Reviewed product owner: <person or accountable role>

## Engineering summary

<Feasibility, recommended direction, principal impacts, and whether product intent must be reopened.>

## Context and evidence

<Relevant current architecture, code, contracts, telemetry, incidents, standards, and sources.>

## Premises and constraints

<Label each item: imposed constraint, evidenced fact, proposed premise, or assumption with falsifier.>

## Feasibility questions and PoCs

<For each uncertainty: EXP-* from feature-feasibility-experiment, including decision, hypothesis,
threshold, evidence, conclusion, owner and cleanup. Prototype code is not production design.>

## Options and engineering decisions

<Options considered, trade-offs, decision owner, rationale, reversibility, and reopening trigger.>

## ADRs

<Required ADRs with status and links, or a reason each consequential choice does not warrant one.>

## Contracts

### APIs and integrations

<CT-* from feature-contract-definition: consumers/providers, semantics, failures, security,
idempotency, evolution, compatibility, ownership and authoritative specification.>

### Events and data

<CT-* for schemas, semantics, ordering/delivery, ownership, retention, migration, compatibility and
authoritative specification.>

### Operational and security contracts

<SLOs, capacity envelope, telemetry, alerts, access boundaries, audit, support and recovery obligations.>

## Delivery and lifecycle

<Dependencies, sequencing, migration, deployment, feature control, rollback, cleanup and recovery.>

## Technical criteria

<Identified, measurable criteria with verification and traceability to product acceptance, risk, or
engineering necessity.>

## Traceability

<Map BAC/rules/risks to engineering decisions, contracts and TC items, then TC items to EV evidence.>

## Decision authority

<For each consequential decision: ID, accountable owner, consulted roles, status and source.>

## Risks and unresolved questions

<RISK-* with signal, consequence, mitigation/fallback or GAP-*; blockers are explicit.>

## Accepted gaps

<None, or GAP items with reason, consequence, authorized owner, expiry and reopening trigger.>

## Engineering decomposition

<None with reason, or independently valuable/testable TF-* and enabling RES-*.>

## Readiness conclusion

<Complete | blocked, with missing evidence/decision, owner, and next action.>

## Revision history and approval

<Revision, semantic change and impact, stale downstream items, approval owner/date and status.>

## Independent validation

<Not run, or normalized feature-engineering status, reasons, affected IDs and validation revision.>
```

## Decision rules

- Begin from the accepted business-definition revision. If it is mutable or unidentified, stop and
  repair the handoff before making contracts.
- A PoC answers one material uncertainty. State the decision its result will change before running it;
  time-boxing alone does not make an experiment useful.
- Use `architecture-decision-making` for a consequential, cross-boundary, costly-to-reverse choice.
  Link the ADR instead of duplicating its complete rationale here.
- A contract must name ownership and failure semantics, not only the happy-path shape. Keep the
  authoritative OpenAPI, AsyncAPI, schema, or equivalent artefact linked rather than copying a version
  that will drift.
- Trace every technical criterion and decision to `BAC-*`, a numbered business rule, a risk, or a
  stated engineering necessity. Untraced design is either speculative or missing its justification.
- If engineering needs a product trade-off, set status to `Blocked on product decision`, state options
  and consequences, and return that question to the product owner. Resume against a new accepted
  business-definition revision.

## Technical criterion format

```text
TC-01   Under <load/failure/environment>, <measurable technical property> holds.
        Trace: <BAC-ID, business rule, risk, or engineering necessity>
        Verify: <test, benchmark, experiment, inspection, or runbook exercise>
```

Analysis is complete only when linked artefacts have an owner and usable status. A planned PoC, draft
ADR, or unspecified contract is an explicit blocker unless an accountable engineering owner accepts
the risk and `feature-engineering` agrees it is non-blocking for the next lifecycle phase.
