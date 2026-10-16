---
name: feature-risk-analysis
description: >
  Naming what could go wrong with a specific feature in a form that can be acted on: the failure
  stated as an event rather than a worry, how anyone would find out it happened, what reduces
  its probability or its cost, and what is done if it happens anyway. Use before implementation
  on anything touching data, integrations, concurrency or a released contract, when a plan has a
  risk section containing only adjectives, when a HIGH risk has no detection signal, when a
  migration or a breaking change is about to ship, or when a review asks what happens if this
  fails and there is no answer. Does not catalogue distributed failure modes in general
  (distributed-failure-catalogue, failure-models), does not decide whether a deliberate shortcut
  is acceptable (technical-debt-decisions), and does not design the resilience mechanism
  (timeouts-and-deadlines, retries-and-backoff, circuit-breakers,
  concurrency-limiting-and-bulkheads).
---

# Feature Risk Analysis

## Purpose

Turn a feature's possible failures into decisions about controls, exposure and follow-up.
Category names such as "performance" or "data integrity" do not establish an event or its rating.

**Detection** explains how anyone discovers the event; **fallback** states what can be done
afterward. Missing detection or recovery is itself important risk evidence. Keep the row and
its unresolved controls visible instead of discarding it as a worry.

## Workflow

1. **Bound the assessment and follow the affected paths.** Identify the change, revision and
   rollout/operation window. Use the impact map, assumptions, unresolved decisions and resource
   list to derive candidates, then inspect the actual caller or producer through the changed
   operation to affected state or consumers. An upstream map is a starting point, not proof of
   coverage. Check where a claimed control acts before crediting it to another entry path.
   Read `references/risk-register.md` when deriving a register, resolving uncertain ratings,
   or revisiting one; it covers path tracing, evidence, controls and outcome review.
2. **State each as an event**: something that happens, at a time, with a consequence. "The
   migration is slow" is not one; "the migration holds a lock on `orders` long enough to time out
   requests" is.
3. **Rate impact and likelihood** against a stated deployment/operation window and exposure.
   Use HIGH, MEDIUM or LOW with evidence, or UNKNOWN when evidence is insufficient; distinguish
   inherent risk from residual risk after controls actually verified. Link the assessed revision
   and supporting evidence; distinguish an observed failure from a plausible failure path.
   Unknown likelihood does not reduce a supported impact rating.
4. **Write the detection.** What signal, seen by whom, how long after. If the honest answer is
   "a customer tells us", write that — it is the finding.
5. **Write mitigation and fallback.** Mitigation reduces probability or cost before the fact;
   fallback is what is done after. They are different fields and a register that merges them
   usually has only mitigation. When harm reduction relies on detection and response, check
   that they can act within the exposure window and that fallback remains available during
   this failure; use the control-chain check in `references/risk-register.md`.
6. **Convert what is actionable into work.** Track a mitigation that requires code in the
   applicable plan or task list, with an owner or an explicit ownership gap and validation.
7. **Revisit controls and residual exposure at completion and on material change.** Link relevant
   input revisions, control work and observed evidence; use `IMP-*`/`ED-*`, `RES-*` and `EV-*` when the feature
   workflow supplies those identifiers. Acceptance is reconsidered when premises,
   implementation, workload or controls change. Preserve the previous judgment and explain what
   new evidence changes it; record post-release observation as pending when not yet available.

## What to sweep

Correctness, data (loss, corruption, migration, retention), concurrency, performance,
scalability, reliability and failure handling, security and access, compatibility with existing
callers and stored data, deployment and ordering, migration and rollback, operations and
diagnosis, maintainability.

Use relevant concerns as a coverage check. Name the material paths inspected and relevant paths
left unassessed, with the missing evidence or access and its next check. "None identified" applies
only to that inspected scope; a failed search does not prove absence. No empty rows for every
category are needed. When no dossier exists, use the request and repository evidence directly.

## Rating

Use the project's impact and likelihood scale. If none exists, state meaningful qualitative
anchors for this feature before assigning labels; the table is a starting point, not universal
thresholds. Map evidence to each rating within the stated window, population and controls.

| Level       | Impact anchor                                               | Likelihood anchor                                                                |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **HIGH**    | Severe loss/exposure or outage over the affected population | Evidence supports expected or frequent occurrence in the stated window           |
| **MEDIUM**  | Material degradation or bounded manual recovery             | Evidence places occurrence between the stated HIGH and LOW criteria              |
| **LOW**     | Limited, bounded harm with demonstrated recovery            | Evidence supports infrequency in the stated window; not merely missing incidents |
| **UNKNOWN** | Evidence does not support a position on the impact scale    | A path is possible but evidence does not support its occurrence likelihood       |

A credible failure path alone does **not** justify MEDIUM likelihood. Distinguish the chance of
the trigger from the chance of harm given that trigger. If trigger exposure/frequency is unknown
and no verified constraint bounds the path, use UNKNOWN. Historical counts need their exposure
and observation coverage; absent prevention is not a frequency estimate. Conversely, a verified
control can rule out a bounded path without production-frequency data. Credit that proof only
within its conditions. No incidents alone does not establish low likelihood.

Rate impact from supported consequences and the project's scale, including affected users/assets,
loss magnitude, duration and recoverability where material. "Duplicate charge" or "failed request"
alone does not establish HIGH. If missing bounds prevent a rating, retain UNKNOWN and the concrete
harm; label any conservative planning assumption explicitly. A supported severe consequence may
still justify HIGH without knowing every bound. Record confidence, detection gaps and
correlated/common-cause failures rather than multiplying ordinal labels into a probability.

## Decision rules

```text
IF a risk has no detection
THEN record it as undetected unless customer discovery is supported; identify a detection
     task or state why detection is infeasible. Do not invent a signal or drop the risk.

IF a risk is HIGH impact
THEN identify the control/acceptance decision needed before the action that creates exposure.
     Implement mitigations and investigate safely within existing authorization; block only
     dependent exposure when required controls or authority remain unresolved.

IF the mitigation is work
THEN track the task and its execution order; use RES-* when working in that feature workflow.
     A standalone review needs traceable actions and evidence, not an invented dossier.

IF a risk exists only because an assumption is unconfirmed
THEN seek repository/runtime evidence or a discriminating experiment first; ask only for
     unavailable information whose answer changes the control, exposure or acceptance decision.
     State the conditional recommendation while the answer is unknown, and continue independent
     work. Confirmation does not remove other failure paths.

IF a risk is accepted
THEN link existing acceptance evidence, residual consequence, scope, owner and reopening
     trigger; use GAP-* when the feature workflow calls for a bounded accepted gap.

IF the register is long and everything is MEDIUM
THEN check specificity, duplication and rating evidence. Preserve material undetectable risks;
     register length and rating distribution alone do not prove poor analysis.

IF a risk cannot be reduced, detected or recovered from
THEN it is a constraint on the design, and it belongs back in the solution phase.
```

## Constraints

- **Record risks even when ownership is unresolved.** Separate the control implementer from
  the authority accepting residual exposure. Reuse existing user authorization/delegation and
  applicable policy; risk labels alone do not create a new approval gate. Material exposure
  outside that authority remains pending, even if its likelihood is LOW.
- **Do not restate the general failure modes of a technology.** The register is about this
  feature's use of it, in this system.
- **Return disqualifying risks to solution analysis.** Preserve the concrete risk and evidence,
  and link the decision that must change. Mark it avoided only when the revised scope or design
  removes the failure path with supporting evidence; a handoff alone does not close it.

## Output

Update the existing risk section or register when one exists. For a small change, a scoped note
with the failure path, evidence, applicable control and next check is enough; the records below
illustrate consequential cases, not mandatory fields for every concern.

```text
RISK-02  The dispatch consumer reprocesses an event after a redeploy
      Impact        UNKNOWN duplicate outbound charges; amount, affected population and
                    recovery bounds needed to apply the project's severity scale
      Probability   UNKNOWN rate per redeploy not measured; replay/lost-ack path exists
      Detection     reconcile provider operation IDs and charge totals with intended effects;
                    a local unique row can hide duplicate remote charges
      Mitigation    PLANNED RES-07: local deduplication plus stable downstream operation key
                    and recovery for charge-success/local-commit-failure; CT-02/EV-07 required
      Fallback      reconcile unknown outcomes before retry/refund; assigned operator/runbook
      Status        OPEN — planned mitigation is not verified protection
      Acceptance    residual exposure/authority pending; preserve prior authorized work

RISK-05  The V42 migration locks orders for longer than the deploy window
      Impact        UNKNOWN failed requests during deploy; affected traffic, duration and
                    recovery bounds not yet established
      Probability   UNKNOWN until target engine/version, lock contention and long transactions
                    are checked; a no-rewrite operation can still wait for an exclusive lock
      Detection     observe lock waits and application errors during the actual DDL;
                    deploy timeout alone does not prove server-side cancellation
      Mitigation    PLANNED: bounded lock acquisition, representative concurrent-load test,
                    confirmed cancellation/transaction cleanup and compatible rollout
      Fallback      abort before acquisition where possible; verify DB state after failure.
                    Retain an additive column during app rollback; dropping it can lose new data
      Acceptance    pending required evidence and applicable deployment authority
```

Close with the material open risks, control evidence and exact actions blocked by missing
controls/authority. Counts may help navigation but are not a readiness score; continue
independent authorized work and mitigation development.
