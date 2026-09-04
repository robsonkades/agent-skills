# Tech Feature document

Read this only after classifying the artefact as a Tech Feature.

## Required structure

```markdown
# <Tech Feature title naming the engineering outcome>

Type: Tech Feature
Status: Draft | In discovery | Ready for validation | Validated
Engineering owner: <architect, senior engineer, or accountable engineering role>
Tech-feature revision: <immutable identifier or date>
Workshop depth: Light | Standard | Deep
Depth drivers: <evidence supporting the selected depth>

## Objective

<One measurable desired technical state and why it matters now.>

## Problem and evidence

<Current limitation/risk/cost, baseline evidence and affected capability.>

## Engineering and product value

<Risk/cost/SLO/product enablement, beneficiary, expected outcome and measure.>

## Detailed desired state

<System behavior/capability after completion, without prematurely fixing an implementation.>

## Scope and boundaries

### In scope

### Out of scope

### Preserved behavior and compatibility

## Standards, patterns and constraints

<Authoritative standards, repository patterns, prohibited/required choices, versions and limits.>

## Technical approach and decisions

<Options considered, chosen direction, decision owner/evidence, and rejected alternatives.>

## Affected contracts, data and operations

<API/events/schema/config/security/observability/deployment/migration/rollback as applicable.>

## Technical criteria

<Measurable properties and delivery constraints, each with verification.>

## Business or service acceptance criteria

<Observable enabled outcome or explicit statement that value is internal, with its measure.>

## Traceability

<Map objectives/risks to engineering decisions and TC/SAC criteria, then criteria to EV evidence.>

## Decision authority

<For each consequential decision: ID, accountable owner, consulted roles, status and source.>

## Assumptions, dependencies and open questions

<Falsifiers, external systems/people/work, impacts and blockers.>

## Risks

<Failure event, detection, mitigation/acceptance and recovery.>

## Accepted gaps

<None, or GAP items with reason, consequence, authorized owner, expiry and reopening trigger.>

## Decomposition

<None with reason, or independently valuable/testable Tech Features and enabling resources.>

## Revision history and approval

<Revision, semantic change and impact, stale downstream items, approval owner/date and status.>

## Independent validation

<Not run, or normalized feature-engineering status, reasons, affected IDs and validation revision.>
```

## Tech-feature decisions

Do not start with the technology name unless it is an already authorized constraint. “Migrate to Kafka”
must still state the missing capability or unacceptable condition that makes a migration valuable. This
keeps alternatives visible and gives completion an outcome beyond installation.

Repository patterns are evidence of current practice, not automatically an organizational mandate.
State whether a pattern is required, recommended, merely present, or intentionally superseded.

Technical value must connect to a consumer: engineers, operators, another delivery team, a system SLO,
a security owner, or a named product feature. “Cleaner architecture” is not measurable enough.

A Tech Feature is engineering-authored from the start, so it does not use the Product Feature's
two-stage handoff. If it enables a separate Product Feature, link the accepted product revision and
keep product acceptance under product ownership.

## Criteria format

```text
TC-01   Under <representative condition>, <metric/invariant/compatibility property> holds.
        Verify: <test, benchmark, fault exercise, static gate, migration rehearsal, or observation>

SAC-01  <User/business/service capability enabled or protected by the technical change>.
        Verify: <integration test, SLO comparison, operational exercise, or stakeholder review>
```

Include numeric performance/reliability targets only when authoritative or explicitly proposed for
confirmation. “No regression” needs a baseline, metric, population and permitted tolerance.

## Decomposition examples

A migration can be split into independently deployable compatibility preparation, shadow operation,
traffic cutover, and retirement only when each slice has its own outcome and acceptance. Analysis,
coding, testing and rollout are phases/resources, not Tech Features by default.

If no child produces an independently usable or risk-reducing state, keep one Tech Feature and express
the work as implementation resources during `feature-engineering`.
