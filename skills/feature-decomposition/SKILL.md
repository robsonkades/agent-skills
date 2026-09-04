---
name: feature-decomposition
description: >
  Deciding whether a feature should be split at all and, when it should, into what: child features only
  where they carry independent value someone can state, Tech Features for independently useful
  engineering outcomes, and below both a flat list of implementation resources with identifiers,
  dependencies and their own validation. Use when a feature is about to be implemented as one
  undifferentiated lump, when a small change is being ceremonially split into items nobody
  needs, when work has to be ordered because parts depend on each other, when two people or two
  sessions will share the work, or when progress cannot be reported because there is nothing to
  report progress against. Does not write the plan around the breakdown
  (feature-implementation-plan), does not track the resulting statuses
  (feature-progress-tracking), and does not estimate any of it
  (estimation-under-uncertainty).
---

# Feature Decomposition

## Purpose

Decomposition earns its cost in exactly three situations: work that can be **validated
independently**, work that must be **ordered** because of a real dependency, and work that will
be **shared** across people or sessions. Outside those, a breakdown is a table of contents for a
change that would have been easier to read as a diff.

The output that always matters is the **resource list**. Child Product/Tech Features above it are
optional and must remain valuable, independently decidable/deliverable, and testable; resources are
what gets implemented, validated and tracked.

## Workflow

1. **Test whether to decompose at all.** If the feature is one resource, say so and produce a
   one-line list. That is a complete answer.
2. **Produce the resource list first**, from the impact map. Each element in the map becomes a
   resource or joins one; nothing in the map is unaccounted for.
3. **Give each resource a `RES-*` identifier, a dependency list and a validation** — the fields are in
   `references/resource-catalogue.md`. A resource with no stated validation is not finished
   being defined.
4. **Create child features only when the grouping adds an independently valuable outcome.** A Product
   Feature uses `PF-*`; a Tech Feature uses `TF-*` and names measurable engineering value.
5. **Keep enabling work as resources by default.** A migration, component, infrastructure change, or
   test harness is `RES-*` unless it independently reduces risk/cost or enables a usable capability
   with its own acceptance. Do not manufacture a Tech Feature from a phase or layer.
6. **Order the resources** by their dependencies, and say where the order is forced versus
   merely convenient.
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

Splitting one behaviour across a controller story, a service story and a repository story
produces three items none of which can be validated alone. That is not decomposition; it is
transcription of the layer diagram.

## Decision rules

```text
IF a child cannot state independent product or engineering value and its own acceptance
THEN it is not a child feature; keep its work as RES-* under the parent.

IF a resource depends on more than three others
THEN look again — usually it is two resources, or the dependencies are ordering
     preferences rather than real ones.

IF two resources always change together and are always validated together
THEN they are one resource.

IF a resource cannot be validated without another resource existing
THEN say so in its validation, and let the order follow from it.

IF the breakdown has more items than the impact map has entries
THEN it is inventing work. Every resource traces to map entries.

IF a resource is "write the tests"
THEN it is misplaced: tests belong to the resource whose behaviour they establish.
     A separate test resource is legitimate only for shared harness or fixture work.

IF the feature is Light
THEN there is no decomposition. Implement it.
```

## Constraints

- **Do not split to look thorough.** Three resources implemented and tracked beat eleven
  resources of which six are one line each.
- **Do not decompose by layer by default.** Decompose by behaviour, and let a behaviour touch
  several layers.
- **Every resource traces to the impact map and to scope.** A resource that traces to neither is
  scope creep with an identifier.
- **Do not estimate here.** Sizes and dates are a separate concern with separate discipline.

## Output

```text
Decomposition   child features and resources | resources only | none
Because         <the signal that decided it>

PF-01  <independently valuable product outcome and BAC-*>
  RES-01  <resource>
  RES-02  <resource>

TF-01  <independently valuable engineering outcome and TC-*>
  RES-03  <resource>

Parent resources (when there are no child features)
  RES-04  <resource>

Order       RES-01 -> RES-02 -> RES-03 -> RES-04
Forced by   RES-02 needs the column RES-01 adds; RES-04 has no dependency and may move
```

The order line is the one the execution phase reads. Everything above it is context for a human.
