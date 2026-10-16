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
Independence does not require zero prerequisites: name what must already exist, then show what
usable outcome this child adds. A component that only becomes useful when its sibling arrives
remains enabling work unless it has a separate accepted engineering outcome.
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

1. **Test whether to decompose at all.** If the feature is one resource, a concise `RES-*` entry
   is sufficient: retain its identity, scope, applicable acceptance and validation, plus relevant
   prerequisites and shared ownership. A short answer still satisfies those obligations.
2. **Derive resources from both the impact map and accepted criteria.** Account for each map entry as scoped work,
   validation coverage or an evidenced unchanged dependency. A `READ` entry need not become an edit:
   link the resource that verifies its relied-on behavior or cite applicable existing evidence.
   Keep alternatives and Optional/Recommended proposals outside the delivery resource list unless
   selected in the accepted baseline; their presence in the map does not select them. Preserve
   explicitly accepted obligations even if a proposal later labels them optional. Record these
   dispositions against the baseline.
   Reuse the current map/scope revision. If none exists, record a minimal source-to-resource
   mapping for the known work; leave material unknowns open rather than inventing files or scope.
   When a split or prerequisite depends on a claim in that map, open its linked contract, code,
   fixture or check and confirm the relevant semantics and revision. Reuse sufficient current
   evidence; do not repeat the entire impact analysis. A proposed path or unavailable artifact
   is not a ready input. Route contradictions to the owning analysis and keep affected work provisional.
3. **Reuse each resource's `RES-*` identifier or assign one to new work**, with dependencies and
   validation. Read `references/resource-catalogue.md` for fields, coverage checks and revision rules.
   A resource with no stated validation is not finished being defined.
4. **Create child features only when the grouping adds an independently valuable outcome.** A Product
   Feature uses `PF-*`; a Tech Feature uses `TF-*` and names measurable engineering value.
5. **Keep enabling work as resources by default.** A migration, component, infrastructure change, or
   test harness is `RES-*` unless it independently reduces risk/cost or enables a usable capability
   with its own acceptance. Do not manufacture a Tech Feature from a phase or layer.
6. **Order the resources** by implementation prerequisites, with validation/release gates identified
   separately, and say where the order is forced versus merely convenient. Check missing IDs and
   cycles in the required order. A cycle calls for clarifying a shared contract, separating the
   relevant readiness milestones, or merging inseparable work; do not invent a linear order over it.
7. **Say why the shape is what it is** — including "not decomposed, because it is one resource".
   For a consequential choice, retain the deciding evidence and what changed constraint would
   require revisiting it: acceptance, contract stability, deployment compatibility or ownership.
   A previous successful split is useful under those conditions, not a universal template.

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

### Find a useful slice

Start with the smallest complete outcome for a named beneficiary. Try a meaningful operation,
workflow path or supported input category before dividing technical layers. Each candidate must
answer: can its beneficiary use the result with the named prerequisites, and can its acceptance
be checked without pretending unfinished siblings exist? Compare keeping one feature with the
best useful split; do not enumerate every possible partition.

For example, exporting one supported format may be useful before adding another. Export generation
without the accepted tenant-access check is an incomplete slice. Preserve required rejection,
recovery, security and compatibility behavior for every slice where it applies; "happy path first"
does not move those obligations into optional follow-up work. Reducing supported inputs or quality
is a scope proposal until the accountable owner accepts it.

Bill Wake's [INVEST guidance](https://xp123.com/invest-in-good-stories-and-smart-tasks/) supports
valuable slices across layers and acknowledges that full independence is not always achievable.
His [splitting dimensions](https://xp123.com/twenty-ways-to-split-stories/) are candidate boundaries;
the accepted feature baseline determines which simplifications are permissible here.

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
THEN name the validation gate and its prerequisites. Do not infer implementation order from
     validation order when an agreed contract or fixture permits independent implementation.

IF a missing contract, environment or external commitment determines a boundary or dependency
THEN name the affected resources, required evidence and accountable owner or next inspection.
     Keep that part provisional; continue independent decomposition. Do not invent a fixture,
     delivery date or approved discovery resource to make the graph appear ready.

IF a resource lacks a path to in-scope impact and acceptance
THEN identify the missing mapping or scope decision. One impact entry can justify several
     resources, and one resource can satisfy several entries; counts are not a scope test.

IF a resource is "write the tests" for another resource's behaviour
THEN keep those tests with that resource by default. Separate shared harness work, accepted
     test-coverage outcomes or cross-resource validation only when the scope or handoff warrants it.
     Name the criterion, prerequisites and shared-work owner; do not invent production changes
     for a feature whose accepted outcome is testing existing behaviour.

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

Implementation inputs  <resource -> required deliverable/contract revision + readiness evidence>
Integration/release    <affected resources -> combined check + prerequisites + owner>
Parallel candidates   <resources whose implementation inputs and shared ownership are resolved>
Unresolved            <criterion/input -> affected work + owner or next evidence to obtain>
```

Execution consumes resource scope, acceptance, ownership and dependencies together. Independence
in the graph permits parallel planning only when shared-file/resource ownership is also resolved.
Before handoff, check unique/stable IDs, the implementation dependency graph and the coverage
procedure in the resource catalogue. Retain source locators, planned checks and unresolved inputs
in the existing breakdown so the implementation plan can consume them without guessing. Update an
authorized existing artifact when persistence is required; otherwise return the same information
inline. Keep criterion meaning with its owning stage; identify which part is defined and which
part remains provisional instead of claiming all resources ready.
A defined breakdown does not establish accepted scope, implementation or observed validation.
