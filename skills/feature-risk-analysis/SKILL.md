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

A risk section is worth writing only if something changes because of it. Most do not: they list
"performance", "data integrity" and "scope", rate everything medium, and are read once.

**Detection** explains how anyone discovers the event; **fallback** states what can be done
afterward. Missing detection or recovery is itself important risk evidence. Keep the row and
its unresolved controls visible instead of discarding it as a worry.

## Workflow

1. **Derive candidates from the artefacts, not from a list of adjectives.** Every boundary
   crossing in the impact map, every standing assumption in the ledger, every decision taken
   without an answer, and every resource touching data or an integration is a candidate.
   `references/risk-register.md` gives the derivation table, the precise definition of each
   field, and the revisit procedure for the completion review.
2. **State each as an event**: something that happens, at a time, with a consequence. "The
   migration is slow" is not one; "the migration holds a lock on `orders` long enough to time out
   requests" is.
3. **Rate impact and likelihood** against a stated deployment/operation window and exposure.
   Use HIGH, MEDIUM or LOW with evidence, or UNKNOWN when evidence is insufficient; distinguish
   inherent risk from residual risk after controls actually verified.
4. **Write the detection.** What signal, seen by whom, how long after. If the honest answer is
   "a customer tells us", write that — it is the finding.
5. **Write mitigation and fallback.** Mitigation reduces probability or cost before the fact;
   fallback is what is done after. They are different fields and a register that merges them
   usually has only mitigation.
6. **Convert what is actionable into work.** A mitigation that requires code is a resource in
   the plan, not a paragraph in a document.
7. **Revisit controls and residual exposure at completion.** Link relevant input revisions,
   `IMP-*`/`ED-*`, mitigating `RES-*` and observed `EV-*`; acceptance is reconsidered when
   premises, implementation, workload or controls change.

## What to sweep

Correctness, data (loss, corruption, migration, retention), concurrency, performance,
scalability, reliability and failure handling, security and access, compatibility with existing
callers and stored data, deployment and ordering, migration and rollback, operations and
diagnosis, maintainability.

Use relevant concerns as a coverage check. Record "none identified in the inspected scope"
or "not assessed" honestly; no need to create empty rows for every category. When no dossier
exists, derive a bounded register from the request and repository evidence.

## Rating

| Level      | Impact means                                                | Probability means                                                                |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **HIGH**   | Severe loss/exposure or outage over the affected population | Expected or repeatedly observed under the stated exposure and controls           |
| **MEDIUM** | Material degradation or bounded manual recovery             | Credible failure path under the stated operating conditions                      |
| **LOW**    | Limited, bounded harm with demonstrated recovery            | Evidence supports infrequency in the stated window; not merely missing incidents |

Rate impact by consequence, not by embarrassment. Rate probability against **this** system's
history and controls, not against the general frequency of the failure class. One incident
or absent prevention alone does not establish high likelihood; no incidents does not establish
low likelihood. Record confidence, detection gaps and correlated/common-cause failures rather
than multiplying ordinal labels into a probability.

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
THEN it is a RES-* with an identifier, and it appears in the execution order.

IF a risk exists only because an assumption is unconfirmed
THEN seek repository/runtime evidence or a discriminating experiment first; ask only for
     material information that remains unavailable. Confirmation does not remove other failure paths.

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

```text
RISK-02  The dispatch consumer reprocesses an event after a redeploy
      Impact        HIGH   duplicate outbound charges
      Probability   UNKNOWN rate per redeploy not measured; replay/lost-ack path exists
      Detection     reconcile provider operation IDs and charge totals with intended effects;
                    a local unique row can hide duplicate remote charges
      Mitigation    PLANNED RES-07: local deduplication plus stable downstream operation key
                    and recovery for charge-success/local-commit-failure; CT-02/EV-07 required
      Fallback      reconcile unknown outcomes before retry/refund; assigned operator/runbook
      Status        OPEN — planned mitigation is not verified protection
      Acceptance    residual exposure/authority pending; preserve prior authorized work

RISK-05  The V42 migration locks orders for longer than the deploy window
      Impact        MEDIUM  failed requests during deploy
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
