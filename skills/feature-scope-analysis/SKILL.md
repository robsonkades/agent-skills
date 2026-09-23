---
name: feature-scope-analysis
description: >
  Fixing what a feature includes and, more usefully, what it deliberately excludes: sorting
  every candidate item into required, recommended, optional, out of scope or future work,
  tracing required work to commitments and constraints, recording the benefit and authority for
  selected additions, and catching changes that arrived only because they seemed like a good idea.
  Use when a feature is being planned and its edges are undefined, when a plan has grown a
  dashboard, a refactor or an abstraction nobody
  asked for, when "while we are in there" appears, when an estimate keeps moving without the
  requirement changing, or when a reviewer cannot tell which parts of a change were requested.
  Does not keep an already-written diff honest (coding-agent-discipline), does not decide
  whether a duplication justifies an abstraction (java-dry-kiss-yagni), and does not decide
  whether a deliberate shortcut is acceptable (technical-debt-decisions).
---

# Feature Scope Analysis

## Purpose

A feature has no natural edges. Every requirement suggests an adjacent one, every component
suggests a better version of itself, and every visit to a file suggests a cleanup. Left
unstated, the edges are set by whoever is typing, and the estimate, the review and the risk all
move with them.

The valuable half of this artefact is the **out of scope** list. In scope is a plan; out of
scope is a decision, and it is the one that stops the argument later.

## Workflow

1. **Collect candidates from the request, prior decisions and available project evidence.**
   Reuse discovery/context records when present; do not require new ones to classify a small task.
   Treat examples as directional unless explicitly exhaustive. Inspect affected callers, failure
   handling, compatibility, operations and validation for necessary supporting work, while keeping
   the search tied to the requested outcome. Include anything you have caught yourself intending to do.
2. **Sort each candidate** into exactly one of the five buckets below. Every candidate is
   sorted; none is left implicit. Mark a classification provisional when its deciding fact or
   authority is unknown, name the evidence needed and block only dependent commitments.
3. **Trace every Required item** to an accepted commitment, necessary acceptance condition or
   evidenced constraint. For every item selected for delivery, record that obligation or its named
   risk/benefit, plus the source of the selection and its authority. Reuse the request, accepted
   decisions and delegated discretion; do not invent a requirement to justify an authorized benefit.
4. **Run the creep check** (`references/scope-creep-catalogue.md`) over the Required and
   Recommended buckets. The catalogue lists the additions that arrive without a requirement.
5. **Give every Out of Scope item a reason and an owner** — who excluded it, and on what basis.
   Reuse the request, accepted baseline and established authority; do not invent a Product owner
   or require another approval round. A proposed exclusion remains proposed if authority is missing.
6. **State the boundary in one sentence** a reviewer can hold in their head.

## The five buckets

| Bucket           | Test                                                                                          | If dropped                                         |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Required**     | An accepted commitment, constraint or necessary acceptance condition cannot be met without it | Agreed delivery is incomplete                      |
| **Recommended**  | Traceable to a real risk or cost, but the feature works without it                            | Ships with a named consequence                     |
| **Optional**     | Offers a benefit without an established obligation or material risk                           | Agreed acceptance remains met                      |
| **Out of scope** | Deliberately excluded from current delivery, with a reason and an owner                       | Revise affected commitments if previously included |
| **Future work**  | Sensible next step that depends on this feature existing                                      | Recorded for later, not planned                    |

Classify by consequence, not activity name. Observability, tests or hardening are Required when
needed for agreed acceptance, mandatory security or operational constraints, or sufficient
validation of the changed behavior. Additional coverage or convenience can be Recommended with
a named residual consequence. Missing formal requirement IDs does not erase a demonstrated
correctness obligation: record a provisional trace to its evidence.
Explicitly promised documentation, migration support or other deliverables are Required even
when the runtime feature works without them. An illustrative solution or a preference is not
automatically a commitment; inspect its wording and prior decisions before classifying it.
Permission to include an addition establishes authority, not by itself an obligation. If a later
accepted scope revision commits to delivering it, update its classification and delivery baseline.

## Decision rules

```text
IF an item cannot be traced to a requirement, a constraint or a named risk
THEN it is Optional at best, and probably Out of scope.

IF an item improves the feature but dropping it violates no accepted commitment, constraint or necessary acceptance condition
THEN it is not Required. State the actual benefit or residual risk rather than promoting a preference.

IF an item is a refactor of code the feature merely reads
THEN Out of scope unless the feature demonstrably needs that change to meet its obligations.
     Trace a necessary enabling change; report incidental cleanup separately.

IF an item exists because a similar system had it
THEN it needs a requirement here, or it is Out of scope.

IF the request explicitly excluded something
THEN record that source and its actual authority. Cheapness does not override the exclusion;
     a conflict with Required correctness/security work needs focused scope resolution.

IF an item would make the change hard to review or hard to revert
THEN seek a reviewable decomposition that preserves required dependencies and safe intermediate
     states. Do not detach an atomic migration or compatibility change merely to shrink a diff.

IF scope grows after the plan is agreed
THEN the growth is a change to the plan: record what justified it and who agreed.

IF a Required item is expensive, delayed or blocked
THEN report the delivery consequence and possible scope revisions; reclassification alone cannot waive the obligation.
```

## Constraints

- **Never expand scope silently.** An item that enters after agreement is announced, with what
  made it necessary.
- **Never shrink scope silently either.** Dropping a Required item without saying so is the
  same defect pointed the other way; it turns up as a missing behaviour in production.
- **Distinguish deferral from rejection.** Useful excluded work may be a future candidate;
  an unnecessary addition need not become backlog. Neither label promises later delivery.
- **Do not use scope to avoid necessary work.** Correctness, the security obligations of the
  code you are writing, and the tests that establish the behaviour are Required by definition.

## Output

```text
Boundary        <one sentence>

Required        SC-01  <item>  <- OBJ/BR/BAC or constraint it traces to
Recommended     SC-02  <item>  <- RISK or cost it addresses; consequence if dropped
Optional        SC-03  <item>  <- benefit
Out of scope    SC-04  <item>  <- reason; accountable owner who excluded it
Future work     SC-05  <item>  <- what it waits on

Delivery        <selected SC-* items with selection/authority sources; unselected proposals>
Creep check     <items examined, and what was reclassified>
```

Use existing identifiers and records; a small task may need only a boundary and a few lines,
without empty buckets or a new dossier.

Carry the accepted Out of scope list into the plan and completion review. Amendments retain the
previous decision, source, revised boundary and authority. Trace changes to affected acceptance,
resources and plan entries; update those records or mark them stale, preserving unaffected work.
An announced proposal does not replace the accepted scope, and missing implementation does not
justify rewriting acceptance to fit it.
Bucket membership is classification, not permission to implement Optional, Recommended or Future
work. State which candidates are selected for the authorized delivery and which remain proposals.
