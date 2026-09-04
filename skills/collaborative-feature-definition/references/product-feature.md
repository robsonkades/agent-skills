# Product Feature document

Read this only after classifying the artefact as a Product Feature.

## Required structure

```markdown
# <Feature title in domain language>

Type: Product Feature
Status: Draft | In discovery | Business definition agreed | Engineering analysis pending |
Ready for validation | Validated
Product owner: <person or accountable role>
Business-definition revision: <identifier or date>
Workshop depth: Light | Standard | Deep
Depth drivers: <evidence supporting the selected depth>

## Objective

<One clear desired change, beneficiary, and reason it matters.>

## Problem and evidence

<Current problem/opportunity, affected audience, observed evidence and baseline.>

## Value and expected outcome

<What becomes possible or improves; leading/lagging measure where available.>

## Detailed description

<End-to-end behavior and workflow from the user's/business perspective.>

## Scope

### In scope

### Out of scope

### Future or optional

## Business rules and examples

<Numbered rules, examples, boundaries, permissions and calculations.>

## Failure and edge behavior

<Invalid input, unavailability, duplicate/retry, concurrency, cancellation and partial success.>

## Dependencies and constraints

<Other teams/systems, policy, legal/security, data, compatibility, deadline if authoritative.>

## Known engineering constraints and dependencies

<Externally imposed constraints and known dependencies only. Mark their source and authority. Do not
define solution contracts, architecture, or implementation premises here.>

## Business acceptance criteria

<Observable outcomes and rules, each with verification.>

## Traceability

<Map OBJ/BR items to BAC items; identify any objective or rule that is not yet verifiable.>

## Engineering analysis handoff

Required: Yes | No | To assess
Status: Not started | Pending owner | In progress | Complete | Not required
Engineering owner: <architect or senior engineer; must differ from the product-definition author>
Reason: <trigger for analysis, or accountable engineering rationale for not requiring it>
Analysis: <link or embedded companion section when complete>

## Assumptions, decisions and open questions

<Each assumption has a falsifier; each decision has owner/source; each question has impact.>

## Decision authority

<For each consequential decision: ID, accountable owner, consulted roles, status and source.>

## Risks

<Failure event, signal, mitigation or acceptance owner.>

## Accepted gaps

<None, or GAP items with reason, consequence, authorized owner, expiry and reopening trigger.>

## Decomposition

<None with reason, or child Features/Tech Features with dependency and independent acceptance.>

## Revision history and approval

<Revision, semantic change and impact, stale downstream items, approval owner/date and status.>

## Independent validation

<Not run, or normalized feature-engineering status, reasons, affected IDs and validation revision.>
```

## Product-specific decisions

The objective is not a solution. “Add push notifications” becomes the intended behavior and outcome;
the delivery channel belongs in rules or a decision only if already authoritative.

Value must name a beneficiary and a change. Revenue is not the only value: reduced completion time,
fewer errors, access to a capability, lower operational burden, or compliance with an established
obligation can qualify when observable.

Describe the happy path and the decisions at boundaries. Screen-by-screen prose is useful only when UI
sequence is itself part of the behavior; implementation component inventories belong to later planning.

## Criteria format

Use stable identifiers:

```text
BAC-01  Given <relevant state>, when <business event>, then <observable result>.
        Verify: <test, demonstration, metric, or authorized review>
```

Given/When/Then is optional. A declarative rule is better when no event sequence exists. Keep technical
mechanisms out of BAC items unless the mechanism is itself a contractual product requirement. Technical
criteria are added by the engineering-analysis owner, not guessed during product definition.

## Handoff rule

The product author may describe the outcome a contract must enable, known consumers, business data,
and compatibility promises. They do not choose endpoints, payloads, schemas, protocols, storage,
deployment topology, or architectural patterns. Capture those as engineering questions and end the
product stage with a versioned, accepted baseline.

If engineering finds that the baseline is infeasible, disproportionately costly, or internally
contradictory, it proposes the consequence and reopens only the affected product decision. It does not
edit business intent or acceptance unilaterally.

## Decomposition examples

Good children expose separately usable outcomes, such as “customer can save a draft” followed by
“customer can submit a saved draft.” Each can be accepted independently.

A frontend child and backend child are not independent product features when neither works alone. Keep
them as implementation resources under one feature.
