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

The difference between that and a useful register is two fields. **Detection** — how anyone
finds out it happened — and **fallback** — what is done when it does. A risk with neither is a
worry, and worries do not belong in a plan.

## Workflow

1. **Derive candidates from the artefacts, not from a list of adjectives.** Every boundary
   crossing in the impact map, every standing assumption in the ledger, every decision taken
   without an answer, and every resource touching data or an integration is a candidate.
   `references/risk-register.md` gives the derivation table, the precise definition of each
   field, and the revisit procedure for the completion review.
2. **State each as an event**: something that happens, at a time, with a consequence. "The
   migration is slow" is not one; "the migration holds a lock on `orders` long enough to time out
   requests" is.
3. **Rate impact and probability** HIGH, MEDIUM or LOW, and say what the rating rests on.
4. **Write the detection.** What signal, seen by whom, how long after. If the honest answer is
   "a customer tells us", write that — it is the finding.
5. **Write mitigation and fallback.** Mitigation reduces probability or cost before the fact;
   fallback is what is done after. They are different fields and a register that merges them
   usually has only mitigation.
6. **Convert what is actionable into work.** A mitigation that requires code is a resource in
   the plan, not a paragraph in a document.
7. **Carry the register into the completion review.** A risk that was accepted must still be
   true at the end.

## What to sweep

Correctness, data (loss, corruption, migration, retention), concurrency, performance,
scalability, reliability and failure handling, security and access, compatibility with existing
callers and stored data, deployment and ordering, migration and rollback, operations and
diagnosis, maintainability.

Sweep all of them and write "none identified" where there is none. The empty rows are what
makes a short register credible.

## Rating

| Level      | Impact means                                    | Probability means                                   |
| ---------- | ----------------------------------------------- | --------------------------------------------------- |
| **HIGH**   | Data loss, a security exposure, or an outage    | It has happened here before, or nothing prevents it |
| **MEDIUM** | Degraded behaviour, a manual repair, a rollback | Plausible under normal operation                    |
| **LOW**    | Noticeable but recoverable without intervention | Needs an unusual combination                        |

Rate impact by consequence, not by embarrassment. Rate probability against **this** system's
history and controls, not against the general frequency of the failure class.

## Decision rules

```text
IF a risk has no detection
THEN either find one, or record that it would be found by a user — and treat that
     as the finding it is.

IF a risk is HIGH impact
THEN it needs a mitigation or a fallback before implementation starts, not before
     release. "We will monitor it" is neither.

IF the mitigation is work
THEN it is a RES-* with an identifier, and it appears in the execution order.

IF a risk exists only because an assumption is unconfirmed
THEN the mitigation is to confirm the assumption, and it is probably a question.

IF a risk is accepted
THEN create or link a GAP-* with consequence, accountable owner, expiry and reopening trigger.

IF the register is long and everything is MEDIUM
THEN it was filled from a template. Delete the rows with no detection and rate again.

IF a risk cannot be reduced, detected or recovered from
THEN it is a constraint on the design, and it belongs back in the solution phase.
```

## Constraints

- **No risk without an owner authorised to accept it.** Impact rating alone does not establish
  authority. An agent may accept only risks that are local, reversible, within explicit policy and
  the user's delegated scope. Product, operational, security, privacy, legal, financial, data-loss,
  or cross-team risks go to the accountable human owner even when probability is LOW.
- **Do not restate the general failure modes of a technology.** The register is about this
  feature's use of it, in this system.
- **Do not use the register to relitigate the design.** If the risk kills the option, that is a
  solution-phase finding, not a row.

## Output

```text
RISK-02  The dispatch consumer reprocesses an event after a redeploy
      Impact        HIGH   duplicate outbound charges
      Probability   MEDIUM at-least-once delivery, and the handler is not idempotent
      Detection     duplicate rows in dispatch_log with the same event id; no alert
                    exists today, so this would be found in reconciliation, next day
      Mitigation    RES-07: idempotency key on dispatch_log with a unique constraint
      Fallback      reconciliation job identifies duplicates; refunds are manual
      Accepted by   -    (mitigated)

RISK-05  The V42 migration locks orders for longer than the deploy window
      Impact        MEDIUM  failed requests during deploy
      Probability   LOW     the table is 40k rows (checked); the column is nullable
                            with a default applied without a rewrite on this engine
      Detection     migration duration is logged; deploy fails if it exceeds the window
      Mitigation    none required at this size
      Fallback      migration is reversible; V43 drops the column
      Accepted by   GAP-02 — Engineering owner; expires at production-readiness review
```

Close with the count by impact level, and name every HIGH risk that has no mitigation. If that
list is not empty, implementation does not start.
