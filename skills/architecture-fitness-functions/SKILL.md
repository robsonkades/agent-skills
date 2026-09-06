---
name: architecture-fitness-functions
description: >
  Define or review checks that preserve architectural qualities when a green pipeline misses
  incidents, inherited rules are skipped or unexplained, a characteristic lacks evidence,
  or a metric is being promoted to a blocking gate. Choose the measurement or rubric,
  threshold, execution site, owner and response policy; expose proxy limits and coverage gaps.
  Excludes selecting quality drivers (architecture-characteristics), implementing application
  tests (architecture-testing), pipeline composition (quality-gates), performance experiment
  thresholds (performance-regression-ci) and operational error-budget design (slo-and-alerting).
---

# Architecture Fitness Functions

An architectural fitness function assesses a stated architectural property. The
[Thoughtworks definition](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function)
includes tests, metrics and monitors; it does not require every assessment to block delivery.
This skill adds the governance decision: who interprets the result, when, and what action follows.
An advisory check can be useful; a configured gate is not proof that the intended property holds.

The governance method has no Java baseline and ships no executable Java examples. When a control
depends on Java tooling, inspect the project's compiler release/toolchains, resolved tool versions,
test runner and CI/runtime JDKs before choosing it. Applying this skill does not authorize upgrades,
preview features or new dependencies; keep unsupported tool choices conditional.

## Workflow

1. **Establish the promise and evidence.** Obtain the characteristic/scenario, protected scope,
   acceptance policy and owner. Inspect existing rules, pipeline wiring, suppressions, recent
   verdicts and relevant incidents. If the characteristic or policy is unknown, record a
   provisional interpretation and ask for the missing decision; do not invent a threshold or
   retire a check because its original author is unavailable.
2. **Triage inherited checks.** For each, record enabled/skipped state, evidence actually
   collected, protected property, observed signal/noise and response. Use history to recover
   rationale. For an escaped incident, distinguish missing coverage, wrong threshold, stale or
   absent data, bypassed execution and ignored results. An incident alone does not prove that
   tightening a threshold fixes the problem; name a replay or fixture that could confirm it.
3. **Define an evaluable contract.** Specify input population, scope/window, metric or rubric,
   threshold and justification, sampling/uncertainty, and what counts as pass, violation or
   inconclusive. Missing data, tool failure, no matching classes and an empty scan must not
   silently count as success. If evidence is unavailable, continue with a conditional design
   and list the validation still needed.
4. **Choose placement and response.** Read [catalogue.md](references/catalogue.md) when choosing
   a measurement or execution site. Pick the earliest site that can produce representative
   evidence at acceptable cost; combine PR, scheduled, runtime and manual checks where needed.
   Specify owner, detection/response time, action, exception authority and review trigger.
5. **State coverage and gaps.** Read [ungoverned.md](references/ungoverned.md) for composites,
   judgement-based checks or uncovered concerns. Multiple controls may protect one characteristic;
   one control may protect several. A single contributor still benefits from controls against
   costly errors and external drift. No contributor-count rule determines whether a check stays.
6. **Test the control and hand off.** Exercise known passing, violating and unavailable-evidence
   cases safely. Verify the actual response path: nonzero exit propagated to the gate, alert
   routed to an owner, or manual verdict recorded with follow-up. Record what was executed.
   Delegate application test implementation to `architecture-testing` and rollout/baseline
   integration to `quality-gates`.

## Decision rules

- Distinguish an assessment from its consequence. A result may trigger review, repair work,
  rollout hold or an authorized exception. Do not label every SLO a dynamic/holistic gate or
  every quality gate an architectural fitness function.
- Automated does not mean deterministic; manual does not mean arbitrary. Calibrate noisy
  measurements and human rubrics before attaching irreversible consequences.
- Green evidence covers only the stated population and property. A dependency rule cannot
  prove domain boundaries are appropriate; a vulnerability scan cannot prove security.
- Fix a violation, correct a defective check, or record an authorized, scoped exception with
  owner, expiry and compensating action. Retire only with a reason and the resulting gap or
  replacement documented. Re-running until green and silently refreezing are not remediation.
- When checks conflict, compare their scenarios, assumptions and required outcomes. Route the
  design trade-off to `architecture-trade-off-analysis`; do not relax whichever check is easier.
- Distinguish no-new-violations from required debt reduction. A stable baseline can satisfy the
  former indefinitely; a shrinking deadline needs a separate policy and measurement.

## Deliverable and reusable checker

For a small review: evidence, defect/gap, consequence, proposed adjustment and validation.
For a new control: property/scope, metric or rubric, justified threshold, evidence requirements,
site/cadence, response/exception policy, owner and known limits. Include execution cost and
unverified assumptions where material.

If a JSON governance register is used, follow [ungoverned.md](references/ungoverned.md) and run
`node scripts/check-governance-register.mjs <register.json>` from this skill's directory.
Run on register changes and on a schedule. The checker validates metadata, not actual check
execution, coverage or organizational approval. Its test command is documented in that reference.

For contested benefit claims or behavioral evaluation of this skill, read
[disagreements-and-evidence.md](references/disagreements-and-evidence.md). Do not present written
cases or checker unit tests as measured improvement in an agent's decisions.
