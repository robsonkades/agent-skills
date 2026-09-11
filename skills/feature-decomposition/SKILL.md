---
name: feature-decomposition
description: >
  Deciding whether a feature should split and, when useful, defining independently valuable Product
  or Tech child features. During definition, stays at outcomes, owners and acceptance; during
  engineering delivery preparation, defines implementation resources with stable identifiers,
  dependencies and validation. Use when several outcomes are bundled together, a small change is
  being over-split, dependencies or shared work need a breakdown, or progress lacks meaningful units.
  Does not approve scope or acceptance, write the implementation plan (feature-implementation-plan),
  track delivery statuses (feature-progress-tracking), or estimate effort (estimation-under-uncertainty).
---

# Feature Decomposition

## Purpose

Decomposition commonly earns its cost through work that can be **validated
independently**, work that must be **ordered** because of a real dependency, and work that will
be **shared** across people or sessions. Outside those, a breakdown is a table of contents for a
change that would have been easier to read as a diff.

Child Product/Tech Features must remain valuable, independently decidable/deliverable, and testable.
During delivery preparation, **resources** are what gets implemented, validated and tracked.
The calling stage determines which of these outputs is needed.

## Choose the current stage

Inspect the request, current definition/analysis revision, accepted scope and any existing breakdown
before adding items. Reuse supplied IDs and authorization. If the requested stage is materially
unclear, resolve that boundary before creating a delivery breakdown.

- **Definition:** decide whether child features earn their cost. Return `PF-*` or `TF-*` with value,
  beneficiary, independently checkable acceptance, dependencies and the reason for the split, or
  a concise reason to keep one feature. Product owns Product Feature intent and `BAC-*`; Engineering
  owns Tech Features and technical criteria. Within a product-owned definition, flag technical
  enablement for the engineering handoff instead of deciding its solution or `TC-*`. Preserve
  proposed versus accepted status. Do not create delivery `RES-*`, file tasks or status ledgers
  merely because `collaborative-feature-definition` invoked this skill.
- **Delivery preparation or revision:** use the resource workflow below against the applicable
  scope and acceptance baseline. Carry criteria from their owning stage; missing or changed
  acceptance is a question for that owner, not permission to invent intent in the breakdown.

## Delivery resource workflow

1. **Test whether to decompose at all.** If the feature is one resource, say so and produce a
   one-line list. That is a complete answer.
2. **Produce the resource list first**, from the impact map. Account for each entry as scoped work,
   validation coverage or an evidenced unchanged dependency. A `READ` entry need not become an edit:
   link the resource that verifies its relied-on behavior or cite applicable existing evidence.
   Reuse the current map/scope revision. If none exists, record a minimal source-to-resource
   mapping for the known work; leave material unknowns open rather than inventing files or scope.
3. **Reuse each resource's `RES-*` identifier or assign one to new work**, with dependencies and
   validation. Read `references/resource-catalogue.md` for fields, examples and revision rules.
   A resource with no stated validation is not finished being defined.
4. **Create child features only when the grouping adds an independently valuable outcome.** A Product
   Feature uses `PF-*`; a Tech Feature uses `TF-*` and names measurable engineering value.
5. **Keep enabling work as resources by default.** A migration, component, infrastructure change, or
   test harness is `RES-*` unless it independently reduces risk/cost or enables a usable capability
   with its own acceptance. Do not manufacture a Tech Feature from a phase or layer.
6. **Order the resources** by their dependencies, and say where the order is forced versus
   merely convenient.
   Check missing IDs and cycles. A cycle calls for clarifying a shared contract, splitting a
   producer from its consumer, or merging inseparable work; do not invent a linear order over it.
7. **Say why the shape is what it is** — including "not decomposed, because it is one resource".

## When to decompose

| Signal                                                        | Decompose? |
| ------------------------------------------------------------- | ---------- |
| Parts can be validated independently                          | Yes        |
| Parts must be ordered because one produces what another needs | Yes        |
| Parts will be worked by different people or across sessions   | Yes        |
| Part of it could ship without the rest                        | Yes        |
| It is one file, one test, one behaviour                       | No         |
| The split would be by layer for its own sake                  | No         |
| The parts are only separable on paper                         | No         |

These signals justify considering a split at the current stage, not a fixed item count. Shared
work or a dependency alone does not establish independent child-feature value. Splitting one behavior
into controller, service and repository stories usually leaves incomplete outcomes. Layer-specific
delivery resources can still be useful for a real handoff or staged contract, with validation and
integration prerequisites explicit; they do not become child features merely by being testable.

## Decision rules

```text
IF a child cannot state independent product or engineering value and its own acceptance
THEN it is not a child feature. At definition, record any enabling need for the owning stage;
     during delivery breakdown, keep its work as RES-* under the parent.

IF a resource has many dependencies
THEN verify each necessary input and distinguish implementation, validation and release order.
     A legitimate integration resource may consume many outputs; count alone does not justify a split.

IF two resources always change together and are always validated together
THEN consider merging unless ownership, staged compatibility or a real handoff requires separation.

IF a resource cannot be validated without another resource existing
THEN say so in its validation, and let the order follow from it.

IF a resource lacks a path to in-scope impact and acceptance
THEN identify the missing mapping or scope decision. One impact entry can justify several
     resources, and one resource can satisfy several entries; counts are not a scope test.

IF a resource is "write the tests"
THEN it is misplaced: tests belong to the resource whose behaviour they establish.
     A separate test resource is legitimate only for shared harness or fixture work.

IF preparing a delivery breakdown for a Light feature
THEN return one concise resource with its validation when it remains one local outcome.
     If material dependencies or boundaries emerge, report the changed driver for reclassification;
     this analysis does not itself authorize implementation.
```

## Constraints

- **Do not split to look thorough.** Three resources implemented and tracked beat eleven
  resources of which six are one line each.
- **Do not decompose by layer by default.** Decompose by behaviour, and let a behaviour touch
  several layers.
- **Every resource traces to the impact map and to scope.** A resource that traces to neither is
  scope creep with an identifier.
- **Do not estimate here.** Sizes and dates are a separate concern with separate discipline.
- Preserve supplied Java/framework/runtime and compatibility constraints in each affected
  resource. Decomposition does not choose upgrades or a new technical baseline.

## Output

At definition, return only the child-feature decision and its stage-owned evidence described above.
For delivery preparation, use a proportionate version of this breakdown:

```text
Baseline        <scope and acceptance revision/source>
Decomposition   child features and resources | resources only | none
Because         <the signal that decided it>

PF-01  <independently valuable product outcome and BAC-*>
  RES-01  <resource>
  RES-02  <resource>

TF-01  <independently valuable engineering outcome and TC-*>
  RES-03  <resource>

Parent resources (including work not assigned to a child)
  RES-04  <resource>

Dependencies RES-02 needs RES-01's column; RES-03 needs RES-02's contract
Ready first  RES-01, RES-04 (no dependency between them)
Then         RES-02 -> RES-03; RES-04 may proceed independently
```

Execution consumes resource scope, acceptance, ownership and dependencies together. Independence
in the graph permits parallel planning only when shared-file/resource ownership is also resolved.
Before handoff, check scope coverage, unique/stable IDs, an acyclic dependency graph and validation
for each resource; report unresolved dependencies rather than claiming the breakdown ready.
A defined breakdown does not establish accepted scope, implementation or observed validation.
