---
name: feature-decomposition
description: >
  Deciding whether a feature should be split at all and, when it should, into what: stories only
  where they carry value someone can state, technical stories for work that is real but not
  user-visible, and below both a flat list of implementation resources with identifiers,
  dependencies and their own validation. Use when a feature is about to be implemented as one
  undifferentiated lump, when a small change is being ceremonially split into stories nobody
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

The output that always matters is the **resource list**. Stories above it are optional and often
unnecessary; resources are what gets implemented, validated and tracked.

## Workflow

1. **Test whether to decompose at all.** If the feature is one resource, say so and produce a
   one-line list. That is a complete answer.
2. **Produce the resource list first**, from the impact map. Each element in the map becomes a
   resource or joins one; nothing in the map is unaccounted for.
3. **Give each resource an identifier, a dependency list and a validation** — the fields are in
   `references/resource-catalogue.md`. A resource with no stated validation is not finished
   being defined.
4. **Group into stories only if the grouping adds something.** A story exists when someone can
   state the value of that group on its own, and when the group could be delivered without the
   others.
5. **Use a technical story for work that is real but has no user-facing value** — a migration,
   an infrastructure change, a test harness. Do not dress it as a user story; nobody is served
   by "as a developer I want a database index".
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
IF a story cannot be described by what someone can do when it is done
THEN it is a technical story, or it is not a story.

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

IF the feature is Direct-class
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
Decomposition   stories and resources | resources only | none
Because         <the signal that decided it>

US-01  <what someone can do when this exists>
  R-01  <resource>
  R-02  <resource>

TS-01  <technical work, and what it enables>
  R-03  <resource>

Unassigned resources (when there are no stories)
  R-04  <resource>

Order       R-01 -> R-02 -> R-03 -> R-04
Forced by   R-02 needs the column R-01 adds; R-04 has no dependency and may move
```

The order line is the one the execution phase reads. Everything above it is context for a human.
